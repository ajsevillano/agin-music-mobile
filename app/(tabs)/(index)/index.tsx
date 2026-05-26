import Container from '@lib/components/Container';
import Header from '@lib/components/Header';
import { Pinned, Playlists, Random, RecentlyAdded, RecentlyPlayed } from '@lib/components/HomeSections';
import { useQueue, useServer, useTabsHeight } from '@lib/hooks';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

export default function Home() {
    const [tabsHeight] = useTabsHeight();
    const queue = useQueue();
    const { t } = useTranslation();

    const localParams = useLocalSearchParams();
    const playId = useMemo(() => localParams?.playId, [localParams]);
    const server = useServer();
    useEffect(() => {
        (async () => {
            if (server.serverAuth.hash != '' && playId && typeof playId === 'string' && playId !== '') {
                await queue.playTrackNow(playId);
                router.setParams({ playId: '' });
            }
        })();
    }, [playId, server]);

    const styles = useMemo(() => StyleSheet.create({
        main: {
            flex: 1,
        },
        spacer: {
            height: tabsHeight + 10,
        }
    }), [tabsHeight]);

    return (
        <Container>
            <ScrollView style={styles.main}>
                <Header title={t('home.title')} withAvatar />
                <Pinned />
                <RecentlyPlayed />
                <RecentlyAdded />
                <Playlists />
                <Random />
                <View style={styles.spacer}></View>
            </ScrollView>
        </Container>
    )
}