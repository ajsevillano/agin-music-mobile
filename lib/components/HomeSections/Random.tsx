import { useApi, useConnection, useCoverBuilder, useHomeItemActions, useMemoryCache } from '@lib/hooks';
import HomeSectionHeader from '../HomeSectionHeader';
import MediaLibraryList from '../MediaLibraryList';
import React, { useEffect, useMemo, useState } from 'react';
import { TMediaLibItem } from '../MediaLibraryList/Item';
import { router } from 'expo-router';
import { Child } from '@lib/types';

export function Random() {
    const cover = useCoverBuilder();
    const api = useApi();
    const { press, longPress } = useHomeItemActions();
    const { markServerOk, markServerUnreachable, retryToken } = useConnection();
    const [data, setData] = useState<TMediaLibItem[]>([]);

    useEffect(() => {
        (async () => {
            if (!api) return;

            try {
                const res = await api.get('/getRandomSongs', {
                    params: {
                        size: 20,
                    }
                });

                markServerOk();
                const songs = res.data?.['subsonic-response']?.randomSongs?.song as Child[];
                if (!songs) {
                    setData([]);
                    return;
                }

                const items = songs.map((song): TMediaLibItem => ({
                    id: song.id,
                    title: song.title,
                    subtitle: song.artist,
                    coverArt: song.coverArt,
                    coverUri: cover.generateUrl(song.coverArt ?? '', { size: 512 }),
                    coverCacheKey: `${song.coverArt}-300x300`,
                    type: 'track',
                }));

                setData(items);
            } catch {
                markServerUnreachable();
                setData([]);
            }
        })();
    }, [api, cover.generateUrl, markServerOk, markServerUnreachable, retryToken]);

    return (
        <>
            <HomeSectionHeader label="Explore" />
            <MediaLibraryList
                data={data}
                onItemPress={press}
                onItemLongPress={longPress}
                layout='horizontal'
                withTopMargin={false}
                isFullHeight={false}
                snapToAlignment='start'
            />
        </>
    )
}