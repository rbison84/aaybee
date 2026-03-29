import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Polygon, Line, Circle, Text as SvgText } from 'react-native-svg';
import { TasteAxes, AXIS_LABELS } from '../utils/tasteAxes';
import { colors } from '../theme/cinematic';

interface TasteRadarProps {
  axes: TasteAxes;
  compareAxes?: TasteAxes; // Optional second profile for overlay
  size?: number;
}

export function TasteRadar({ axes, compareAxes, size = 240 }: TasteRadarProps) {
  const center = size / 2;
  const radius = (size / 2) - 40; // Leave room for labels
  const axisKeys: (keyof TasteAxes)[] = ['era', 'mood', 'pace', 'scope', 'popularity'];
  const n = axisKeys.length;

  // Convert axis value (-1..+1) to radius (0..radius)
  const valueToRadius = (v: number) => ((v + 1) / 2) * radius;

  // Get point on the chart for a given axis index and radius
  const getPoint = (index: number, r: number) => {
    const angle = (Math.PI * 2 * index) / n - Math.PI / 2;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  };

  // Grid rings
  const rings = [0.25, 0.5, 0.75, 1.0];

  // Data polygon points
  const dataPoints = axisKeys.map((key, i) => getPoint(i, valueToRadius(axes[key])));
  const dataPolygon = dataPoints.map(p => `${p.x},${p.y}`).join(' ');

  // Compare polygon
  let comparePolygon = '';
  if (compareAxes) {
    const comparePoints = axisKeys.map((key, i) => getPoint(i, valueToRadius(compareAxes[key])));
    comparePolygon = comparePoints.map(p => `${p.x},${p.y}`).join(' ');
  }

  // Label positions (pushed out slightly)
  const labelRadius = radius + 28;
  const labels = axisKeys.map((key, i) => {
    const point = getPoint(i, labelRadius);
    const axisVal = axes[key];
    const label = axisVal >= 0 ? AXIS_LABELS[key].high : AXIS_LABELS[key].low;
    return { ...point, label, key };
  });

  return (
    <View style={styles.container}>
      <Svg width={size} height={size}>
        {/* Grid rings */}
        {rings.map((r, i) => {
          const ringPoints = axisKeys.map((_, idx) => getPoint(idx, r * radius));
          const ringPolygon = ringPoints.map(p => `${p.x},${p.y}`).join(' ');
          return (
            <Polygon
              key={`ring-${i}`}
              points={ringPolygon}
              fill="none"
              stroke={colors.border}
              strokeWidth={0.5}
              opacity={0.5}
            />
          );
        })}

        {/* Axis lines */}
        {axisKeys.map((_, i) => {
          const end = getPoint(i, radius);
          return (
            <Line
              key={`axis-${i}`}
              x1={center}
              y1={center}
              x2={end.x}
              y2={end.y}
              stroke={colors.border}
              strokeWidth={0.5}
              opacity={0.5}
            />
          );
        })}

        {/* Compare polygon (if present) */}
        {compareAxes && (
          <Polygon
            points={comparePolygon}
            fill="rgba(134, 239, 172, 0.1)"
            stroke={colors.success}
            strokeWidth={1.5}
            strokeDasharray="4,4"
          />
        )}

        {/* Data polygon */}
        <Polygon
          points={dataPolygon}
          fill="rgba(255, 107, 43, 0.15)"
          stroke={colors.accent}
          strokeWidth={2}
        />

        {/* Data points */}
        {dataPoints.map((p, i) => (
          <Circle
            key={`point-${i}`}
            cx={p.x}
            cy={p.y}
            r={4}
            fill={colors.accent}
          />
        ))}

        {/* Compare points */}
        {compareAxes && axisKeys.map((key, i) => {
          const p = getPoint(i, valueToRadius(compareAxes[key]));
          return (
            <Circle
              key={`cpoint-${i}`}
              cx={p.x}
              cy={p.y}
              r={3}
              fill={colors.success}
            />
          );
        })}

        {/* Labels */}
        {labels.map((l, i) => (
          <SvgText
            key={`label-${i}`}
            x={l.x}
            y={l.y}
            fill={colors.textSecondary}
            fontSize={10}
            fontWeight="500"
            textAnchor="middle"
            alignmentBaseline="middle"
          >
            {l.label}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
