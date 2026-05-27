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

export type EqualizerBarsProps = {
    color: string;
    isPlaying?: boolean;
    size?: number;
}

const BAR_DURATIONS = [520, 380, 460];
const BAR_INITIAL_RATIO = [0.45, 0.85, 0.35];
const BAR_PEAK_RATIO = [0.95, 0.35, 0.85];
const PAUSED_RATIO = 0.35;

export default function EqualizerBars({ color, isPlaying = true, size = 16 }: EqualizerBarsProps) {
    const bar1 = useSharedValue(BAR_INITIAL_RATIO[0]);
    const bar2 = useSharedValue(BAR_INITIAL_RATIO[1]);
    const bar3 = useSharedValue(BAR_INITIAL_RATIO[2]);

    useEffect(() => {
        const bars = [bar1, bar2, bar3];
        if (isPlaying) {
            bars.forEach((value, i) => {
                value.value = withRepeat(
                    withTiming(BAR_PEAK_RATIO[i], {
                        duration: BAR_DURATIONS[i],
                        easing: Easing.inOut(Easing.quad),
                    }),
                    -1,
                    true,
                );
            });
        } else {
            bars.forEach((value) => {
                cancelAnimation(value);
                value.value = withTiming(PAUSED_RATIO, { duration: 200, easing: Easing.out(Easing.ease) });
            });
        }
        return () => bars.forEach(value => cancelAnimation(value));
    }, [isPlaying, bar1, bar2, bar3]);

    const styles = useMemo(() => StyleSheet.create({
        container: {
            width: size,
            height: size,
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
        },
        bar: {
            width: Math.max(2, Math.floor(size / 6)),
            borderRadius: 2,
            backgroundColor: color,
        },
    }), [color, size]);

    const bar1Style = useAnimatedStyle(() => ({ height: `${Math.round(bar1.value * 100)}%` }));
    const bar2Style = useAnimatedStyle(() => ({ height: `${Math.round(bar2.value * 100)}%` }));
    const bar3Style = useAnimatedStyle(() => ({ height: `${Math.round(bar3.value * 100)}%` }));

    return (
        <View style={styles.container} accessibilityRole='image' accessibilityLabel='Now playing'>
            <Animated.View style={[styles.bar, bar1Style]} />
            <Animated.View style={[styles.bar, bar2Style]} />
            <Animated.View style={[styles.bar, bar3Style]} />
        </View>
    );
}
