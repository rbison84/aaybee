import React from 'react';
import { Platform, View } from 'react-native';

// Web: use qrcode.react (DOM SVG)
// Native: use react-native-qrcode-svg
let WebQR: any = null;
let NativeQR: any = null;

if (Platform.OS === 'web') {
  try {
    WebQR = require('qrcode.react').QRCodeSVG;
  } catch {}
} else {
  try {
    NativeQR = require('react-native-qrcode-svg').default;
  } catch {}
}

interface QRCodeProps {
  value: string;
  size?: number;
  backgroundColor?: string;
  color?: string;
}

export function QRCode({ value, size = 120, backgroundColor = '#FFFFFF', color = '#000000' }: QRCodeProps) {
  if (Platform.OS === 'web' && WebQR) {
    return (
      <WebQR
        value={value}
        size={size}
        bgColor={backgroundColor}
        fgColor={color}
        level="M"
      />
    );
  }

  if (Platform.OS !== 'web' && NativeQR) {
    return (
      <NativeQR
        value={value}
        size={size}
        backgroundColor={backgroundColor}
        color={color}
        ecl="M"
      />
    );
  }

  return null;
}
