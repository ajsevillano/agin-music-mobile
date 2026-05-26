import Container from '@lib/components/Container';
import Header from '@lib/components/Header';
import Setting, { SettingSelectOption } from '@lib/components/Setting';
import SettingsSection from '@lib/components/SettingsSection';
import Title from '@lib/components/Title';
import { useCache, useColors, useMemoryCache, useTabsHeight } from '@lib/hooks';
import { IconCircleCheck, IconDoor, IconFileMusic, IconLanguage, IconLayoutGrid, IconVolume, IconWifi } from '@tabler/icons-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SheetManager } from 'react-native-actions-sheet';
import * as Haptics from 'expo-haptics';
import showToast from '@lib/showToast';
import { useEqualizer } from 'react-native-nitro-player';
import { useTranslation } from 'react-i18next';
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES, changeLanguage, SupportedLanguage } from '@lib/i18n';


export type SettingId = 'streaming.maxBitRate' | 'streaming.format' | 'storage.clearCache' | 'developer.copyId' | 'ui.toastPosition' | 'ui.autoFocusSearchBar' | 'app.defaultTab' | 'app.defaultLibraryTab' | 'eq.enabled' | 'downloads.wifiOnly' | 'app.persistQueue' | 'downloads.maxBitRate' | 'downloads.format' | 'app.language';

const EQ_PRESETS: Record<string, number[]> = {
    Flat:      [0, 0, 0, 0, 0],
    Rock:      [4, 2, -1, 3, 5],
    Pop:       [-1, 2, 4, 2, -1],
    Jazz:      [3, 1, -1, 1, 3],
    Classical: [3, 1, -2, 1, 4],
};

const EQ_BAND_LABELS = ['60Hz', '230Hz', '910Hz', '3.6kHz', '14kHz'];

function EQBandSlider({ label, gain, onGainChange, colors }: { label: string; gain: number; onGainChange: (value: number) => void; colors: any }) {
    const steps = 24; // -12 to +12
    const percentage = ((gain + 12) / 24) * 100;

    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 6, gap: 10 }}>
            <Title size={11} fontFamily="Poppins-Medium" style={{ width: 45 }}>{label}</Title>
            <View style={{ flex: 1, height: 28, justifyContent: 'center' }}>
                <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.border[0], overflow: 'hidden' }}>
                    <View style={{ height: '100%', width: `${percentage}%`, backgroundColor: colors.forcedTint, borderRadius: 2 }} />
                </View>
                <View style={{ position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between' }}>
                    {Array.from({ length: 5 }, (_, i) => {
                        const val = -12 + (i * 6);
                        return (
                            <Pressable key={i} onPress={() => onGainChange(val)} hitSlop={8} style={{ width: 20, alignItems: 'center' }}>
                                <View style={{ width: 1, height: 8, backgroundColor: colors.text[2] + '40' }} />
                            </Pressable>
                        );
                    })}
                </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 4 }}>
                <Pressable onPress={() => onGainChange(Math.max(-12, gain - 1))} hitSlop={6} style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.border[0], alignItems: 'center', justifyContent: 'center' }}>
                    <Title size={14} fontFamily="Poppins-Bold">-</Title>
                </Pressable>
                <View style={{ width: 36, alignItems: 'center', justifyContent: 'center' }}>
                    <Title size={11} fontFamily="Poppins-SemiBold">{gain > 0 ? `+${gain}` : `${gain}`}</Title>
                </View>
                <Pressable onPress={() => onGainChange(Math.min(12, gain + 1))} hitSlop={6} style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.border[0], alignItems: 'center', justifyContent: 'center' }}>
                    <Title size={14} fontFamily="Poppins-Bold">+</Title>
                </Pressable>
            </View>
        </View>
    );
}

