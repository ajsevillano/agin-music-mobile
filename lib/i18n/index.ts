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

// Shared with the generic `Setting` component (id 'app.language'), which
// persists every setting JSON-encoded under `settings.<id>`. We MUST use the
// same key and encoding, otherwise the two writers fight over this key and the
// saved language is read back as an invalid value on the next launch.
const LANGUAGE_STORAGE_KEY = 'settings.app.language';

function getDeviceLanguage(): SupportedLanguage {
    const locale = Localization.getLocales()[0]?.languageCode ?? 'en';
    return SUPPORTED_LANGUAGES.includes(locale as SupportedLanguage)
        ? (locale as SupportedLanguage)
        : 'en';
}

function isSupported(value: unknown): value is SupportedLanguage {
    return typeof value === 'string' && SUPPORTED_LANGUAGES.includes(value as SupportedLanguage);
}

// The Setting component stores values JSON-encoded (e.g. `"en"`). Older builds
// of this module wrote the raw string (`en`). Accept both so existing installs
// don't get stuck on the wrong language.
function parseStoredLanguage(stored: string | null): SupportedLanguage | null {
    if (!stored) return null;
    try {
        const parsed = JSON.parse(stored);
        if (isSupported(parsed)) return parsed;
    } catch {
        // Not JSON — fall back to treating it as a raw value.
    }
    return isSupported(stored) ? stored : null;
}

export async function initI18n() {
    let savedLanguage: SupportedLanguage | null = null;

    try {
        savedLanguage = parseStoredLanguage(await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY));
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
    // JSON-encode to match the `Setting` component's storage format on the same key.
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, JSON.stringify(lang));
    await i18n.changeLanguage(lang);
}

export default i18n;
