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
  // only applies the press-scale transform to its content. It's stretched to
  // fill (`width: '100%'`, row+centered) rather than left shrink-wrapped to its
  // content — shrink-wrap made an absolutely-positioned fill (e.g. CustomButton's
  // gradient) size itself to this wrapper instead of the full button, only
  // painting a patch behind the label; the row/center rules keep multi-child
  // content (icon + label) laid out the same as before the wrapper was widened.
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
      <Animated.View
        style={[
          { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
          animatedStyle,
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}
