import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { colors } from '../../theme/colors';
import { useAppDimensions } from '../../contexts/DimensionsContext';

interface CollageBackgroundProps {
  children: React.ReactNode;
}

export function CollageBackground({ children }: CollageBackgroundProps) {
  const { containerWidth, height } = useAppDimensions();

  // Pre-generate noise positions (memoized to avoid regenerating on every render)
  const noisePositions = useMemo(() => {
    return Array.from({ length: 50 }).map(() => ({
      x: Math.random() * containerWidth,
      y: Math.random() * height,
    }));
  }, [containerWidth, height]);

  return (
    <View style={styles.container}>
      {/* Base cream color */}
      <View style={styles.baseLayer} />

      {/* Noise texture overlay - simulated with small dots */}
      <View style={styles.noiseOverlay} pointerEvents="none">
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          {noisePositions.map((pos, i) => (
            <Rect
              key={i}
              x={pos.x}
              y={pos.y}
              width={1}
              height={1}
              fill="rgba(0,0,0,0.03)"
            />
          ))}
        </Svg>
      </View>

      {/* Paper grain effect - subtle lines */}
      <View style={styles.grainOverlay} pointerEvents="none" />

      {/* Content */}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  baseLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.cream,
  },
  noiseOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.3,
  },
  grainOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    opacity: 0.02,
  },
});
