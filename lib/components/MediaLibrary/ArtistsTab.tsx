import React, { useContext, useEffect, useMemo } from 'react';
import MediaLibraryList, { LibLayout } from '@lib/components/MediaLibraryList';
import { TMediaLibItem } from '@lib/components/MediaLibraryList/Item';
import { useConnection, useCoverBuilder, useHomeItemActions, useMemoryCache } from '@/lib/hooks';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { IconMicrophone2Off } from '@tabler/icons-react-native';
import { useTranslation } from 'react-i18next';
import FullscreenMessage from '@lib/components/FullscreenMessage';
import ConnectionError from '@lib/components/ConnectionError';

export function ArtistsTab() {
    const { t } = useTranslation();
    const { hasConnectionIssue } = useConnection();
    const cache = useMemoryCache();
    const cover = useCoverBuilder();
    const { press, longPress } = useHomeItemActions();

    const layout = useContext(LibLayout);

    const data = useMemo((): TMediaLibItem[] => cache.cache.allArtists.map(a => ({
        id: a.id,
        title: a.name,
        subtitle: `${a.albumCount} ${a.albumCount === 1 ? 'album' : 'albums'}`,
        coverUri: cover.generateUrl(a.coverArt ?? '', { size: layout == 'grid' ? 300 : 128 }),
        coverCacheKey: `${a.coverArt}-${layout == 'grid' ? '300x300' : '128x128'}`,
        type: 'artist',
    })), [cache.cache.allArtists, cover]);

    useEffect(() => {
        cache.refreshArtists();
    }, [cache.refreshArtists]);

    useFocusEffect(useCallback(() => {
        cache.refreshArtists();
    }, [cache.refreshArtists]));

    return (
        <MediaLibraryList
            data={data}
            onItemPress={press}
            onItemLongPress={longPress}
            layout={layout}
            extraData={cache.cache.allArtists}
            ListEmptyComponent={hasConnectionIssue
                ? <ConnectionError />
                : <FullscreenMessage animated icon={IconMicrophone2Off} label={t('library.empty.artists.title')} description={t('library.empty.artists.description')} />}
        />
    )
}
