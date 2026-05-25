import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './locales/en.json';
import es from './locales/es.json';

export const SUPPORTED_LANGUAGES = ['en', 'es'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
    en: 'English',
    es: 'Español',
};

const LANGUAGE_STORAGE_KEY = 'settings.app.language';

function getDeviceLanguage(): SupportedLanguage {
    const locale = Localization.getLocales()[0]?.languageCode ?? 'en';
    return SUPPORTED_LANGUAGES.includes(locale as SupportedLanguage)
        ? (locale as SupportedLanguage)
        : 'en';
}

export async function initI18n() {
    let savedLanguage: SupportedLanguage | null = null;

    try {
        const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (stored && SUPPORTED_LANGUAGES.includes(stored as SupportedLanguage)) {
            savedLanguage = stored as SupportedLanguage;
        }
    } catch {
        // Fall through to device default
    }

    const lng = savedLanguage ?? getDeviceLanguage();

    await i18n.use(initReactI18next).init({
        lng,
        fallbackLng: 'en',
        resources: {
            en: { translation: en },
            es: { translation: es },
        },
        interpolation: {
            escapeValue: false,
        },
        compatibilityJSON: 'v4',
    });
}

export async function changeLanguage(lang: SupportedLanguage) {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    await i18n.changeLanguage(lang);
}

export default i18n;
