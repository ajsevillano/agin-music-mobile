import { StyledActionSheet } from '@lib/components/StyledActionSheet';
import { Platform } from 'react-native';
import { SheetManager, SheetProps } from 'react-native-actions-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApi, useCoverBuilder, useDownloads, usePins, useQueue, useSetting } from '@lib/hooks';
import { useEffect, useState } from 'react';
import SheetTrackHeader from '@lib/components/sheet/SheetTrackHeader';
import SheetOption from '@lib/components/sheet/SheetOption';
import { IconArrowsShuffle, IconCopy, IconDownload, IconPin, IconPinnedOff, IconPlayerPlay } from '@tabler/icons-react-native';
import * as Clipboard from 'expo-clipboard';
import showToast from '@lib/showToast';
import { ArtistWithAlbumsID3, Child } from '@lib/types';
import { useTranslation } from 'react-i18next';

function ArtistSheet({ sheetId, payload }: SheetProps<'artist'>) {
    const insets = useSafeAreaInsets();
    const api = useApi();
    const cover = useCoverBuilder();
    const queue = useQueue();
    const downloads = useDownloads();
    const pins = usePins();
    const copyIdEnabled = useSetting('developer.copyId');
    const { t } = useTranslation();

    const isPinned = pins.isPinned(payload?.id ?? '');

    const [data, setData] = useState<ArtistWithAlbumsID3 | null>(null);

    useEffect(() => {
        (async () => {
            if (!api || !payload?.id) return;
            const res = await api.get('/getArtist', { params: { id: payload.id } });
            const artist = res.data?.['subsonic-response']?.artist as ArtistWithAlbumsID3;
            if (artist) setData(artist);
        })();
    }, [api, payload?.id]);

    const fetchAllSongs = async (): Promise<Child[]> => {
        if (!api || !data?.album?.length) return [];
        const albumPromises = data.album.map(async (album) => {
            const res = await api.get('/getAlbum', { params: { id: album.id } });
            return res.data?.['subsonic-response']?.album?.song ?? [];
        });
        const albumSongs = await Promise.all(albumPromises);
        return albumSongs.flat();
    };

    return (
        <StyledActionSheet
            gestureEnabled={true}
            safeAreaInsets={insets}
            isModal={Platform.OS == 'android' ? false : true}
        >
            <SheetTrackHeader
                cover={{ uri: cover.generateUrl(payload?.data?.coverArt ?? data?.coverArt ?? '', { size: 128 }) }}
                coverCacheKey={`${payload?.data?.coverArt ?? data?.coverArt}-128x128`}
                title={payload?.data?.name ?? data?.name}
                artist={data ? t('sheets.artist.subtitleAlbums', { count: data.albumCount ?? 0 }) : t('sheets.artist.subtitleArtist')}
            />
            {payload?.context !== 'artist' && <SheetOption
                icon={IconPlayerPlay}
                label={t('sheets.artist.playAll')}
                onPress={async () => {
                    SheetManager.hide(sheetId);
                    const allSongs = await fetchAllSongs();
                    if (!allSongs.length) return;
                    queue.replace(allSongs, {
                        initialIndex: 0,
                        source: {
                            source: 'artist',
                            sourceId: payload?.id ?? '',
                            sourceName: data?.name ?? '',
                        }
                    });
                }}
            />}
            {payload?.context !== 'artist' && <SheetOption
                icon={IconArrowsShuffle}
                label={t('sheets.artist.shuffleAll')}
                onPress={async () => {
                    SheetManager.hide(sheetId);
                    const allSongs = await fetchAllSongs();
                    if (!allSongs.length) return;
                    queue.replace(allSongs, {
                        initialIndex: 0,
                        source: {
                            source: 'artist',
                            sourceId: payload?.id ?? '',
                            sourceName: data?.name ?? '',
                        },
                        shuffle: true,
                    });
                }}
            />}
            <SheetOption
                icon={IconDownload}
                label={t('sheets.artist.downloadAll')}
                onPress={async () => {
                    SheetManager.hide(sheetId);
                    const allSongs = await fetchAllSongs();
                    if (!allSongs.length) return;
                    await downloads.downloadPlaylist(payload?.id ?? '', allSongs);
                }}
            />
            <SheetOption
                icon={isPinned ? IconPinnedOff : IconPin}
                label={isPinned ? t('sheets.artist.unpin') : t('sheets.artist.pin')}
                onPress={async () => {
                    if (!payload?.id) return;
                    if (isPinned) await pins.removePin(payload.id);
                    else await pins.addPin({
                        id: payload.id,
                        name: data?.name ?? payload?.data?.name ?? '',
                        description: `${data?.albumCount ?? payload?.data?.albumCount ?? 0} albums`,
                        type: 'artist',
                        coverArt: data?.coverArt ?? payload?.data?.coverArt ?? '',
                    });
                    SheetManager.hide(sheetId);
                }}
            />
            {copyIdEnabled && <SheetOption
                icon={IconCopy}
                label={t('sheets.artist.copyId')}
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
        </StyledActionSheet>
    );
}

export default ArtistSheet;
