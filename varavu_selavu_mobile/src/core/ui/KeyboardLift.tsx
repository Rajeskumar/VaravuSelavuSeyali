import React from 'react';
import { KeyboardAvoidingView, KeyboardAvoidingViewProps, Platform } from 'react-native';

/**
 * Lifts a modal's content above the Android keyboard, for modals that have no iOS keyboard handling of their own
 * (iOS behaviour is left as it was). A modal is a separate window that, edge-to-edge, is not resized for the keyboard.
 * Replace the modal's full-height container with this, and make sure tall content inside it can shrink.
 */
export default function KeyboardLift(props: KeyboardAvoidingViewProps) {
  return <KeyboardAvoidingView behavior={Platform.OS === 'android' ? 'padding' : undefined} {...props} />;
}