function EQSection() {
    const colors = useColors();
    const eq = useEqualizer();
    const [activePreset, setActivePreset] = useState<string | null>(eq.currentPreset);
    const { t } = useTranslation();

    const handlePreset = useCallback((name: string) => {
        const gains = EQ_PRESETS[name];
        eq.setAllBandGains(gains);
        setActivePreset(name);
        Haptics.selectionAsync();
    }, [eq]);

    const handleBandChange = useCallback((index: number, gain: number) => {
        eq.setBandGain(index, gain);
        setActivePreset(null);
        Haptics.selectionAsync();
    }, [eq]);

    const handleToggle = useCallback((enabled: boolean) => {
        eq.setEnabled(enabled);
        Haptics.selectionAsync();
    }, [eq]);

    const handleReset = useCallback(() => {
        eq.reset();
        setActivePreset('Flat');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, [eq]);

    return (
        <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 }}>
                <View>
                    <Title size={14}>{t('settings.equalizer.label')}</Title>
                    <Title size={12} color={colors.text[1]} fontFamily="Poppins-Regular">{t('settings.equalizer.description')}</Title>
                </View>
                <Switch
                    trackColor={{ false: colors.segmentedControlBackground, true: colors.forcedTint }}
                    thumbColor={colors.text[0]}
                    ios_backgroundColor={colors.segmentedControlBackground}
                    value={eq.isEnabled}
                    onValueChange={handleToggle}
                />
            </View>
            {eq.isEnabled && (
                <>
                    <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 8, gap: 8, flexWrap: 'wrap' }}>
                        {Object.keys(EQ_PRESETS).map(name => (
                            <Pressable
                                key={name}
                                onPress={() => handlePreset(name)}
                                style={{
                                    paddingHorizontal: 14,
                                    paddingVertical: 6,
                                    borderRadius: 16,
                                    backgroundColor: activePreset === name ? colors.forcedTint : colors.border[0],
                                }}
                            >
                                <Title size={12} fontFamily="Poppins-Medium" color={activePreset === name ? '#fff' : colors.text[0]}>{name}</Title>
                            </Pressable>
                        ))}
                        <Pressable
                            onPress={handleReset}
                            style={{
                                paddingHorizontal: 14,
                                paddingVertical: 6,
                                borderRadius: 16,
                                backgroundColor: colors.border[0],
                            }}
                        >
                            <Title size={12} fontFamily="Poppins-Medium" color={colors.text[1]}>{t('settings.equalizer.reset')}</Title>
                        </Pressable>
                    </View>
                    {eq.bands.map((band, index) => (
                        <EQBandSlider
                            key={index}
                            label={EQ_BAND_LABELS[index]}
                            gain={band.gainDb}
                            onGainChange={(value) => handleBandChange(index, value)}
                            colors={colors}
                        />
                    ))}
                </>
            )}
        </>
    );
}

const languageOptions: SettingSelectOption[] = SUPPORTED_LANGUAGES.map(lang => ({
    label: LANGUAGE_NAMES[lang],
    value: lang,
    shortLabel: LANGUAGE_NAMES[lang],
}));

