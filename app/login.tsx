import Button from '@lib/components/Button';
import { Input } from '@lib/components/Input';
import { SetupPage } from '@lib/components/SetupPage';
import { useServer } from '@lib/hooks';
import { IconMusic } from '@tabler/icons-react-native';
import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { SheetManager } from 'react-native-actions-sheet';
import { useTranslation } from 'react-i18next';

export default function Login() {
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const { t } = useTranslation();

    const server = useServer();

    const demoConfirm = useCallback(async () => {
        const confirmed = await SheetManager.show('confirm', {
            payload: {
                title: t('login.url.demoConfirmTitle'),
                message: t('login.url.demoConfirmMessage'),
                confirmText: t('common.continue'),
                cancelText: t('common.cancel'),
            }
        });
        return confirmed;
    }, [t]);

    const goNext = useCallback(async (useDemo?: boolean) => {
        if (url === '' && !useDemo) return;
        const confirmed = useDemo ? await demoConfirm() : true;
        if (!confirmed) return;
        setLoading(true);

        try {
            const result = await server.discoverServer(useDemo ? 'https://demo.navidrome.org' : url);
            if (result && !result.success) {
                setLoading(false);
                await SheetManager.show('confirm', {
                    payload: {
                        title: t('common.error'),
                        message: t('login.url.errorMessage'),
                        confirmText: t('common.ok'),
                        withCancel: false
                    }
                });
                return;
            }

            if (useDemo) {
                const success = await server.saveAndTestPasswordCredentials('demo', 'demo', 'https://demo.navidrome.org');
                return router.push('/');
            }

            setLoading(false);
            router.push('/login-password');
        } catch (e) {
            console.error(e);
            setLoading(false);
            await SheetManager.show('confirm', {
                payload: {
                    title: t('common.error'),
                    message: t('login.url.errorMessage'),
                    confirmText: t('common.ok'),
                    withCancel: false
                }
            });
        }
    }, [url, t]);

    return (
        <SetupPage
            icon={IconMusic}
            title={t('login.url.title')}
            description={t('login.url.description')}
            actions={<View style={{ gap: 10 }}>
                <Button onPress={() => goNext(false)} disabled={url === '' || loading}>{t('common.next')}</Button>
                <Button onPress={() => goNext(true)} variant='subtle'>{t('login.url.demoButton')}</Button>
            </View>}
        >
            <Input
                placeholder={t('login.url.placeholder')}
                autoCapitalize='none'
                autoCorrect={false}
                autoFocus
                value={url}
                onChangeText={setUrl}
                returnKeyType='next'
                onSubmitEditing={() => goNext(false)}
                submitBehavior='submit'
                enablesReturnKeyAutomatically
            />
        </SetupPage>
    )
}