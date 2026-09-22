/**
 * ReceiptScanScreen.tsx — the V2 full-screen "Scan" view: a receipt-shaped viewfinder, a
 * "READING RECEIPT…" status, and a shutter. There is no live camera preview (that needs
 * expo-camera, a native dependency the app doesn't ship): the shutter hands off to the system
 * camera via expo-image-picker, and "Choose from library" covers saved photos. The viewfinder is
 * therefore a stylised frame, not a video feed; it is always dark, like any camera UI.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, Animated, Easing, ActivityIndicator, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const CYAN = '#00E0E0';
const FRAME_H = 330;

interface Props {
  visible: boolean;
  /** A photo is being uploaded / read. */
  busy: boolean;
  onClose: () => void;
  onShutter: () => void;
  onLibrary: () => void;
}

export default function ReceiptScanScreen({ visible, busy, onClose, onShutter, onLibrary }: Props) {
  const insets = useSafeAreaInsets();
  const sweep = useRef(new Animated.Value(0)).current;

  // The scan line sweeps the frame only while a receipt is actually being read.
  useEffect(() => {
    if (!busy) { sweep.setValue(0.44); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(sweep, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [busy, sweep]);

  const lineY = sweep.interpolate({ inputRange: [0, 1], outputRange: [8, FRAME_H - 10] });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={busy ? undefined : onClose} statusBarTranslucent>
      <View style={styles.root}>
        <LinearGradient colors={['#14161F', '#0A0B11']} start={{ x: 0.3, y: 0 }} end={{ x: 0.6, y: 1 }} style={styles.viewfinder}>
          <View style={styles.frame}>
            <Animated.View style={[styles.scanLine, { transform: [{ translateY: lineY }] }]}>
              <LinearGradient colors={['transparent', CYAN, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            </Animated.View>
            <View style={styles.fakeLines} pointerEvents="none">
              {[62, 88, 74, 84, 56].map((w, i) => (
                <View key={i} style={[styles.fakeLine, { width: `${w}%`, height: i === 0 ? 9 : 7 }]} />
              ))}
            </View>
          </View>

          <View style={[styles.topRow, { top: insets.top + 24 }]}>
            <TouchableOpacity onPress={onClose} disabled={busy} style={[styles.closeBtn, busy && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel="Close scanner">
              <Ionicons name="close" size={16} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.status}>{busy ? 'READING RECEIPT…' : 'READY TO SCAN'}</Text>
            <View style={{ width: 38 }} />
          </View>
        </LinearGradient>

        <View style={[styles.controls, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <Text style={styles.hint}>
            {Platform.OS === 'web'
              ? 'Choose a photo of the receipt. Items, tax and tip are read automatically — you confirm before anything is saved.'
              : 'Hold steady. Items, tax and tip are read automatically — you confirm before anything is saved.'}
          </Text>
          {busy ? (
            <View style={styles.shutterSlot}><ActivityIndicator color="#fff" /></View>
          ) : (
            <TouchableOpacity
              onPress={Platform.OS === 'web' ? onLibrary : onShutter}
              activeOpacity={0.8}
              style={styles.shutterRing}
              accessibilityRole="button"
              accessibilityLabel={Platform.OS === 'web' ? 'Choose a photo' : 'Take a photo of the receipt'}
            >
              <View style={styles.shutterDot} />
            </TouchableOpacity>
          )}
          {!busy && Platform.OS !== 'web' && (
            <TouchableOpacity onPress={onLibrary} accessibilityRole="button" hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
              <Text style={styles.library}>Choose from library</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05060A' },
  viewfinder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: {
    width: 250, height: FRAME_H, borderRadius: 18, borderWidth: 1.5, borderColor: 'rgba(0,224,224,0.55)',
    backgroundColor: 'rgba(255,255,255,0.03)', overflow: 'hidden',
  },
  scanLine: { position: 'absolute', left: 0, right: 0, height: 2 },
  fakeLines: { position: 'absolute', top: 26, bottom: 26, left: 22, right: 22, gap: 11, opacity: 0.28 },
  fakeLine: { backgroundColor: '#fff', borderRadius: 2 },
  topRow: { position: 'absolute', left: 22, right: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  status: { fontFamily: 'IBMPlexMono-Regular', fontSize: 11, letterSpacing: 1.5, color: CYAN },
  controls: { paddingTop: 20, paddingHorizontal: 22, gap: 14, alignItems: 'center', minHeight: 172 },
  hint: { fontFamily: 'InstrumentSans-Regular', fontSize: 15, lineHeight: 22, color: '#9AA0AF', textAlign: 'center' },
  shutterRing: { width: 66, height: 66, borderRadius: 33, borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' },
  shutterDot: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#fff' },
  shutterSlot: { width: 66, height: 66, alignItems: 'center', justifyContent: 'center' },
  library: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 14, color: '#9AA0AF' },
});
