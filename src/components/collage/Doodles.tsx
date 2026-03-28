import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Circle, G, Line } from 'react-native-svg';
import { colors } from '../../theme/colors';

interface DoodleProps {
  size?: number;
  color?: string;
  rotation?: number;
  style?: any;
}

// Hand-drawn star with imperfect points
export function DoodleStar({ size = 30, color = colors.black, rotation = 0, style }: DoodleProps) {
  return (
    <View style={[{ transform: [{ rotate: `${rotation}deg` }] }, style]}>
      <Svg width={size} height={size} viewBox="0 0 40 40">
        <Path
          d="M20 2 L24 15 L38 15 L27 24 L31 38 L20 29 L9 38 L13 24 L2 15 L16 15 Z"
          stroke={color}
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

// Filled star variant
export function DoodleStarFilled({ size = 30, color = colors.yellow, rotation = 0, style }: DoodleProps) {
  return (
    <View style={[{ transform: [{ rotate: `${rotation}deg` }] }, style]}>
      <Svg width={size} height={size} viewBox="0 0 40 40">
        <Path
          d="M20 2 L24 15 L38 15 L27 24 L31 38 L20 29 L9 38 L13 24 L2 15 L16 15 Z"
          stroke={colors.black}
          strokeWidth={2}
          fill={color}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

// Simple smiley face
export function DoodleSmiley({ size = 24, color = colors.black, rotation = 0, style }: DoodleProps) {
  return (
    <View style={[{ transform: [{ rotate: `${rotation}deg` }] }, style]}>
      <Svg width={size} height={size} viewBox="0 0 40 40">
        <Circle
          cx="20"
          cy="20"
          r="17"
          stroke={color}
          strokeWidth={2.5}
          fill="none"
        />
        <Circle cx="13" cy="16" r="2.5" fill={color} />
        <Circle cx="27" cy="16" r="2.5" fill={color} />
        <Path
          d="M12 26 Q20 33 28 26"
          stroke={color}
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

// Heart doodle
export function DoodleHeart({ size = 28, color = colors.magenta, rotation = 0, style }: DoodleProps) {
  return (
    <View style={[{ transform: [{ rotate: `${rotation}deg` }] }, style]}>
      <Svg width={size} height={size} viewBox="0 0 40 40">
        <Path
          d="M20 35 C10 25 2 18 2 12 C2 6 7 2 12 2 C16 2 19 5 20 8 C21 5 24 2 28 2 C33 2 38 6 38 12 C38 18 30 25 20 35 Z"
          stroke={color}
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

// Heart filled
export function DoodleHeartFilled({ size = 28, color = colors.magenta, rotation = 0, style }: DoodleProps) {
  return (
    <View style={[{ transform: [{ rotate: `${rotation}deg` }] }, style]}>
      <Svg width={size} height={size} viewBox="0 0 40 40">
        <Path
          d="M20 35 C10 25 2 18 2 12 C2 6 7 2 12 2 C16 2 19 5 20 8 C21 5 24 2 28 2 C33 2 38 6 38 12 C38 18 30 25 20 35 Z"
          stroke={colors.black}
          strokeWidth={2}
          fill={color}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

// Film reel icon
export function DoodleFilm({ size = 32, color = colors.black, rotation = 0, style }: DoodleProps) {
  return (
    <View style={[{ transform: [{ rotate: `${rotation}deg` }] }, style]}>
      <Svg width={size} height={size} viewBox="0 0 40 40">
        <G stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round">
          {/* Film strip */}
          <Path d="M8 4 L8 36" />
          <Path d="M32 4 L32 36" />
          <Path d="M8 4 L32 4" />
          <Path d="M8 36 L32 36" />
          {/* Sprocket holes */}
          <Circle cx="8" cy="10" r="2" fill={color} />
          <Circle cx="8" cy="20" r="2" fill={color} />
          <Circle cx="8" cy="30" r="2" fill={color} />
          <Circle cx="32" cy="10" r="2" fill={color} />
          <Circle cx="32" cy="20" r="2" fill={color} />
          <Circle cx="32" cy="30" r="2" fill={color} />
          {/* Frame lines */}
          <Path d="M12 12 L28 12" />
          <Path d="M12 28 L28 28" />
        </G>
      </Svg>
    </View>
  );
}

// Curved arrow
export function DoodleArrow({ size = 40, color = colors.black, rotation = 0, style }: DoodleProps) {
  return (
    <View style={[{ transform: [{ rotate: `${rotation}deg` }] }, style]}>
      <Svg width={size} height={size} viewBox="0 0 50 50">
        <Path
          d="M10 35 Q25 10 40 25"
          stroke={color}
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d="M35 18 L40 25 L33 28"
          stroke={color}
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

// Sparkle/twinkle
export function DoodleSparkle({ size = 20, color = colors.yellow, rotation = 0, style }: DoodleProps) {
  return (
    <View style={[{ transform: [{ rotate: `${rotation}deg` }] }, style]}>
      <Svg width={size} height={size} viewBox="0 0 30 30">
        <Path
          d="M15 2 L15 28 M2 15 L28 15 M6 6 L24 24 M24 6 L6 24"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

// Squiggle line
export function DoodleSquiggle({ size = 50, color = colors.cyan, rotation = 0, style }: DoodleProps) {
  return (
    <View style={[{ transform: [{ rotate: `${rotation}deg` }] }, style]}>
      <Svg width={size} height={size * 0.4} viewBox="0 0 60 24">
        <Path
          d="M4 12 Q12 4 20 12 Q28 20 36 12 Q44 4 52 12"
          stroke={color}
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

// Exclamation marks
export function DoodleExclaim({ size = 24, color = colors.red, rotation = 0, style }: DoodleProps) {
  return (
    <View style={[{ transform: [{ rotate: `${rotation}deg` }] }, style]}>
      <Svg width={size} height={size} viewBox="0 0 30 40">
        <Path
          d="M15 4 L15 26"
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
        />
        <Circle cx="15" cy="35" r="3" fill={color} />
      </Svg>
    </View>
  );
}

// Lightning bolt
export function DoodleLightning({ size = 28, color = colors.yellow, rotation = 0, style }: DoodleProps) {
  return (
    <View style={[{ transform: [{ rotate: `${rotation}deg` }] }, style]}>
      <Svg width={size} height={size} viewBox="0 0 30 40">
        <Path
          d="M18 2 L8 18 L14 18 L12 38 L22 18 L16 18 Z"
          stroke={colors.black}
          strokeWidth={2}
          fill={color}
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

// Component that renders random scattered doodles
interface ScatteredDoodlesProps {
  count?: number;
  area: { width: number; height: number };
}

export function ScatteredDoodles({ count = 8, area }: ScatteredDoodlesProps) {
  const doodles = React.useMemo(() => {
    const DoodleComponents = [
      DoodleStar,
      DoodleStarFilled,
      DoodleSmiley,
      DoodleHeart,
      DoodleSparkle,
      DoodleSquiggle,
      DoodleFilm,
    ];

    const doodleColors = [colors.black, colors.cyan, colors.magenta, colors.yellow];

    return Array.from({ length: count }, (_, i) => {
      const Component = DoodleComponents[Math.floor(Math.random() * DoodleComponents.length)];
      const color = doodleColors[Math.floor(Math.random() * doodleColors.length)];
      const size = 20 + Math.random() * 20;
      const rotation = Math.random() * 360;
      const x = Math.random() * (area.width - size);
      const y = Math.random() * (area.height - size);

      return { Component, color, size, rotation, x, y, key: i };
    });
  }, [count, area.width, area.height]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {doodles.map(({ Component, color, size, rotation, x, y, key }) => (
        <View
          key={key}
          style={{
            position: 'absolute',
            left: x,
            top: y,
          }}
        >
          <Component size={size} color={color} rotation={rotation} />
        </View>
      ))}
    </View>
  );
}
