import { useCallback } from 'react';
import { useQueue, useSearchHistory } from '@lib/hooks';
import { TMediaLibItem } from '@lib/components/MediaLibraryList/Item';
import { router } from 'expo-router';
import { SHItemType } from '@lib/providers/SearchHistoryProvider';
import { Child } from '@lib/types';

export type SearchPressOptions = {
    addToHistory?: boolean;
    trackContext?: Child[];
}

export function useSearchItemActions() {
    const queue = useQueue();
    const history = useSearchHistory();
    const press = useCallback(async (item: TMediaLibItem, options?: SearchPressOptions) => {
        if (options?.addToHistory !== false) await history.addItem({
            type: item.type as SHItemType,
            id: item.id,
            coverArt: item.coverArt ?? '',
            name: item.title,
            description: item.subtitle ?? '',
            searchedAt: Date.now(),
        });
        if (item.type === 'track') {
            const tracks = options?.trackContext;
            const index = tracks?.findIndex(t => t.id === item.id) ?? -1;
            if (tracks && index >= 0) {
                queue.replace(tracks, {
                    initialIndex: index,
                    source: { source: 'search', sourceName: 'Search' },
                });
            } else {
                await queue.playTrackNow(item.id);
            }
        } else if (item.type === 'album') {
            router.push({ pathname: '/albums/[id]', params: { id: item.id } });
        } else if (item.type === 'artist') {
            router.push({ pathname: '/artists/[id]', params: { id: item.id } });
        }
    }, [queue.replace, queue.playTrackNow]);

    return { press };
}
