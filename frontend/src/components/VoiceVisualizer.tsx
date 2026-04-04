import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { colors } from '../utils/theme';

interface VoiceVisualizerProps {
  isListening: boolean;
  isSpeaking: boolean;
  metering?: number; // 0 to 1 normalized
}

const BAR_COUNT = 7;

function VisualizerBar({
  index,
  isListening,
  isSpeaking,
  metering,
}: {
  index: number;
  isListening: boolean;
  isSpeaking: boolean;
  metering: number;
}) {
  const animation = useSharedValue(1);

  useEffect(() => {
    if (isListening) {
      const target = 1 + (metering * (1.5 + (index % 3)));
      animation.value = withTiming(target, { duration: 80 });
      return;
    }

    if (isSpeaking) {
      animation.value = withDelay(
        index * 80,
        withRepeat(
          withSequence(withTiming(2, { duration: 300 }), withTiming(1, { duration: 300 })),
          -1,
          true
        )
      );
      return;
    }

    animation.value = withTiming(1, { duration: 300 });
  }, [animation, index, isListening, isSpeaking, metering]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: animation.value }],
    opacity: isListening ? 1 : 0.6,
  }), [animation, isListening]);

  return (
    <Animated.View
      style={[
        styles.bar,
        { backgroundColor: isSpeaking ? colors.primary : colors.textSecondary },
        animatedStyle,
      ]}
    />
  );
}

export function VoiceVisualizer({ isListening, isSpeaking, metering = 0 }: VoiceVisualizerProps) {
  return (
    <View style={styles.container}>
      {Array.from({ length: BAR_COUNT }, (_, index) => (
        <VisualizerBar
          key={`bar-${index}`}
          index={index}
          isListening={isListening}
          isSpeaking={isSpeaking}
          metering={metering}
        />
      ))}
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
