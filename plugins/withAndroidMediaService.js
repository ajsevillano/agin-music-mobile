const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Expo config plugin to register the nitro-player MediaBrowserService in the
 * Android manifest and add the FOREGROUND_SERVICE_MEDIA_PLAYBACK permission.
 *
 * Without this:
 * - Android may kill the audio process after the app goes to background
 * - Lock screen controls may not work reliably
 * - The system has no foreground service to keep alive
 */
module.exports = function withAndroidMediaService(config) {
    return withAndroidManifest(config, (config) => {
        const manifest = config.modResults;
        const application = manifest.manifest.application[0];

        // Add FOREGROUND_SERVICE_MEDIA_PLAYBACK permission (required on Android 14+)
        const permissions = manifest.manifest['uses-permission'] || [];
        const mediaPlaybackPermission = 'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK';
        const hasPermission = permissions.some(
            (p) => p.$?.['android:name'] === mediaPlaybackPermission
        );
        if (!hasPermission) {
            manifest.manifest['uses-permission'] = [
                ...permissions,
                { $: { 'android:name': mediaPlaybackPermission } },
            ];
        }

        // Register the NitroPlayer MediaBrowserService
        const services = application.service || [];
        const serviceClass = 'com.margelo.nitro.nitroplayer.media.NitroPlayerMediaBrowserService';
        const hasService = services.some(
            (s) => s.$?.['android:name'] === serviceClass
        );
        if (!hasService) {
            application.service = [
                ...services,
                {
                    $: {
                        'android:name': serviceClass,
                        'android:exported': 'true',
                        'android:foregroundServiceType': 'mediaPlayback',
                    },
                    'intent-filter': [
                        {
                            action: [
                                { $: { 'android:name': 'android.intent.action.MEDIA_BUTTON' } },
                                { $: { 'android:name': 'android.media.browse.MediaBrowserService' } },
                            ],
                        },
                    ],
                },
            ];
        }

        return config;
    });
};
