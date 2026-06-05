import React, { useCallback, useContext, useEffect, useMemo } from 'react';
import MediaLibraryList, { LibLayout } from '@lib/components/MediaLibraryList';
import { TMediaLibItem } from '@lib/components/MediaLibraryList/Item';
import { useConnection, useCoverBuilder, useHomeItemActions, useMemoryCache, useQueue } from '@/lib/hooks';
import { IconMusicOff } from '@tabler/icons-react-native';
import { useTranslation } from 'react-i18next';
import FullscreenMessage from '@lib/components/FullscreenMessage';
import ConnectionError from '@lib/components/ConnectionError';

export function SongsTab() {
    const { t } = useTranslation();
    const { hasConnectionIssue } = useConnection();
    const cache = useMemoryCache();
    const cover = useCoverBuilder();
    const queue = useQueue();

    const { longPress } = useHomeItemActions();

    const layout = useContext(LibLayout);

    const data = useMemo((): TMediaLibItem[] => cache.cache.allSongs.map(s => ({
        id: s.id,
        title: s.title,
        subtitle: s.artist ?? 'Unknown Artist',
        coverUri: cover.generateUrl(s.coverArt ?? '', { size: layout == 'grid' ? 300 : 128 }),
        coverCacheKey: `${s.coverArt}-${layout == 'grid' ? '300x300' : '128x128'}`,
        type: 'track',
    })), [cache.cache.allSongs, cover.generateUrl, layout]);

    const press = useCallback((item: TMediaLibItem) => {
        const songs = cache.cache.allSongs;
        const index = songs.findIndex(s => s.id === item.id);
        if (index < 0) return;
        queue.replace(songs, {
            initialIndex: index,
            source: { source: 'library', sourceName: 'Library' },
        });
    }, [cache.cache.allSongs, queue.replace]);

    useEffect(() => {
        if (cache.cache.allSongs.length === 0) {
            cache.refreshSongs();
        }
    }, [cache.refreshSongs]);

    return (
        <MediaLibraryList
            data={data}
            onItemPress={press}
            onItemLongPress={longPress}
            layout={layout}
            extraData={cache.cache.allSongs}
            ListEmptyComponent={hasConnectionIssue
                ? <ConnectionError />
                : <FullscreenMessage animated icon={IconMusicOff} label={t('library.empty.songs.title')} description={t('library.empty.songs.description')} />}
        />
    )
}
