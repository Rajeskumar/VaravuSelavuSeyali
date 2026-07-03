import React from 'react';
import { Pressable, PressableProps, ViewStyle, StyleProp } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { motion } from '../theme';

interface Props extends PressableProps {
  style?: StyleProp<ViewStyle>;
  /** Scale applied while pressed. Defaults to theme.motion.pressScale (0.96). */
  scaleTo?: number;
  children: React.ReactNode;
}

/**
 * A Pressable that gives a gentle, Apple-like spring scale-down on press —
 * shared across nav items, buttons, and cards so every tap feels consistent.
 */
export default function AnimatedPressable({ style, scaleTo = motion.pressScale, children, onPressIn, onPressOut, ...rest }: Props) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Pressable carries the caller's layout style (flex sizing, padding, touch
  // target) exactly as a plain TouchableOpacity would; the inner Animated.View
  // only applies the press-scale transform to its content.
  return (
    <Pressable
      style={style}
      onPressIn={(e) => {
        scale.value = withSpring(scaleTo, motion.spring);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, motion.spring);
        onPressOut?.(e);
      }}
      {...rest}
    >
      <Animated.View style={animatedStyle}>{children}</Animated.View>
    </Pressable>
  );
}
