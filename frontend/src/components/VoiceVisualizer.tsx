import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { colors } from '../utils/theme';

interface VoiceVisualizerProps {
  isListening: boolean;
  isSpeaking: boolean;
  metering?: number; // 0 to 1 normalized
}

const BAR_COUNT = 7;

export function VoiceVisualizer({ isListening, isSpeaking, metering = 0 }: VoiceVisualizerProps) {
  const animations = Array.from({ length: BAR_COUNT }, () => useSharedValue(1));

  useEffect(() => {
    if (isListening) {
      // Scale based on live metering
      animations.forEach((anim, i) => {
        const target = 1 + (metering * (1.5 + (i % 3)));
        anim.value = withTiming(target, { duration: 80 });
      });
    } else if (isSpeaking) {
      // Pulse generically during playback
      animations.forEach((anim, i) => {
        anim.value = withDelay(
          i * 80,
          withRepeat(
            withSequence(withTiming(2, { duration: 300 }), withTiming(1, { duration: 300 })),
            -1,
            true
          )
        );
      });
    } else {
      animations.forEach((anim) => {
        anim.value = withTiming(1, { duration: 300 });
      });
    }
  }, [isListening, isSpeaking, metering]);

  return (
    <View style={styles.container}>
      {animations.map((anim, i) => {
        const animatedStyle = useAnimatedStyle(() => ({
          transform: [{ scaleY: anim.value }],
          opacity: isListening ? 1 : 0.6,
        }));

        return (
          <Animated.View
            key={`bar-${i}`}
            style={[
              styles.bar,
              { backgroundColor: isSpeaking ? colors.primary : colors.textSecondary },
              animatedStyle,
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 48,
  },
  bar: {
    width: 4,
    height: 16,
    borderRadius: 2,
  },
});
