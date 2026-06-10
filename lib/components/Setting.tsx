import { useColors } from '@lib/hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Switch, TouchableHighlight, TouchableHighlightProps, View } from 'react-native';
import Title from '@lib/components/Title';
import { Icon } from '@tabler/icons-react-native';
import { SheetManager } from 'react-native-actions-sheet';
import * as Haptics from 'expo-haptics';
import { SettingValue, useSetting, emitSettingChange } from '@lib/hooks/useSetting';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SettingId } from '@/app/(tabs)/(index,library,search)/settings';

export type SettingSelectOption = {
    icon?: Icon;
    label: string;
    description?: string;
    value: string;
    shortLabel?: string;
}

export interface SettingProps extends TouchableHighlightProps {
    icon?: Icon;
    id: SettingId;
    label: string;
    description?: string;
    type: 'select' | 'switch' | 'button';
    options?: SettingSelectOption[];
    defaultValue?: SettingValue;
    onValueChange?: (value: string) => void;
}

export default function Setting({ id, icon, label, description, type, options, defaultValue, onValueChange, ...props }: SettingProps) {
    const colors = useColors();
    const [value, setValue] = useState<SettingValue>();

    const initialValue = useSetting(id);

    useEffect(() => {
        setValue(initialValue ?? defaultValue);
    }, [initialValue, defaultValue]);

    const styles = useMemo(() => StyleSheet.create({
        option: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: 20,
            paddingVertical: 10,
            // borderBottomWidth: 1,
            // borderBottomColor: colors.border[0],
        },
    }), [colors]);

    // Persist + broadcast only on an actual user change. Writing in a [value]
    // effect would clobber the stored value with the default on mount, before
    // the real value has hydrated (which made the theme/select flicker or reset).
    const commit = useCallback((newValue: SettingValue) => {
        setValue(newValue);
        AsyncStorage.setItem(`settings.${id}`, JSON.stringify(newValue)).catch(() => { });
        emitSettingChange(id, newValue);
    }, [id]);

    const handlePress = useCallback(async () => {
        if (type == 'select') {
            Haptics.selectionAsync();
            const newValue = await SheetManager.show('settingSelect', {
                payload: {
                    setting: {
                        icon,
                        label,
                        description,
                    },
                    options: options ?? [],
                    value: value as string ?? '',
                }
            });
            if (newValue) {
                commit(newValue.value);
                onValueChange?.(newValue.value);
            }
        }
    }, [icon, label, description, value, options, commit]);

    const val = options?.find(o => o.value == value);

    return (
        <TouchableHighlight onPress={handlePress} underlayColor={colors.secondaryBackground} {...props}>
            <View style={styles.option}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                    <Title size={14}>{label}</Title>
                    {description && <Title size={12} color={colors.text[1]} fontFamily="Poppins-Regular">{description}</Title>}
                </View>
                {type == 'switch' && <Switch
                    trackColor={{ false: colors.segmentedControlBackground, true: colors.forcedTint }}
                    thumbColor={colors.text[0]}
                    ios_backgroundColor={colors.segmentedControlBackground}
                    value={!!value}
                    onValueChange={(value) => commit(value)}
                />}
                {type == 'select' && <Title size={12} color={colors.text[1]}>{val?.shortLabel ?? val?.label}</Title>}
            </View>
        </TouchableHighlight>
    )
}