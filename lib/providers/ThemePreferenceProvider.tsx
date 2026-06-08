import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ColorSchemeOverride } from './ColorSchemeOverride';
import { useSetting } from '@lib/hooks/useSetting';

export type ThemePreference = 'system' | 'light' | 'dark';

// Same key + JSON encoding the generic `Setting` component uses, so the
// settings screen and this provider share one source of truth.
const STORAGE_KEY = 'settings.app.theme';

export function parseThemePreference(raw: string | null): ThemePreference {
    if (!raw) return 'system';
    let value: unknown = raw;
    try {
        value = JSON.parse(raw);
    } catch {
        // Legacy/raw value — use as-is.
    }
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

// Read once before first paint so a returning user doesn't flash the wrong theme.
export async function loadStoredThemePreference(): Promise<ThemePreference> {
    try {
        return parseThemePreference(await AsyncStorage.getItem(STORAGE_KEY));
    } catch {
        return 'system';
    }
}

type ThemePreferenceContextValue = {
    /** What the user picked: follow the OS, or force light/dark. */
    preference: ThemePreference;
    /** The resolved scheme actually in effect right now. */
    scheme: 'light' | 'dark';
};

const ThemePreferenceContext = createContext<ThemePreferenceContextValue>({
    preference: 'system',
    scheme: 'light',
});

export function useThemePreference() {
    return useContext(ThemePreferenceContext);
}

export default function ThemePreferenceProvider({
    initialPreference = 'system',
    children,
}: {
    initialPreference?: ThemePreference;
    children: ReactNode;
}) {
    // useSetting gives us the persisted value plus live updates when the user
    // changes it in Settings; fall back to the preloaded value before it resolves.
    const stored = useSetting('app.theme');
    const preference: ThemePreference =
        stored === 'light' || stored === 'dark' || stored === 'system' ? stored : initialPreference;

    const [systemScheme, setSystemScheme] = useState<'light' | 'dark'>(
        Appearance.getColorScheme() === 'dark' ? 'dark' : 'light',
    );

    useEffect(() => {
        const sub = Appearance.addChangeListener(({ colorScheme }) => {
            setSystemScheme(colorScheme === 'dark' ? 'dark' : 'light');
        });
        return () => sub.remove();
    }, []);

    const scheme: 'light' | 'dark' = preference === 'system' ? systemScheme : preference;
    // Feed useColors via the existing override context: undefined = follow system.
    const override = preference === 'system' ? undefined : preference;

    const value = useMemo(() => ({ preference, scheme }), [preference, scheme]);

    return (
        <ThemePreferenceContext.Provider value={value}>
            <ColorSchemeOverride.Provider value={override}>
                {children}
            </ColorSchemeOverride.Provider>
        </ThemePreferenceContext.Provider>
    );
}
