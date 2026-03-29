import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Rect, G, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors } from '../theme/cinematic';

type TabIconName = 'compare' | 'rankings' | 'daily' | 'discover' | 'decide' | 'challenge' | 'vs' | 'crews';

interface TabIconProps {
  name: TabIconName;
  active: boolean;
  size?: number;
}

export function TabIcon({ name, active, size = 24 }: TabIconProps) {
  const color = active ? colors.accent : colors.tabBarInactive;
  const strokeWidth = 1.75;

  switch (name) {
    case 'compare':
      // Two cards side-by-side (shuffle/compare)
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          {/* Left card */}
          <Rect
            x="2"
            y="4"
            width="8"
            height="12"
            rx="1.5"
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Right card (slightly offset) */}
          <Rect
            x="14"
            y="8"
            width="8"
            height="12"
            rx="1.5"
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
          />
        </Svg>
      );

    case 'rankings':
      // Horizontal bars (chart/list)
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          {/* Three horizontal bars of different lengths */}
          <Path
            d="M4 6h16M4 12h12M4 18h8"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        </Svg>
      );

    case 'discover':
      // Compass with sparkle
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          {/* Compass circle */}
          <Circle
            cx="12"
            cy="12"
            r="9"
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Compass needle (diamond shape) */}
          <Path
            d="M12 5l2 7-2 7-2-7 2-7z"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
            fill="none"
          />
          {/* Small sparkle dot */}
          <Circle cx="20" cy="4" r="1.5" fill={color} />
        </Svg>
      );

    case 'daily':
      // Calendar with star - special daily challenge icon
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          {/* Calendar body */}
          <Rect
            x="3"
            y="5"
            width="18"
            height="16"
            rx="2"
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Calendar top bar */}
          <Path
            d="M3 9h18"
            stroke={color}
            strokeWidth={strokeWidth}
          />
          {/* Calendar hooks */}
          <Path
            d="M8 3v4M16 3v4"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Star in center */}
          <Path
            d="M12 12l1.12 2.27 2.5.36-1.81 1.77.43 2.5L12 17.77l-2.24 1.18.43-2.5-1.81-1.77 2.5-.36L12 12z"
            stroke={color}
            strokeWidth={1.5}
            strokeLinejoin="round"
            fill={active ? color : 'none'}
          />
        </Svg>
      );

    case 'challenge':
    case 'vs':
      // Lightning bolt icon
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path
            d="M13 10V3L4 14h7v7l9-11h-7z"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
            fill={active ? color : 'none'}
          />
        </Svg>
      );

    case 'crews':
      // Calendar with star - same as daily icon
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          {/* Calendar body */}
          <Rect
            x="3"
            y="5"
            width="18"
            height="16"
            rx="2"
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Calendar top bar */}
          <Path
            d="M3 9h18"
            stroke={color}
            strokeWidth={strokeWidth}
          />
          {/* Calendar hooks */}
          <Path
            d="M8 3v4M16 3v4"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Star in center */}
          <Path
            d="M12 12l1.12 2.27 2.5.36-1.81 1.77.43 2.5L12 17.77l-2.24 1.18.43-2.5-1.81-1.77 2.5-.36L12 12z"
            stroke={color}
            strokeWidth={1.5}
            strokeLinejoin="round"
            fill={active ? color : 'none'}
          />
        </Svg>
      );

    case 'decide':
      // Clapperboard icon for "decide what to watch"
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          {/* Clapperboard base */}
          <Rect
            x="3"
            y="8"
            width="18"
            height="12"
            rx="2"
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Clapper top with stripes */}
          <Path
            d="M4 8L8 4h8l4 4"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {/* Diagonal stripes on clapper */}
          <Path
            d="M7 4l2 4M12 4l2 4"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        </Svg>
      );

    default:
      return null;
  }
}
