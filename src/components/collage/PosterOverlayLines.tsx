import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { colors } from '../../theme/colors';

interface PosterOverlayLinesProps {
  width: number;
  height: number;
}

export function PosterOverlayLines({ width, height }: PosterOverlayLinesProps) {
  // Generate 2-3 random diagonal lines
  const lines = React.useMemo(() => {
    const lineCount = 2 + Math.floor(Math.random() * 2); // 2-3 lines

    return Array.from({ length: lineCount }, (_, i) => {
      const color = colors.lineColors[i % colors.lineColors.length];

      // Random start and end points for diagonal lines
      const startX = Math.random() * width * 0.3;
      const startY = Math.random() * height;
      const endX = width * 0.7 + Math.random() * width * 0.3;
      const endY = Math.random() * height;

      return {
        key: i,
        color,
        x1: startX,
        y1: startY,
        x2: endX,
        y2: endY,
      };
    });
  }, [width, height]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.container]} pointerEvents="none">
      <Svg width={width} height={height}>
        {lines.map((line) => (
          <Line
            key={line.key}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke={line.color}
            strokeWidth={3.5}
            strokeLinecap="round"
            opacity={0.4}
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: 4,
  },
});
