import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { colors } from '../theme/cinematic';

interface GiftIconProps {
  size?: number;
  color?: string;
}

export function GiftIcon({ size = 64, color = colors.textMuted }: GiftIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Lid */}
      <Rect
        x="2"
        y="8"
        width="20"
        height="4"
        rx="1"
        stroke={color}
        strokeWidth={1.75}
        fill="none"
      />
      {/* Box body */}
      <Rect
        x="4"
        y="12"
        width="16"
        height="8"
        rx="1"
        stroke={color}
        strokeWidth={1.75}
        fill="none"
      />
      {/* Vertical ribbon */}
      <Path
        d="M12 8v12"
        stroke={color}
        strokeWidth={1.75}
      />
      {/* Bow left */}
      <Path
        d="M12 8c0-3-4-3-4 0"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        fill="none"
      />
      {/* Bow right */}
      <Path
        d="M12 8c0-3 4-3 4 0"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}
