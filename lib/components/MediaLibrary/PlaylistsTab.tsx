import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import MediaLibraryList, { LibLayout } from '@lib/components/MediaLibraryList';
import { TMediaLibItem } from '@lib/components/MediaLibraryList/Item';
import { useConnection, useCoverBuilder, useHomeItemActions, useMemoryCache } from '@/lib/hooks';
import { formatDistanceToNow } from 'date-fns';
import { router, useFocusEffect } from 'expo-router';
import { IconPlaylistOff } from '@tabler/icons-react-native';
import { useTranslation } from 'react-i18next';
import FullscreenMessage from '@lib/components/FullscreenMessage';
import ConnectionError from '@lib/components/ConnectionError';

export function PlaylistsTab() {
    const { t } = useTranslation();
    const { hasConnectionIssue } = useConnection();
    const cache = useMemoryCache();
    const cover = useCoverBuilder();

    const { press, longPress } = useHomeItemActions();

    const layout = useContext(LibLayout);

    const data = useMemo((): TMediaLibItem[] => cache.cache.allPlaylists.map(p => ({
        id: p.id,
        title: p.name,
        subtitle: `${p.songCount} songs${layout !== 'grid' ? ` • edited ${formatDistanceToNow(new Date(p.changed), { addSuffix: true })}` : ''}`,
        coverUri: cover.generateUrl(p.coverArt ?? '', { size: layout == 'grid' ? 300 : 128 }),
        coverCacheKey: `${p.coverArt}-${layout == 'grid' ? '300x300' : '128x128'}`,
        type: 'playlist',
    })), [cache.cache.allPlaylists, cover, layout]);

    useEffect(() => {
        cache.refreshPlaylists();
    }, [cache.refreshPlaylists]);

    useFocusEffect(useCallback(() => {
        cache.refreshPlaylists();
    }, [cache.refreshPlaylists]));

    return (
        <MediaLibraryList
            data={data}
            onItemPress={press}
            onItemLongPress={longPress}
            layout={layout}
            extraData={cache.cache.allPlaylists}
            ListEmptyComponent={hasConnectionIssue
                ? <ConnectionError />
                : <FullscreenMessage animated icon={IconPlaylistOff} label={t('library.empty.playlists.title')} description={t('library.empty.playlists.description')} />}
        />
    )
}