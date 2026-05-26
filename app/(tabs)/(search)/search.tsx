import Container from '@lib/components/Container';
import FullscreenMessage from '@lib/components/FullscreenMessage';
import Header from '@lib/components/Header';
import { Input } from '@lib/components/Input';
import MediaLibraryList from '@lib/components/MediaLibraryList';
import { TMediaLibItem } from '@lib/components/MediaLibraryList/Item';
import SearchRightSection from '@lib/components/SearchRightSection';
import SearchSection from '@lib/components/SearchSection';
import TagTabs from '@lib/components/TagTabs';
import { TTagTab } from '@lib/components/TagTabs/TagTab';
import { useApi, useConnection, useCoverBuilder, useSearchHistory, useSearchItemActions, useSetting } from '@lib/hooks';
import ConnectionError from '@lib/components/ConnectionError';
import { AlbumID3, ArtistID3, Child, SearchResult3 } from '@lib/types';
import { IconDisc, IconMicrophone2, IconMusic, IconSearch, IconSearchOff } from '@tabler/icons-react-native';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

type Offsets = {
    album: number;
    artist: number;
    song: number;
}

export interface MappedResult extends TMediaLibItem {
    type: 'album' | 'artist' | 'track';
    fullData: Child | AlbumID3 | ArtistID3;
};

const entering = FadeIn.duration(100).easing(Easing.inOut(Easing.ease));
const exiting = FadeOut.duration(100).easing(Easing.inOut(Easing.ease));

export default function Search() {
    const history = useSearchHistory();
    const cover = useCoverBuilder();
    const api = useApi();
    const actions = useSearchItemActions();
    const { t } = useTranslation();
    const { hasConnectionIssue } = useConnection();

    const autoFocus = useSetting('ui.autoFocusSearchBar');

    const tabs = useMemo<TTagTab[]>(() => [
        { label: t('search.tabs.all'), id: 'all', icon: IconSearch },
        { label: t('search.tabs.artists'), id: 'artist', icon: IconMicrophone2 },
        { label: t('search.tabs.albums'), id: 'album', icon: IconDisc },
        { label: t('search.tabs.songs'), id: 'track', icon: IconMusic },
    ], [t]);

    const [tab, setTab] = useState<string>('all');
    const [query, setQuery] = useState<string>('');
    const [results, setResults] = useState<MappedResult[]>([]);
    const [offset, setOffset] = useState<Offsets>({
        album: 0,
        artist: 0,
        song: 0,
    });

    const filteredResults = useMemo<MappedResult[]>(() => results.filter(item => item.type === tab || tab === 'all'), [results, tab]);

    const tracksInResults = useMemo<Child[]>(() => filteredResults
        .filter(item => item.type === 'track')
        .map(item => item.fullData as Child), [filteredResults]);

    useEffect(() => {
        (async () => {
            if (!api) return;
            const res = await api.get('/search3', {
                params: {
                    query,
                    albumCount: 20,
                    artistConut: 20,
                    songCount: 20,
                    albumOffset: offset.album,
                    artistOffset: offset.artist,
                    songOffset: offset.song,
                }
            });
            const results = res.data?.['subsonic-response']?.searchResult3 as SearchResult3;

            const albums: MappedResult[] = results.album?.map((item): MappedResult => ({
                id: item.id,
                type: 'album',
                title: item.name,
                subtitle: t('search.labels.albumDetail', { artist: item.artist, year: item.year }),
                coverUri: cover.generateUrl(item.coverArt ?? '', { size: 128 }),
                coverCacheKey: `${item.coverArt}-128x128`,
                fullData: item,
                coverArt: item.coverArt,
            })) ?? [];

            const artists: MappedResult[] = results.artist?.map((item): MappedResult => ({
                id: item.id,
                type: 'artist',
                title: item.name,
                subtitle: t('search.labels.artist'),
                coverUri: cover.generateUrl(item.coverArt ?? '', { size: 128 }),
                coverCacheKey: `${item.coverArt}-128x128`,
                fullData: item,
                coverArt: item.coverArt,
            })) ?? [];

            const songs: MappedResult[] = results.song?.map((item): MappedResult => ({
                id: item.id,
                type: 'track',
                title: item.title,
                subtitle: t('search.labels.songDetail', { artist: item.artist }),
                coverUri: cover.generateUrl(item.coverArt ?? '', { size: 128 }),
                coverCacheKey: `${item.coverArt}-128x128`,
                fullData: item,
                coverArt: item.coverArt,
            })) ?? [];

            // TODO: Add sorting
            const mappedData = [...songs, ...artists, ...albums];
            setResults(mappedData);
        })();

    }, [query, api, offset, cover.generateUrl]);

    const mappedHistory = useMemo<TMediaLibItem[]>(() => history.items.map((item, index): TMediaLibItem => ({
        id: item.id,
        title: item.name,
        subtitle: item.description,
        coverUri: cover.generateUrl(item.coverArt, { size: 128 }),
        coverCacheKey: `${item.coverArt}-128x128`,
        type: item.type,
    })), [history.items]);

    const styles = useMemo(() => StyleSheet.create({
        history: {
            paddingTop: 5,
        },
        main: {
            flex: 1,
        },
    }), []);

    const inputRef = useRef<TextInput>(null);

    useFocusEffect(useCallback(() => {
        if (!autoFocus) return;
        inputRef.current?.focus();
    }, [autoFocus]));

    return (
        <Container>
            <KeyboardAvoidingView behavior='padding' style={styles.main}>
                <Header withAvatar={false}>
                    <Input compact icon={IconSearch} placeholder={t('search.placeholder')} autoFocus={!!autoFocus} ref={inputRef} clearButtonMode='always' value={query} onChangeText={setQuery} />
                </Header>
                {/* Had to do this beacuse Navidrome returns empty response for one character queries */}
                {query.length > 1 && <Animated.View style={styles.main} entering={entering} exiting={exiting}>
                    <TagTabs data={tabs} tab={tab} onChange={setTab} keyboardShouldPersistTaps='handled' />
                    <MediaLibraryList
                        data={filteredResults}
                        onItemPress={(item) => actions.press(item, { trackContext: tracksInResults })}
                        size='medium'
                        keyboardShouldPersistTaps='handled'
                        rightSection={SearchRightSection}
                        ListEmptyComponent={hasConnectionIssue
                            ? <ConnectionError />
                            : <FullscreenMessage animated icon={IconSearchOff} label={t('search.noResults.title', { query })} description={t('search.noResults.description')} />}
                    />
                </Animated.View>}
                {query.length <= 1 && <Animated.View style={[styles.history, styles.main]} entering={entering} exiting={exiting}>
                    {mappedHistory.length !== 0 && <SearchSection label={t('search.recentSearches')} action={{ label: t('search.clear'), onPress: async () => await history.clearAll() }} />}
                    {mappedHistory.length === 0 && <FullscreenMessage icon={IconSearch} label={t('search.emptyLabel')} description={t('search.emptyDescription')} />}
                    {mappedHistory.length !== 0 && <MediaLibraryList data={mappedHistory} onItemPress={(item) => actions.press(item, { addToHistory: false })} size='medium' withTopMargin={false} keyboardShouldPersistTaps='handled' rightSection={SearchRightSection} />}
                </Animated.View>}
            </KeyboardAvoidingView>
        </Container>
    )
}