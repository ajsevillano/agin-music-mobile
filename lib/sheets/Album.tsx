import { StyledActionSheet } from '@lib/components/StyledActionSheet';
import { Platform } from 'react-native';
import { SheetManager, SheetProps } from 'react-native-actions-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApiHelpers, useCoverBuilder, useDownloads, useMemoryCache, usePins, useQueue, useSetting } from '@lib/hooks';
import { useEffect } from 'react';
import SheetTrackHeader from '@lib/components/sheet/SheetTrackHeader';
import SheetOption from '@lib/components/sheet/SheetOption';
import { IconArrowsShuffle, IconCirclePlus, IconCopy, IconDownload, IconMicrophone2, IconPin, IconPinnedOff, IconPlayerPlay } from '@tabler/icons-react-native';
import * as Clipboard from 'expo-clipboard';
import showToast from '@lib/showToast';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

function AlbumSheet({ sheetId, payload }: SheetProps<'album'>) {
    const insets = useSafeAreaInsets();
    const memoryCache = useMemoryCache();
    const cover = useCoverBuilder();
    const helpers = useApiHelpers();
    const queue = useQueue();
    const { t } = useTranslation();

    const router = useRouter();
    const copyIdEnabled = useSetting('developer.copyId');

    const downloads = useDownloads();
    const pins = usePins();
    const isPinned = pins.isPinned(payload?.id ?? '');

    const data = memoryCache.cache.albums[payload?.id ?? ''];

    useEffect(() => {
        (async () => {
            if (!payload?.id) return;
            await memoryCache.refreshAlbum(payload?.id);
        })();
    }, [payload?.id, memoryCache.refreshAlbum]);

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
                artist={`${data?.artist} • ${data?.year}`}
            />
            {payload?.context != 'album' && <SheetOption
                icon={IconPlayerPlay}
                label={t('sheets.album.play')}
                onPress={async () => {
                    SheetManager.hide(sheetId);
                    const newQueue = data.song;
                    if (!newQueue) return;

                    queue.replace(newQueue, {
                        initialIndex: 0,
                        source: {
                            source: 'album',
                            sourceId: data.id,
                            sourceName: data.name,
                        }
                    });
                }}
            />}
            {payload?.context != 'album' && <SheetOption
                icon={IconArrowsShuffle}
                label={t('sheets.album.shuffle')}
                onPress={async () => {
                    SheetManager.hide(sheetId);
                    const newQueue = data.song;
                    if (!newQueue) return;

                    queue.replace(newQueue, {
                        initialIndex: 0,
                        source: {
                            source: 'album',
                            sourceId: data.id,
                            sourceName: data.name,
                        },
                        shuffle: true,
                    });
                }}
            />}
            {/* TODO */}
            {/* {payload?.context == 'album' && <SheetOption
                icon={IconArrowsSort}
                label='Sort By'
                description='Album Order'
                onPress={() => {
                    SheetManager.hide(sheetId);
                }}
                />} */}
            {data?.artistId && <SheetOption
                icon={IconMicrophone2}
                label={t('sheets.album.goToArtist')}
                onPress={() => {
                    SheetManager.hide(sheetId);
                    router.push({ pathname: '/artists/[id]', params: { id: data.artistId! } });
                }}
            />}
            {payload?.context != 'album' && data?.song && <SheetOption
                icon={IconDownload}
                label={t('sheets.album.download')}
                onPress={async () => {
                    if (!data?.song) return;
                    SheetManager.hide(sheetId);
                    await downloads.downloadPlaylist(data.id, data.song);
                }}
            />}
            <SheetOption
                icon={isPinned ? IconPinnedOff : IconPin}
                label={isPinned ? t('sheets.album.unpin') : t('sheets.album.pin')}
                onPress={async () => {
                    if (!payload?.id) return;
                    if (isPinned) await pins.removePin(payload?.id);
                    else await pins.addPin({
                        id: payload?.id,
                        name: data?.name ?? '',
                        description: data?.artist ?? '',
                        type: 'album',
                        coverArt: data?.coverArt ?? '',
                    });
                    SheetManager.hide(sheetId);
                }}
            />
            {copyIdEnabled && <SheetOption
                icon={IconCopy}
                label={t('sheets.album.copyId')}
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
                label={t('sheets.album.addToPlaylist')}
                onPress={async () => {
                    if (!data.song) return;
                    const { added } = await SheetManager.show('addToPlaylist', {
                        payload: {
                            idList: data.song.map(x => x.id),
                        }
                    });
                    if (!added) return;
                    SheetManager.hide(sheetId);
                }}
            />
        </StyledActionSheet>
    );
}

export default AlbumSheet;