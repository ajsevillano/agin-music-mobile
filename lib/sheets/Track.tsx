import { StyledActionSheet } from '@lib/components/StyledActionSheet';
import { Platform } from 'react-native';
import { SheetManager, SheetProps } from 'react-native-actions-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApiHelpers, useCache, useCoverBuilder, useDownloads, usePins, useQueue, useSetting } from '@lib/hooks';
import { useEffect, useState } from 'react';
import { Child } from '@lib/types';
import SheetTrackHeader from '@lib/components/sheet/SheetTrackHeader';
import SheetOption from '@lib/components/sheet/SheetOption';
import { IconCircleMinus, IconCirclePlus, IconCopy, IconDisc, IconDownload, IconMicrophone2, IconPin, IconPinnedOff, IconPlayerTrackNext, IconPlaylistAdd, IconTrash } from '@tabler/icons-react-native';
import * as Clipboard from 'expo-clipboard';
import showToast from '@lib/showToast';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

function TrackSheet({ sheetId, payload }: SheetProps<'track'>) {
    const insets = useSafeAreaInsets();
    const cache = useCache();
    const cover = useCoverBuilder();
    const queue = useQueue();
    const helpers = useApiHelpers();
    const { t } = useTranslation();

    const copyIdEnabled = useSetting('developer.copyId');

    const downloads = useDownloads();
    const pins = usePins();
    const isPinned = pins.isPinned(payload?.id ?? '');
    const isDownloaded = downloads.isTrackDownloaded(payload?.id ?? '');

    const [data, setData] = useState<Child | undefined>(payload?.data);

    useEffect(() => {
        (async () => {
            if (!payload?.id) return;

            const data = await cache.fetchChild(payload?.id);
            if (data) setData(data);
        })();
    }, [payload?.id]);

    return (
        <StyledActionSheet
            gestureEnabled={true}
            safeAreaInsets={insets}
            isModal={Platform.OS == 'android' ? false : true}
        >
            <SheetTrackHeader
                cover={{ uri: cover.generateUrl(data?.coverArt ?? '', { size: 128 }) }}
                coverCacheKey={`${data?.coverArt}-128x128`}
                title={data?.title}
                artist={data?.artist}
            />
            {payload?.context != 'nowPlaying' && <SheetOption
                icon={IconPlayerTrackNext}
                label={t('sheets.track.playNext')}
                onPress={async () => {
                    await queue.playNext(data?.id ?? '');
                    await showToast({
                        title: t('sheets.track.playingNext'),
                        subtitle: data?.title,
                        cover: { uri: cover.generateUrl(data?.coverArt ?? '', { size: 128 }), cacheKey: `${data?.coverArt}-128x128` },
                    });
                    SheetManager.hide(sheetId);
                }}
            />}
            {payload?.context != 'nowPlaying' && <SheetOption
                icon={IconPlaylistAdd}
                label={t('sheets.track.addToQueue')}
                onPress={async () => {
                    await queue.add(data?.id ?? '');
                    await showToast({
                        title: t('sheets.track.addedToQueue'),
                        subtitle: data?.title,
                        cover: { uri: cover.generateUrl(data?.coverArt ?? '', { size: 128 }), cacheKey: `${data?.coverArt}-128x128` },
                    });
                    SheetManager.hide(sheetId);
                }}
            />}
            <SheetOption
                icon={IconMicrophone2}
                label={t('sheets.track.goToArtist')}
                onPress={() => {
                    if (data?.artistId) {
                        router.push({ pathname: '/artists/[id]', params: { id: data.artistId } });
                        SheetManager.hide(sheetId, { payload: { shouldCloseSheet: true } });
                    }
                }}
            />
            {payload?.context != 'album' && <SheetOption
                icon={IconDisc}
                label={t('sheets.track.goToAlbum')}
                onPress={() => {
                    router.push({ pathname: '/albums/[id]', params: { id: data?.albumId ?? '' } });
                    SheetManager.hide(sheetId, { payload: { shouldCloseSheet: true } });
                }}
            />}
            {payload?.context != 'nowPlaying' && (isDownloaded ? <SheetOption
                icon={IconTrash}
                label={t('sheets.track.removeDownload')}
                variant='destructive'
                onPress={async () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                    await downloads.deleteTrack(payload?.id ?? '');
                    SheetManager.hide(sheetId);
                }}
            /> : <SheetOption
                icon={IconDownload}
                label={t('sheets.track.download')}
                onPress={async () => {
                    if (!data) return;
                    SheetManager.hide(sheetId);
                    await downloads.downloadTrack(data);
                }}
            />)}
            <SheetOption
                icon={isPinned ? IconPinnedOff : IconPin}
                label={isPinned ? t('sheets.track.unpin') : t('sheets.track.pin')}
                onPress={async () => {
                    if (!payload?.id) return;
                    if (isPinned) await pins.removePin(payload?.id);
                    else await pins.addPin({
                        id: payload?.id,
                        name: data?.title ?? '',
                        description: data?.artist ?? '',
                        type: 'track',
                        coverArt: data?.coverArt ?? '',
                    });
                    SheetManager.hide(sheetId);
                }}
            />
            {copyIdEnabled && <SheetOption
                icon={IconCopy}
                label={t('sheets.track.copyId')}
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
                label={t('sheets.track.addToPlaylist')}
                onPress={async () => {
                    if (!payload?.id) return;
                    const { added } = await SheetManager.show('addToPlaylist', {
                        payload: {
                            idList: [payload?.id],
                        }
                    });
                    if (!added) return;
                    SheetManager.hide(sheetId);
                }}
            />
            {payload?.context == 'playlist' && <SheetOption
                icon={IconCircleMinus}
                label={t('sheets.track.removeFromPlaylist')}
                variant='destructive'
                onPress={async () => {
                    if (!payload.contextId || !payload.id) return;

                    await helpers.removeTrackFromPlaylist(payload.contextId, payload.id);
                    SheetManager.hide(sheetId);

                    await showToast({
                        title: t('sheets.track.removedFromPlaylist'),
                        subtitle: data?.title,
                        cover: { uri: cover.generateUrl(data?.coverArt ?? '', { size: 128 }), cacheKey: `${data?.coverArt}-128x128` },
                    });
                }}
            />}
        </StyledActionSheet>
    );
}

export default TrackSheet;