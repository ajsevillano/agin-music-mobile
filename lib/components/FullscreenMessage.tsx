import { useColors } from '@lib/hooks';
import { Icon } from '@tabler/icons-react-native';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
    cancelAnimation,
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';
import Title from './Title';

export type FullscreenMessageProps = {
    icon: Icon;
    label: string;
    description?: string;
    animated?: boolean;
}

export default function FullscreenMessage({ icon: Icon, label, description, animated = false }: FullscreenMessageProps) {
    const colors = useColors();
    const scale = useSharedValue(1);

    useEffect(() => {
        if (!animated) return;
        scale.value = withRepeat(
            withTiming(1.08, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
            -1,
            true,
        );
        return () => cancelAnimation(scale);
    }, [animated, scale]);

    const iconAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const styles = useMemo(() => StyleSheet.create({
        container: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 32,
        },
        icon: {
            marginBottom: 5,
            opacity: 0.5,
        }
    }), []);

    return (
        <View style={styles.container}>
            <Animated.View style={[styles.icon, animated && iconAnimatedStyle]}>
                <Icon size={32} color={colors.text[0]} />
            </Animated.View>
            <Title size={16} align='center'>{label}</Title>
            {description && <Title size={12} align='center' fontFamily='Poppins-Regular' color={colors.text[1]}>{description}</Title>}
        </View>
    )
}
