import { useApi, useColors, useConnection, useCoverBuilder, useHomeItemActions } from '@lib/hooks';
import HomeSectionHeader from '../HomeSectionHeader';
import React, { useEffect, useState } from 'react';
import { TMediaLibItem } from '../MediaLibraryList/Item';
import { Child } from '@lib/types';
import Carousel from 'react-native-reanimated-carousel';
import { Dimensions, Pressable, View } from 'react-native';
import Cover from '../Cover';
import Title from '../Title';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

export function RecentlyPlayed() {
    const cover = useCoverBuilder();
    const api = useApi();
    const colors = useColors();
    const { press, longPress } = useHomeItemActions();
    const { markServerOk, markServerUnreachable, retryToken } = useConnection();
    const [data, setData] = useState<TMediaLibItem[]>([]);

    useEffect(() => {
        (async () => {
            if (!api) return;

            try {
                const res = await api.get('/getAlbumList2', {
                    params: {
                        type: 'recent',
                        size: 10,
                    }
                });

                markServerOk();
                const albums = res.data?.['subsonic-response']?.albumList2?.album as any[];
                if (!albums) {
                    setData([]);
                    return;
                }

                const items = albums.map((album): TMediaLibItem => ({
                    id: album.id,
                    title: album.name || album.title,
                    subtitle: album.artist,
                    coverArt: album.coverArt,
                    coverUri: cover.generateUrl(album.coverArt ?? '', { size: 512 }),
                    coverCacheKey: `${album.coverArt}-512x512`,
                    type: 'album',
                }));

                setData(items);
            } catch {
                markServerUnreachable();
                setData([]);
            }
        })();
    }, [api, cover.generateUrl, markServerOk, markServerUnreachable, retryToken]);

    if (data.length === 0) return null;

    return (
        <View style={{ marginBottom: 10 }}>
            <HomeSectionHeader label="Recently Played" />
            <Carousel
                loop
                width={width}
                height={width * 0.6}
                autoPlay={true}
                autoPlayInterval={4000}
                data={data}
                scrollAnimationDuration={1000}
                mode="parallax"
                modeConfig={{
                    parallaxScrollingScale: 0.9,
                    parallaxScrollingOffset: 50,
                }}
                renderItem={({ item }) => (
                    <Pressable
                        onPress={() => press(item)}
                        onLongPress={() => longPress(item)}
                        style={{ flex: 1, borderRadius: 16, overflow: 'hidden' }}
                    >
                        <Cover
                            source={{ uri: item.coverUri }}
                            cacheKey={item.coverCacheKey}
                            radius={16}
                            withShadow={false}
                        />
                        <LinearGradient
                            colors={['transparent', 'rgba(0,0,0,0.8)']}
                            style={{
                                position: 'absolute',
                                bottom: -1,
                                left: 0,
                                right: 0,
                                height: '51%',
                                justifyContent: 'flex-end',
                                padding: 20,
                            }}
                        >
                            <Title size={20} color="#fff" numberOfLines={1}>{item.title}</Title>
                            <Title size={14} color="#ccc" fontFamily="Poppins-Regular" numberOfLines={1}>{item.subtitle}</Title>
                        </LinearGradient>
                    </Pressable>
                )}
            />
        </View>
    )
}