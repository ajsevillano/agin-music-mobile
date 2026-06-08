import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Input } from '@lib/components/Input';
import Title from '@lib/components/Title';
import Button from '@lib/components/Button';
import { useColors, useServer } from '@lib/hooks';
import { IconDeviceLaptop, IconRefresh, IconWorld } from '@tabler/icons-react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import showToast from '@lib/showToast';
import { IconCircleCheck } from '@tabler/icons-react-native';

export default function ConnectionSettings() {
    const colors = useColors();
    const { t } = useTranslation();
    const { server, connection, setServerUrls, recheckConnection } = useServer();

    const [local, setLocal] = useState(server.localUrl ?? server.url ?? '');
    const [remote, setRemote] = useState(server.remoteUrl ?? '');

    const styles = useMemo(() => StyleSheet.create({
        container: {
            paddingHorizontal: 20,
            paddingTop: 8,
            gap: 12,
        },
        field: {
            gap: 6,
        },
        status: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: colors.secondaryBackground,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 10,
            gap: 10,
        },
        statusText: {
            flex: 1,
        },
        recheck: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
        },
    }), [colors]);

    const sourceLabel = connection.checking
        ? t('settings.connection.checking')
        : t(`settings.connection.sources.${connection.source}`);

    const handleSave = () => {
        setServerUrls(local, remote);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        showToast({
            title: t('settings.connection.savedTitle'),
            subtitle: t('settings.connection.savedSubtitle'),
            icon: IconCircleCheck,
        });
    };

    const handleRecheck = () => {
        Haptics.selectionAsync();
        recheckConnection();
    };

    return (
        <View style={styles.container}>
            <View style={styles.field}>
                <Input
                    compact
                    icon={IconDeviceLaptop}
                    label={t('settings.connection.localLabel')}
                    placeholder={t('settings.connection.localPlaceholder')}
                    autoCapitalize='none'
                    autoCorrect={false}
                    keyboardType='url'
                    value={local}
                    onChangeText={setLocal}
                />
            </View>
            <View style={styles.field}>
                <Input
                    compact
                    icon={IconWorld}
                    label={t('settings.connection.remoteLabel')}
                    placeholder={t('settings.connection.remotePlaceholder')}
                    autoCapitalize='none'
                    autoCorrect={false}
                    keyboardType='url'
                    value={remote}
                    onChangeText={setRemote}
                />
            </View>

            <Button onPress={handleSave}>{t('settings.connection.save')}</Button>

            <View style={styles.status}>
                <View style={styles.statusText}>
                    <Title size={13} fontFamily='Poppins-Medium'>{sourceLabel}</Title>
                    {!!connection.activeUrl && (
                        <Title size={12} color={colors.text[1]} fontFamily='Poppins-Regular' numberOfLines={1}>
                            {connection.activeUrl}
                        </Title>
                    )}
                </View>
                {connection.checking
                    ? <ActivityIndicator color={colors.text[1]} />
                    : (
                        <Pressable style={styles.recheck} onPress={handleRecheck} hitSlop={8}>
                            <IconRefresh size={16} color={colors.tint} />
                            <Title size={12} color={colors.tint} fontFamily='Poppins-Medium'>
                                {t('settings.connection.recheck')}
                            </Title>
                        </Pressable>
                    )}
            </View>
        </View>
    );
}
