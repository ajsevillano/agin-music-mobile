import { Child } from '@lib/types';
import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCache } from '@lib/hooks/useCache';
import { useApi, useApiHelpers, useCoverBuilder, useServer, useSubsonicParams, useSetting } from '@lib/hooks';
import qs from 'qs';
import { SheetManager } from 'react-native-actions-sheet';
import * as Haptics from 'expo-haptics';
import { TrackPlayer, PlayerQueue, useOnPlaybackProgressChange, useOnChangeTrack, TrackItem } from 'react-native-nitro-player';
import showToast from '@lib/showToast';
import { IconExclamationCircle } from '@tabler/icons-react-native';
import { shuffleArray } from '@lib/util';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type RepeatModeValue = 'off' | 'Playlist' | 'track';

export type ClearConfirmOptions = {
    wait?: boolean;
    onConfirm?: () => void;
}

export type QueueReplaceOptions = {
    initialIndex?: number;
    source?: QueueSource;
    shuffle?: boolean;
}

export type TQueueItem = TrackItem & { _child: Child };

export type QueueSource = {
    source: 'playlist' | 'album' | 'artist' | 'library' | 'search' | 'none';
    sourceId?: string;
    sourceName?: string;
}

const initialSource: QueueSource = {
    source: 'none',
}

export type QueueContextType = {
    queue: TQueueItem[];
    source: QueueSource;
    nowPlaying: Child;
    activeIndex: number;
    canGoForward: boolean;
    canGoBackward: boolean;
    setQueue: (queue: TQueueItem[]) => void;
    add: (id: string) => Promise<boolean>;
    clear: () => void;
    clearConfirm: (options?: ClearConfirmOptions) => Promise<boolean>;
    jumpTo: (index: number) => void;
    skipBackward: () => void;
    skipForward: () => void;
    replace: (items: Child[], options?: QueueReplaceOptions) => void;
    playTrackNow: (id: string) => Promise<boolean>;
    playNext: (id: string) => Promise<boolean>;
    repeatMode: RepeatModeValue;
    changeRepeatMode: (mode: RepeatModeValue) => Promise<void>;
    cycleRepeatMode: () => Promise<void>;
    toggleStar: () => Promise<void>;
    reorder: (from: number, to: number) => void;
}

const initialQueueContext: QueueContextType = {
    queue: [],
    source: initialSource,
    nowPlaying: {
        id: '',
        isDir: false,
        title: '',
    },
    activeIndex: 0,
    canGoBackward: false,
    canGoForward: false,
    setQueue: () => { },
    add: async (id: string) => false,
    clear: () => { },
    clearConfirm: async () => false,
    jumpTo: (index: number) => { },
    skipBackward: () => { },
    skipForward: () => { },
    replace: (items: Child[]) => { },
    playTrackNow: async (id: string) => false,
    playNext: async (id: string) => false,
    repeatMode: 'off',
    changeRepeatMode: async () => { },
    cycleRepeatMode: async () => { },
    toggleStar: async () => { },
    reorder: () => { },
}

export const QueueContext = createContext<QueueContextType>(initialQueueContext);

export type StreamOptions = {
    id: string;
    maxBitRate?: string;
    format?: string;
    timeOffset?: string;
    estimateContentLength?: boolean;
}

