import React from 'react';
import Svg, { Path, Circle, Ellipse, Line } from 'react-native-svg';
import { Genre } from '../../types';
import { colors } from '../../theme/cinematic';

interface GenreIconProps {
  genre: Genre;
  size?: number;
  color?: string;
}

export function GenreIcon({ genre, size = 16, color = colors.textSecondary }: GenreIconProps) {
  const sw = 1.75;

  switch (genre) {
    case 'action':
      // Crosshair / target
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="8" stroke={color} strokeWidth={sw} />
          <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={sw} />
          <Path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'comedy':
      // Smiley face
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={sw} />
          <Circle cx="9" cy="10" r="1" fill={color} />
          <Circle cx="15" cy="10" r="1" fill={color} />
          <Path d="M8 15c1 2 7 2 8 0" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'drama':
      // Theatre masks
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          {/* Happy mask */}
          <Path d="M4 4h8c0 6-1 10-4 10S4 10 4 4z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <Circle cx="7" cy="8" r="0.8" fill={color} />
          <Circle cx="11" cy="8" r="0.8" fill={color} />
          <Path d="M7 11c.5 1 3 1 4 0" stroke={color} strokeWidth={1.25} strokeLinecap="round" />
          {/* Sad mask */}
          <Path d="M12 10h8c0 6-1 10-4 10s-4-4-4-10z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <Circle cx="15" cy="14" r="0.8" fill={color} />
          <Circle cx="19" cy="14" r="0.8" fill={color} />
          <Path d="M15 18c.5-1 3-1 4 0" stroke={color} strokeWidth={1.25} strokeLinecap="round" />
        </Svg>
      );

    case 'scifi':
      // Planet with ring
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="6" stroke={color} strokeWidth={sw} />
          <Ellipse cx="12" cy="12" rx="11" ry="4" stroke={color} strokeWidth={sw} transform="rotate(-30 12 12)" />
        </Svg>
      );

    case 'romance':
      // Heart
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M12 7.5C10.5 4 5 4 5 8.5c0 5 7 10 7 10s7-5 7-10c0-4.5-5.5-4.5-7-1z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
        </Svg>
      );

    case 'thriller':
      // Eye
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={sw} />
        </Svg>
      );

    case 'animation':
      // Wand with sparkle
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Line x1="6" y1="18" x2="16" y2="8" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M18 2l.5 2 2 .5-2 .5-.5 2-.5-2-2-.5 2-.5L18 2z" stroke={color} strokeWidth={1.25} strokeLinejoin="round" />
          <Path d="M10 3l.3 1.2 1.2.3-1.2.3L10 6l-.3-1.2L8.5 4.5l1.2-.3L10 3z" stroke={color} strokeWidth={1} strokeLinejoin="round" />
        </Svg>
      );

    case 'horror':
      // Skull
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M8 20v-3a8 8 0 0 1 0-12h8a8 8 0 0 1 0 12v3H8z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <Circle cx="9.5" cy="11" r="1.5" stroke={color} strokeWidth={sw} />
          <Circle cx="14.5" cy="11" r="1.5" stroke={color} strokeWidth={sw} />
          <Path d="M10 20v-2M14 20v-2" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'adventure':
      // Compass
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={sw} />
          <Path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
        </Svg>
      );

    case 'fantasy':
      // Sword
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M12 2v14" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M12 2l3 6H9l3-6z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <Path d="M8 14h8" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M10 16h4v3H10v-3z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <Line x1="12" y1="19" x2="12" y2="22" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    default:
      return null;
  }
}
