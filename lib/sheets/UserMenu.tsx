import { StyledActionSheet } from '@lib/components/StyledActionSheet';
import { Linking, Platform } from 'react-native';
import { SheetManager, SheetProps } from 'react-native-actions-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCache, useMemoryCache, useQueue, useServer, useApi } from '@lib/hooks';
import SheetTrackHeader from '@lib/components/sheet/SheetTrackHeader';
import SheetOption from '@lib/components/sheet/SheetOption';
import { IconArrowsSort, IconBrandGithub, IconExclamationCircle, IconFileSearch, IconLogout, IconMusic, IconSettings } from '@tabler/icons-react-native';
import Avatar from '@lib/components/Avatar';
import config from '@lib/constants/config';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import showToast from '@lib/showToast';
import { ScanStatus } from '@lib/types';
import { useTranslation } from 'react-i18next';

function UserMenuSheet({ sheetId, payload }: SheetProps<'userMenu'>) {
    const insets = useSafeAreaInsets();
    const server = useServer();
    const cache = useCache();
    const memoryCache = useMemoryCache();
    const queue = useQueue();
    const api = useApi();
    const { t } = useTranslation();

    return (
        <StyledActionSheet
            gestureEnabled={true}
            safeAreaInsets={insets}
            isModal={Platform.OS == 'android' ? false : true}
        >
            <SheetTrackHeader
                coverComponent={<Avatar />}
                title={server.server.auth.username}
                artist={server.server.url}
            />
            <SheetOption
                icon={IconSettings}
                label={t('sheets.userMenu.appSettings')}
                onPress={() => {
                    router.push('/settings');
                    SheetManager.hide(sheetId);
                }}
            />
            <SheetOption
                icon={IconFileSearch}
                label={t('sheets.userMenu.triggerScan')}
                onPress={async () => {
                    if (!api) return;
                    SheetManager.hide(sheetId);
                    await showToast({
                        title: t('sheets.userMenu.scanTriggered'),
                        subtitle: t('sheets.userMenu.scanTriggeredSubtitle'),
                        icon: IconFileSearch,
                        haptics: 'none',
                    });
                    const result = await api.get('/startScan');
                    const status = result.data?.['subsonic-response']?.scanStatus as ScanStatus;
                    if (!status) {
                        return await showToast({
                            title: t('sheets.userMenu.scanFailed'),
                            subtitle: t('sheets.userMenu.scanFailedSubtitle'),
                            icon: IconExclamationCircle,
                            haptics: 'error',
                        });
                    }

                    return await showToast({
                        title: t('sheets.userMenu.scanFinished'),
                        subtitle: t('sheets.userMenu.scanFinishedSubtitle', { count: status.count }),
                        icon: IconFileSearch,
                    });
                }}
            />
            {config.repoUrl && <SheetOption
                icon={IconBrandGithub}
                label={t('sheets.userMenu.contribute')}
                onPress={() => {
                    if (!config.repoUrl) return;
                    Linking.openURL(config.repoUrl);
                    SheetManager.hide(sheetId);
                }}
            />}
            {config.repoUrl && <SheetOption
                icon={IconExclamationCircle}
                label={t('sheets.userMenu.reportIssue')}
                onPress={() => {
                    if (!config.repoUrl) return;
                    Linking.openURL(`${config.repoUrl}/issues/new`);
                    SheetManager.hide(sheetId);
                }}
            />}
            <SheetOption
                icon={IconLogout}
                label={t('sheets.userMenu.logOut')}
                onPress={async () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                    const confirmed = await SheetManager.show('confirm', {
                        payload: {
                            title: t('sheets.userMenu.logOutConfirmTitle'),
                            message: t('sheets.userMenu.logOutConfirmMessage'),
                            cancelText: t('common.cancel'),
                            confirmText: t('sheets.userMenu.logOut'),
                            variant: 'danger',
                        }
                    });
                    if (!confirmed) return;

                    SheetManager.hide(sheetId);

                    await cache.clearAll();
                    memoryCache.clear();
                    queue.clear();

                    await server.logOut();
                }}
            />
        </StyledActionSheet>
    );
}

export default UserMenuSheet;