export default function Settings() {
    const cache = useCache();
    const memoryCache = useMemoryCache();
    const [tabsHeight] = useTabsHeight();
    const { t, i18n } = useTranslation();

    const maxBitRateOptions = useMemo<SettingSelectOption[]>(() => [
        { label: t('options.bitrate.original'), description: t('options.bitrate.originalDesc'), value: '0', shortLabel: t('options.bitrate.original') },
        { label: '320 kbps', description: t('options.bitrate.high'), value: '320', shortLabel: '320k' },
        { label: '256 kbps', description: t('options.bitrate.highQuality'), value: '256', shortLabel: '256k' },
        { label: '192 kbps', description: t('options.bitrate.goodQuality'), value: '192', shortLabel: '192k' },
        { label: '128 kbps', description: t('options.bitrate.standardQuality'), value: '128', shortLabel: '128k' },
        { label: '96 kbps', description: t('options.bitrate.lowQuality'), value: '96', shortLabel: '96k' },
        { label: '64 kbps', description: t('options.bitrate.minQuality'), value: '64', shortLabel: '64k' },
    ], [t]);

    const formatOptions = useMemo<SettingSelectOption[]>(() => [
        { label: t('options.format.original'), description: t('options.format.originalDesc'), value: 'raw', shortLabel: t('options.format.original') },
        { label: 'MP3', description: t('options.format.mp3'), value: 'mp3', shortLabel: 'MP3' },
        { label: 'Opus', description: t('options.format.opus'), value: 'opus', shortLabel: 'Opus' },
        { label: 'AAC', description: t('options.format.aac'), value: 'aac', shortLabel: 'AAC' },
        { label: t('options.format.oggLabel'), description: t('options.format.ogg'), value: 'ogg', shortLabel: 'OGG' },
    ], [t]);

    const defaultTabOptions = useMemo<SettingSelectOption[]>(() => [
        { label: t('tabs.home'), description: t('options.defaultTab.homeDesc'), value: 'home', shortLabel: t('tabs.home') },
        { label: t('tabs.library'), description: t('options.defaultTab.libraryDesc'), value: 'library', shortLabel: t('tabs.library') },
        { label: t('tabs.downloads'), description: t('options.defaultTab.downloadsDesc'), value: 'downloads', shortLabel: t('tabs.downloads') },
        { label: t('tabs.search'), description: t('options.defaultTab.searchDesc'), value: 'search', shortLabel: t('tabs.search') },
    ], [t]);

    const defaultLibraryTabOptions = useMemo<SettingSelectOption[]>(() => [
        { label: t('library.tabs.playlists'), description: t('options.defaultLibraryTab.playlistsDesc'), value: 'playlists', shortLabel: t('library.tabs.playlists') },
        { label: t('library.tabs.artists'), description: t('options.defaultLibraryTab.artistsDesc'), value: 'artists', shortLabel: t('library.tabs.artists') },
        { label: t('library.tabs.albums'), description: t('options.defaultLibraryTab.albumsDesc'), value: 'albums', shortLabel: t('library.tabs.albums') },
        { label: t('library.tabs.songs'), description: t('options.defaultLibraryTab.songsDesc'), value: 'songs', shortLabel: t('library.tabs.songs') },
    ], [t]);

    const toastPositionOptions = useMemo<SettingSelectOption[]>(() => [
        { label: t('settings.toastPosition.options.top'), value: 'top' },
        { label: t('settings.toastPosition.options.bottom'), value: 'bottom' },
    ], [t]);

    const styles = useMemo(() => StyleSheet.create({
        settings: {
            paddingTop: 10,
        },
        scroll: {
            flex: 1,
        }
    }), []);

    return (
        <Container>
            <Header title={t('settings.title')} withBackIcon withAvatar={false} titleSize={20} />
            <ScrollView contentContainerStyle={{ paddingBottom: tabsHeight }}>
                <View style={styles.settings}>
                    <SettingsSection label={t('settings.sections.launch')} />
                    <Setting
                        id='app.persistQueue'
                        type='switch'
                        label={t('settings.persistQueue.label')}
                        description={t('settings.persistQueue.description')}
                    />
                    <Setting
                        id='app.defaultTab'
                        type='select'
                        label={t('settings.defaultTab.label')}
                        description={t('settings.defaultTab.description')}
                        icon={IconDoor}
                        defaultValue='home'
                        options={defaultTabOptions}
                    />
                    <Setting
                        id='app.defaultLibraryTab'
                        type='select'
                        label={t('settings.defaultLibraryTab.label')}
                        description={t('settings.defaultLibraryTab.description')}
                        icon={IconLayoutGrid}
                        defaultValue='playlists'
                        options={defaultLibraryTabOptions}
                    />
                    <SettingsSection label={t('settings.sections.streamingQuality')} />
                    <Setting
                        id='streaming.maxBitRate'
                        type='select'
                        label={t('settings.maxBitRate.label')}
                        description={t('settings.maxBitRate.description')}
                        icon={IconVolume}
                        defaultValue='0'
                        options={maxBitRateOptions}
                    />
                    <Setting
                        id='streaming.format'
                        type='select'
                        label={t('settings.format.label')}
                        description={t('settings.format.description')}
                        icon={IconFileMusic}
                        defaultValue='raw'
                        options={formatOptions}
                    />
                    <SettingsSection label={t('settings.sections.equalizer')} />
                    <EQSection />
                    <SettingsSection label={t('settings.sections.downloads')} />
                    <Setting
                        id='downloads.wifiOnly'
                        type='switch'
                        label={t('settings.wifiOnly.label')}
                        description={t('settings.wifiOnly.description')}
                        icon={IconWifi}
                    />
                    <Setting
                        id='downloads.maxBitRate'
                        type='select'
                        label={t('settings.maxBitRate.label')}
                        description={t('settings.maxBitRate.downloadDescription')}
                        icon={IconVolume}
                        defaultValue='0'
                        options={maxBitRateOptions}
                    />
                    <Setting
                        id='downloads.format'
                        type='select'
                        label={t('settings.format.label')}
                        description={t('settings.format.downloadDescription')}
                        icon={IconFileMusic}
                        defaultValue='raw'
                        options={formatOptions}
                    />
                    <SettingsSection label={t('settings.sections.storage')} />
                    <Setting
                        id='storage.clearCache'
                        type='button'
                        label={t('settings.clearCache.label')}
                        description={t('settings.clearCache.description')}
                        onPress={async () => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                            const confirmed = await SheetManager.show('confirm', {
                                payload: {
                                    title: t('settings.clearCache.confirmTitle'),
                                    message: t('settings.clearCache.confirmMessage'),
                                    confirmText: t('settings.clearCache.confirmButton'),
                                    cancelText: t('settings.clearCache.cancelButton'),
                                }
                            });
                            if (!confirmed) return;

                            await cache.clearAll();
                            memoryCache.clear();

                            await showToast({
                                title: t('settings.clearCache.successTitle'),
                                subtitle: t('settings.clearCache.successSubtitle'),
                                icon: IconCircleCheck,
                            });
                        }}
                    />
                    <SettingsSection label={t('settings.sections.layout')} />
                    <Setting
                        id='ui.toastPosition'
                        type='select'
                        label={t('settings.toastPosition.label')}
                        description={t('settings.toastPosition.description')}
                        defaultValue='top'
                        options={toastPositionOptions}
                    />
                    <Setting
                        id='ui.autoFocusSearchBar'
                        type='switch'
                        label={t('settings.autoFocusSearch.label')}
                        description={t('settings.autoFocusSearch.description')}
                    />
                    <SettingsSection label={t('settings.sections.developer')} />
                    <Setting
                        id='developer.copyId'
                        type='switch'
                        label={t('settings.copyId.label')}
                        description={t('settings.copyId.description')}
                    />
                    <SettingsSection label={t('settings.sections.language')} />
                    <Setting
                        id='app.language'
                        type='select'
                        label={t('settings.language.label')}
                        description={t('settings.language.description')}
                        icon={IconLanguage}
                        defaultValue={i18n.language}
                        options={languageOptions}
                        onValueChange={(value) => changeLanguage(value as SupportedLanguage)}
                    />
                </View>
            </ScrollView>
        </Container>
    )
}