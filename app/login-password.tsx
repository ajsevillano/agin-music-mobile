import Button from '@lib/components/Button';
import { Input } from '@lib/components/Input';
import { SetupPage } from '@lib/components/SetupPage';
import Title from '@lib/components/Title';
import { useColors, useServer } from '@lib/hooks';
import { IconKey, IconUser } from '@tabler/icons-react-native';
import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Switch, TextInput, TouchableHighlight, View } from 'react-native';
import { SheetManager } from 'react-native-actions-sheet';
import { useTranslation } from 'react-i18next';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [useLegacyAuth, setUseLegacyAuth] = useState(false);
    const [loading, setLoading] = useState(false);
    const colors = useColors();
    const { t } = useTranslation();

    const server = useServer();

    const passwordRef = useRef<TextInput>(null);

    const logIn = useCallback(async () => {
        if (username === '' || password === '') return;
        setLoading(true);

        const authMethod = useLegacyAuth ? 'password' : undefined;
        const success = await server.saveAndTestPasswordCredentials(username, password, undefined, authMethod);
        if (!success) {
            setLoading(false);
            await SheetManager.show('confirm', {
                payload: {
                    title: t('common.error'),
                    message: t('login.password.errorMessage'),
                    confirmText: t('common.ok'),
                    withCancel: false
                }
            });
            return;
        }

        setLoading(false);
        router.replace('/');
    }, [username, password, server.saveAndTestPasswordCredentials, useLegacyAuth, t]);

    const styles = useMemo(() => ({
        container: {
            gap: 10,
        },
    }), []);

    return (
        <SetupPage
            icon={IconKey}
            title={t('login.password.title')}
            description={t('login.password.description')}
            actions={<Button disabled={username === '' || password === '' || loading} onPress={logIn}>{t('common.done')}</Button>}
        >
            <View style={styles.container}>
                <Input
                    icon={IconUser}
                    placeholder={t('login.password.usernamePlaceholder')}
                    autoCapitalize='none'
                    autoCorrect={false}
                    autoFocus
                    value={username}
                    onChangeText={setUsername}
                    returnKeyType='next'
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    textContentType='username'
                    autoComplete='username'
                    submitBehavior='submit'
                    enablesReturnKeyAutomatically
                />
                <Input
                    icon={IconKey}
                    placeholder={t('login.password.passwordPlaceholder')}
                    secureTextEntry
                    autoCapitalize='none'
                    autoCorrect={false}
                    value={password}
                    onChangeText={setPassword}
                    returnKeyType='done'
                    ref={passwordRef}
                    onSubmitEditing={logIn}
                    textContentType='password'
                    autoComplete='current-password'
                    submitBehavior='submit'
                    enablesReturnKeyAutomatically
                />
                <TouchableHighlight
                    onPress={() => setUseLegacyAuth(!useLegacyAuth)}
                    underlayColor={colors.secondaryBackground}
                >
                    <View style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingHorizontal: 20,
                        paddingVertical: 10,
                    }}>
                        <View style={{ flex: 1, marginRight: 10 }}>
                            <Title size={14}>{t('login.password.legacyTitle')}</Title>
                            <Title size={12} color={colors.text[1]} fontFamily="Poppins-Regular">{t('login.password.legacyDescription')}</Title>
                        </View>
                        <Switch
                            trackColor={{ false: colors.segmentedControlBackground, true: colors.forcedTint }}
                            thumbColor={colors.text[0]}
                            ios_backgroundColor={colors.segmentedControlBackground}
                            value={useLegacyAuth}
                            onValueChange={setUseLegacyAuth}
                        />
                    </View>
                </TouchableHighlight>
            </View>
        </SetupPage>
    )
}
