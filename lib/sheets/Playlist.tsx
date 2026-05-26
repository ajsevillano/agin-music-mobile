import { StyledActionSheet } from '@lib/components/StyledActionSheet';
import { Platform } from 'react-native';
import { SheetManager, SheetProps } from 'react-native-actions-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApiHelpers, useCoverBuilder, useDownloads, useMemoryCache, usePins, useQueue, useSetting } from '@lib/hooks';
import { useEffect } from 'react';
import SheetTrackHeader from '@lib/components/sheet/SheetTrackHeader';
import SheetOption from '@lib/components/sheet/SheetOption';
import { IconArrowsShuffle, IconCirclePlus, IconCopy, IconDownload, IconPencil, IconPin, IconPinnedOff, IconPlayerPlay, IconTrash } from '@tabler/icons-react-native';
import { formatDistanceToNow } from 'date-fns';
import { enUS, es as esLocale } from 'date-fns/locale';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import showToast from '@lib/showToast';
import { useTranslation } from 'react-i18next';

function PlaylistSheet({ sheetId, payload }: SheetProps<'playlist'>) {
    const insets = useSafeAreaInsets();
    const memoryCache = useMemoryCache();
    const cover = useCoverBuilder();
    const helpers = useApiHelpers();
    const queue = useQueue();
    const { t, i18n } = useTranslation();
    const dateLocale = i18n.language === 'es' ? esLocale : enUS;

    const copyIdEnabled = useSetting('developer.copyId');

    const downloads = useDownloads();
    const pins = usePins();
    const isPinned = pins.isPinned(payload?.id ?? '');

    const data = memoryCache.cache.playlists[payload?.id ?? ''];

    useEffect(() => {
        (async () => {
            if (!payload?.id) return;
            await memoryCache.refreshPlaylist(payload?.id);
        })();
    }, [payload?.id, memoryCache.refreshPlaylist]);

    return (
        <StyledActionSheet
            gestureEnabled={true}
            safeAreaInsets={insets}
            isModal={Platform.OS == 'android' ? false : true}
        >
            <SheetTrackHeader
                cover={{ uri: cover.generateUrl(data?.coverArt ?? '', { size: 128 }) }}
                coverCacheKey={`${data?.coverArt}-128x128`}
                title={data?.name}
                artist={t('sheets.playlist.subtitle', {
                    count: data?.songCount ?? 0,
                    when: data?.changed ? formatDistanceToNow(new Date(data.changed), { addSuffix: true, locale: dateLocale }) : '',
                })}
            />
            {payload?.context != 'playlist' && <SheetOption
                icon={IconPlayerPlay}
                label={t('sheets.playlist.play')}
                onPress={async () => {
                    SheetManager.hide(sheetId);
                    const newQueue = data.entry;
                    if (!newQueue) return;

                    queue.replace(newQueue, {
                        initialIndex: 0,
                        source: {
                            source: 'playlist',
                            sourceId: data.id,
                            sourceName: data.name,
                        }
                    });
                }}
            />}
            {payload?.context != 'playlist' && <SheetOption
                icon={IconArrowsShuffle}
                label={t('sheets.playlist.shuffle')}
                onPress={async () => {
                    SheetManager.hide(sheetId);
                    const newQueue = data.entry;
                    if (!newQueue) return;

                    queue.replace(newQueue, {
                        initialIndex: 0,
                        source: {
                            source: 'playlist',
                            sourceId: data.id,
                            sourceName: data.name,
                        },
                        shuffle: true,
                    });
                }}
            />}
            <SheetOption
                icon={IconPencil}
                label={t('sheets.playlist.edit')}
                onPress={() => {
                    SheetManager.hide(sheetId);
                    router.push({ pathname: '/playlists/[id]/edit', params: { id: payload?.id ?? '' } });
                }}
            />
            {payload?.context != 'playlist' && data?.entry && <SheetOption
                icon={IconDownload}
                label={t('sheets.playlist.download')}
                onPress={async () => {
                    if (!data?.entry) return;
                    SheetManager.hide(sheetId);
                    await downloads.downloadPlaylist(data.id, data.entry);
                }}
            />}
            <SheetOption
                icon={isPinned ? IconPinnedOff : IconPin}
                label={isPinned ? t('sheets.playlist.unpin') : t('sheets.playlist.pin')}
                onPress={async () => {
                    if (!payload?.id) return;
                    if (isPinned) await pins.removePin(payload?.id);
                    else await pins.addPin({
                        id: payload?.id,
                        name: data?.name ?? '',
                        description: '',
                        type: 'playlist',
                        coverArt: data?.coverArt ?? '',
                    });
                    SheetManager.hide(sheetId);
                }}
            />
            {copyIdEnabled && <SheetOption
                icon={IconCopy}
                label={t('sheets.playlist.copyId')}
                onPress={async () => {
                    await Clipboard.setStringAsync(payload?.id ?? '');
                    await showToast({
                        title: t('sheets.common.copiedId'),
                        subtitle: payload?.id,
                        icon: IconCopy,
                    });
                    SheetManager.hide(sheetId);
                }}
            />}
            <SheetOption
                icon={IconCirclePlus}
                label={t('sheets.playlist.addToPlaylist')}
                onPress={async () => {
                    if (!data.entry) return;
                    const { added } = await SheetManager.show('addToPlaylist', {
                        payload: {
                            idList: data.entry.map(x => x.id),
                        }
                    });
                    if (!added) return;
                    SheetManager.hide(sheetId);
                }}
            />
            <SheetOption
                icon={IconTrash}
                label={t('sheets.playlist.remove')}
                variant='destructive'
                onPress={async () => {
                    if (!payload?.id) return;

                    const removed = await helpers.removePlaylistConfirm(payload?.id);
                    if (!removed) return;

                    await showToast({
                        title: t('sheets.playlist.removedToast'),
                        subtitle: data?.name,
                        icon: IconTrash,
                    });

                    SheetManager.hide(sheetId);
                    router.back();
                    await memoryCache.refreshPlaylists();
                }}
            />
        </StyledActionSheet>
    );
}

export default PlaylistSheet;