export default function QueueProvider({ children }: { children?: React.ReactNode }) {
    const [queue, setQueue] = useState<TQueueItem[]>([]);
    const [nowPlaying, setNowPlaying] = useState<Child>(initialQueueContext.nowPlaying);
    const [activeIndex, setActiveIndex] = useState<number>(0);
    const [source, setSource] = useState<QueueSource>(initialSource);
    const [repeatMode, setRepeatMode] = useState<RepeatModeValue>('off');
    const playlistIdRef = useRef<string>('agin-queue');
    const trackChildMapRef = useRef<Map<string, Child>>(new Map());
    // Reference to the source list currently loaded (unshuffled) into the native player.
    // Lets `replace` skip rebuilding the whole native playlist when the user taps another
    // song from the same list (e.g. the full library). Invalidated by any other mutation.
    const loadedListRef = useRef<Child[] | null>(null);

    const canGoBackward = nowPlaying.id != '';
    const canGoForward = activeIndex < (queue.length ?? 0) - 1;

    const cache = useCache();
    const api = useApi();
    const params = useSubsonicParams();
    const { server } = useServer();
    const cover = useCoverBuilder();
    const helpers = useApiHelpers();
    const maxBitRate = useSetting('streaming.maxBitRate') as string | undefined;
    const streamingFormat = useSetting('streaming.format') as string | undefined;
    const persistQueue = useSetting('app.persistQueue') as boolean | undefined;

    const progressRef = useRef<number>(0);
    const { position: playbackPosition } = useOnPlaybackProgressChange();
    useEffect(() => {
        progressRef.current = playbackPosition;
    }, [playbackPosition]);

    useEffect(() => {
        (async () => {
            if (nowPlaying.id == '' || !api) return;

            await api.get('/scrobble', { params: { id: nowPlaying.id } });
        })();
    }, [api, nowPlaying]);

    // Precompute the auth + streaming-quality query string once. Building a queue from the
    // whole library maps thousands of tracks, so we avoid running qs.stringify per track and
    // only append the per-track id (and any per-call extras) by concatenation.
    const streamQueryBase = useMemo(() => {
        const base: Record<string, any> = { ...(params ?? {}) };
        if (maxBitRate && maxBitRate !== '0') base.maxBitRate = maxBitRate;
        if (streamingFormat && streamingFormat !== 'raw') base.format = streamingFormat;
        return qs.stringify(base);
    }, [params, maxBitRate, streamingFormat]);

    const generateMediaUrl = useCallback((options: StreamOptions) => {
        const { id, ...extra } = options;
        const extraStr = qs.stringify(extra);
        return `${server.url}/rest/stream?${streamQueryBase}&id=${encodeURIComponent(id)}${extraStr ? `&${extraStr}` : ''}`;
    }, [server.url, streamQueryBase]);

    const convertToTrackItem = useCallback((data: Child): TQueueItem => {
        const uniqueId = `${data.id}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        return {
            id: uniqueId,
            title: data.title ?? '',
            artist: data.artist ?? '',
            album: data.album ?? '',
            duration: data.duration ?? 0,
            url: generateMediaUrl({ id: data.id }),
            artwork: cover.generateUrl(data.coverArt || data.id),
            extraPayload: { _child: data } as any,
            _child: data,
        };
    }, [generateMediaUrl, cover.generateUrl]);

    const loadTracks = useCallback((tracks: TQueueItem[]) => {
        // Rebuilding the native playlist invalidates the fast-path reference; `replace`
        // sets it again right after when it loaded an unshuffled source list.
        loadedListRef.current = null;
        try { PlayerQueue.deletePlaylist(playlistIdRef.current); } catch (e) {}
        const newId = PlayerQueue.createPlaylist('agin-queue');
        playlistIdRef.current = newId;
        if (tracks.length > 0) {
            PlayerQueue.addTracksToPlaylist(newId, tracks);
        }
        PlayerQueue.loadPlaylist(newId);
        tracks.forEach(t => trackChildMapRef.current.set(t.id, t._child));
    }, []);

    const updateNowPlaying = useCallback(async () => {
        try {
            const currentIndex = await TrackPlayer.getCurrentTrackIndex();
            const currentQueue = await TrackPlayer.getActualQueue();
            if (currentIndex < 0 || !currentQueue || currentQueue.length === 0) return;

            const track = currentQueue[currentIndex];
            if (!track) return;

            const child = trackChildMapRef.current.get(track.id);
            if (child) {
                setNowPlaying(child);
            } else {
                setNowPlaying({
                    id: track.id,
                    isDir: false,
                    title: track.title,
                    artist: track.artist,
                    album: track.album,
                    duration: track.duration,
                });
            }
        } catch (e) {
            // Error updating now playing
        }
    }, []);

    const updateQueue = useCallback(async () => {
        try {
            const currentQueue = await TrackPlayer.getActualQueue();
            const enrichedQueue = (currentQueue ?? []).map(track => ({
                ...track,
                _child: trackChildMapRef.current.get(track.id) ?? {
                    id: track.id,
                    isDir: false,
                    title: track.title,
                    artist: track.artist,
                    album: track.album,
                    duration: track.duration,
                },
            })) as TQueueItem[];
            setQueue(enrichedQueue);
        } catch (e) {
            // Error updating queue
        }
    }, []);

    const updateActive = useCallback(async () => {
        try {
            const currentIndex = await TrackPlayer.getCurrentTrackIndex();
            if (currentIndex >= 0) {
                setActiveIndex(currentIndex);
            }
        } catch (e) {
            // Error updating active index
        }
    }, []);

    useEffect(() => {
        updateNowPlaying();
        updateQueue();
        updateActive();
    }, []);

    // Persist the (heavy) queue contents only when the queue, its source or the repeat mode
    // change — NOT on every track change. The queue can hold thousands of songs, so writing
    // it on each activeIndex change would re-serialize the whole thing to disk constantly
    // and cause stutter while playing.
    useEffect(() => {
        if (persistQueue) {
            const stateToSave = {
                queue: queue.map(q => q._child),
                source,
                repeatMode,
            };
            AsyncStorage.setItem('@agin:queue_state', JSON.stringify(stateToSave)).catch(console.error);
        } else if (persistQueue === false) {
            AsyncStorage.removeItem('@agin:queue_state').catch(console.error);
            AsyncStorage.removeItem('@agin:queue_index').catch(console.error);
        }
    }, [queue, source, repeatMode, persistQueue]);

    // Persist just the active index (a tiny value) on every track change.
    useEffect(() => {
        if (persistQueue) {
            AsyncStorage.setItem('@agin:queue_index', String(activeIndex)).catch(console.error);
        }
    }, [activeIndex, persistQueue]);

    useEffect(() => {
        const restoreQueue = async () => {
            try {
                const persistSetting = await AsyncStorage.getItem('settings.app.persistQueue');
                if (persistSetting !== 'true') return;

                const savedStateStr = await AsyncStorage.getItem('@agin:queue_state');
                if (savedStateStr) {
                    const savedState = JSON.parse(savedStateStr);
                    if (savedState.queue && savedState.queue.length > 0) {
                        const tracks = savedState.queue.map(convertToTrackItem);
                        loadTracks(tracks);
                        // Active index lives in its own key now; fall back to the legacy
                        // field for queues saved before this split.
                        const savedIndexStr = await AsyncStorage.getItem('@agin:queue_index');
                        const restoredIndex = savedIndexStr != null ? parseInt(savedIndexStr, 10) : savedState.activeIndex;
                        if (restoredIndex !== undefined && !Number.isNaN(restoredIndex)) {
                            await TrackPlayer.skipToIndex(restoredIndex);
                        }
                        if (savedState.source) {
                            setSource(savedState.source);
                        }
                        if (savedState.repeatMode) {
                            setRepeatMode(savedState.repeatMode);
                            TrackPlayer.setRepeatMode(savedState.repeatMode);
                        }
                        await updateQueue();
                        await updateActive();
                        await updateNowPlaying();
                    }
                }
            } catch (e) {
                console.error('Failed to restore queue state', e);
            }
        };

        TrackPlayer.getActualQueue().then(currentQueue => {
            if (!currentQueue || currentQueue.length === 0) {
                restoreQueue();
            }
        });
    }, []);

    const { track: changedTrack } = useOnChangeTrack();

    useEffect(() => {
        if (!changedTrack) return;

        const child = trackChildMapRef.current.get(changedTrack.id);
        if (child) {
            setNowPlaying(child);
        } else {
            setNowPlaying({
                id: changedTrack.id,
                isDir: false,
                title: changedTrack.title,
                artist: changedTrack.artist,
                album: changedTrack.album,
                duration: changedTrack.duration,
            });
        }
        updateActive();
    }, [changedTrack, updateActive]);

    const modifyQueue = useCallback(async (tracks: TQueueItem[]): Promise<void> => {
        try {
            const currentQueue = await TrackPlayer.getActualQueue();
            const state = await TrackPlayer.getState();
            const currentlyPlaying = state?.currentIndex ?? null;

            if (currentlyPlaying === null || !currentQueue || currentQueue.length === 0) {
                loadTracks(tracks);
                await updateQueue();
                await updateActive();
                return;
            }

            const currentlyPlayingMetadata = currentQueue[currentlyPlaying];
            const newCurrentIndex = tracks.findIndex(track => track.id === currentlyPlayingMetadata?.id);

            loadTracks(tracks);
            if (newCurrentIndex >= 0) {
                await TrackPlayer.skipToIndex(newCurrentIndex);
            }

            await updateQueue();
            await updateActive();
        } catch (e) {
            // Error modifying queue
        }
    }, [loadTracks]);

    const reorder = useCallback(async (from: number, to: number) => {
        try {
            const track = queue[from];
            if (!track) return;

            loadedListRef.current = null;
            PlayerQueue.reorderTrackInPlaylist(playlistIdRef.current, track.id, to);
            
            setQueue(prevQueue => {
                const newQueue = [...prevQueue];
                const [removed] = newQueue.splice(from, 1);
                newQueue.splice(to, 0, removed);
                return newQueue;
            });

            setActiveIndex(prevIndex => {
                if (from === prevIndex) return to;
                if (from < prevIndex && to >= prevIndex) return prevIndex - 1;
                if (from > prevIndex && to <= prevIndex) return prevIndex + 1;
                return prevIndex;
            });
        } catch (e) {
            // Error reordering queue
        }
    }, [queue]);

    const add = useCallback(async (id: string) => {
        const data = await cache.fetchChild(id);
        if (!data) return false;

        loadedListRef.current = null;
        const trackItem = convertToTrackItem(data);
        trackChildMapRef.current.set(trackItem.id, data);
        const currentQueue = await TrackPlayer.getActualQueue();

        if (!currentQueue || currentQueue.length === 0) {
            loadTracks([trackItem]);
            TrackPlayer.play();
            setNowPlaying(data);
        } else {
            PlayerQueue.addTrackToPlaylist(playlistIdRef.current, trackItem);
        }

        await updateQueue();
        await updateActive();
        return true;
    }, [cache, convertToTrackItem, loadTracks]);

    const playNext = useCallback(async (id: string) => {
        const data = await cache.fetchChild(id);
        if (!data) return false;

        loadedListRef.current = null;
        const trackItem = convertToTrackItem(data);
        trackChildMapRef.current.set(trackItem.id, data);
        PlayerQueue.addTrackToPlaylist(playlistIdRef.current, trackItem);
        await TrackPlayer.playNext(trackItem.id);

        await updateQueue();
        await updateActive();
        return true;
    }, [cache, convertToTrackItem]);

    const playTrackNow = useCallback(async (id: string) => {
        const data = await cache.fetchChild(id);
        if (!data) {
            await showToast({
                title: 'Track Not Found',
                subtitle: 'The track you\'re trying to play does not exist on this server.',
                icon: IconExclamationCircle,
                haptics: 'error',
            });
            return false;
        }

        const trackItem = convertToTrackItem(data);
        loadTracks([trackItem]);
        await TrackPlayer.seek(0);
        TrackPlayer.play();

        setNowPlaying(data);
        await updateQueue();
        await updateActive();
        return true;
    }, [cache, convertToTrackItem, loadTracks]);

    const replace = useCallback(async (items: Child[], options?: QueueReplaceOptions) => {
        const shuffle = !!options?.shuffle;
        const initialIndex = options?.initialIndex ?? 0;

        // Fast path: the same (unshuffled) source list is already loaded in the native
        // player — typically tapping another song in the full library. Just jump to the
        // requested index instead of rebuilding a playlist of thousands of tracks.
        if (!shuffle && loadedListRef.current === items) {
            if (options?.source) setSource(options.source);
            await TrackPlayer.skipToIndex(initialIndex);
            await TrackPlayer.seek(0);
            TrackPlayer.play();
            setNowPlaying(items[initialIndex]);
            setActiveIndex(initialIndex);
            await updateQueue();
            return;
        }

        let itemsCopy = [...items];
        if (shuffle) itemsCopy = shuffleArray(itemsCopy);
        if (options?.source) setSource(options.source);

        const tracks = itemsCopy.map(convertToTrackItem);
        loadTracks(tracks);
        // Remember the source list so subsequent taps on the same list take the fast path.
        if (!shuffle) loadedListRef.current = items;

        if (initialIndex > 0) {
            await TrackPlayer.skipToIndex(initialIndex);
        }
        await TrackPlayer.seek(0);
        TrackPlayer.play();

        setNowPlaying(itemsCopy[initialIndex]);
        setActiveIndex(initialIndex);
        await updateQueue();
    }, [convertToTrackItem, loadTracks, updateQueue]);

    const clear = useCallback(async () => {
        TrackPlayer.pause();
        loadTracks([]);

        setQueue([]);
        setNowPlaying(initialQueueContext.nowPlaying);
        trackChildMapRef.current.clear();
    }, [loadTracks]);

    const clearConfirm = useCallback(async (options?: ClearConfirmOptions) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

        const confirmed = await SheetManager.show('confirm', {
            payload: {
                title: 'Clear Queue',
                message: 'Are you sure you want to clear the queue?',
                confirmText: 'Clear',
                cancelText: 'Cancel',
            },
        });
        if (!confirmed) return false;

        if (options?.wait) {
            TrackPlayer.pause();
            if (options?.onConfirm) options.onConfirm();
            await new Promise(r => setTimeout(r, 500));
        }

        clear();
        return true;
    }, [clear]);

    const jumpTo = useCallback(async (index: number) => {
        await TrackPlayer.skipToIndex(index);
        await updateActive();
        await updateNowPlaying();
    }, [updateActive, updateNowPlaying]);

    const skipForward = useCallback(async () => {
        await TrackPlayer.skipToNext();
        await updateActive();
        await updateNowPlaying();
    }, [updateActive, updateNowPlaying]);

    const skipBackward = useCallback(async () => {
        const position = progressRef.current;

        if (position > 5) {
            await TrackPlayer.seek(0);
        } else {
            await TrackPlayer.skipToPrevious();
            await updateActive();
            await updateNowPlaying();
        }
    }, [updateActive, updateNowPlaying]);

    const changeRepeatMode = useCallback(async (mode: RepeatModeValue) => {
        setRepeatMode(mode);
        TrackPlayer.setRepeatMode(mode);
    }, []);

    const cycleRepeatMode = useCallback(async () => {
        if (repeatMode === 'off') {
            await changeRepeatMode('Playlist');
        } else if (repeatMode === 'Playlist') {
            await changeRepeatMode('track');
        } else {
            await changeRepeatMode('off');
        }
    }, [repeatMode]);

    const setStarred = useCallback(async (set: boolean) => {
        const starred = set ? new Date() : undefined;
        setNowPlaying(nowPlaying => ({ ...nowPlaying, starred }));
        setQueue(q => q.map(x => x.id === nowPlaying.id ? ({ ...x, starred }) : x));
    }, [queue, nowPlaying, cache]);

    const toggleStar = useCallback(async () => {
        if (!nowPlaying.id) return;

        await setStarred(!nowPlaying.starred);

        try {
            await helpers.star(nowPlaying.id, 'track', nowPlaying.starred ? 'unstar' : 'star');
        } catch (error) {
            await showToast({
                haptics: 'error',
                icon: IconExclamationCircle,
                title: 'Error',
                subtitle: 'An error occurred while liking the track.',
            });
            return;
        }

        await cache.fetchChild(nowPlaying.id, true);
    }, [queue, nowPlaying, cache]);

    return (
        <QueueContext.Provider value={{
            queue,
            nowPlaying,
            canGoBackward,
            canGoForward,
            activeIndex,
            add,
            clear,
            setQueue: modifyQueue,
            jumpTo,
            skipBackward,
            skipForward,
            replace,
            clearConfirm,
            source,
            playTrackNow,
            playNext,
            repeatMode,
            changeRepeatMode,
            cycleRepeatMode,
            toggleStar,
            reorder,
        }}>
            {children}
        </QueueContext.Provider>
    )
}
