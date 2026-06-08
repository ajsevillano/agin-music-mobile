import { useConnection, useServer } from '@lib/hooks';
import { IconCloudOff, IconWifiOff } from '@tabler/icons-react-native';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import FullscreenMessage from './FullscreenMessage';

export default function ConnectionError() {
    const { t } = useTranslation();
    const { isOnline, retry } = useConnection();
    const { recheckConnection } = useServer();

    const icon = isOnline ? IconCloudOff : IconWifiOff;
    const key = isOnline ? 'serverUnreachable' : 'offline';

    // Re-probe local/remote in case we moved networks, then refetch.
    const handleRetry = useCallback(() => {
        recheckConnection();
        retry();
    }, [recheckConnection, retry]);

    return (
        <FullscreenMessage
            animated
            icon={icon}
            label={t(`connection.${key}.title`)}
            description={t(`connection.${key}.description`)}
            action={{
                primary: {
                    label: t('connection.retry'),
                    onPress: handleRetry,
                },
                secondary: {
                    label: t('connection.viewDownloads'),
                    onPress: () => router.push('/downloads'),
                },
            }}
        />
    );
}
