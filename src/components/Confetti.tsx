import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { useAppDimensions } from '../contexts/DimensionsContext';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
const PARTICLE_COUNT = 50;

interface ConfettiProps {
  visible: boolean;
  onComplete?: () => void;
}

interface Particle {
  id: number;
  x: number;
  color: string;
  size: number;
  rotation: number;
}

function ConfettiParticle({ particle, index, fallDistance }: { particle: Particle; index: number; fallDistance: number }) {
  const translateY = useSharedValue(-50);
  const translateX = useSharedValue(0);
  const rotation = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    const delay = index * 20;
    const duration = 2000 + Math.random() * 1000;
    const horizontalMovement = (Math.random() - 0.5) * 100;

    translateY.value = withDelay(delay, withTiming(fallDistance + 50, {
      duration,
      easing: Easing.out(Easing.quad),
    }));

    translateX.value = withDelay(delay, withTiming(horizontalMovement, {
      duration,
      easing: Easing.inOut(Easing.sin),
    }));

    rotation.value = withDelay(delay, withTiming(particle.rotation * 720, {
      duration,
      easing: Easing.linear,
    }));

    opacity.value = withDelay(delay + duration * 0.7, withTiming(0, {
      duration: duration * 0.3,
    }));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotation.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          left: particle.x,
          width: particle.size,
          height: particle.size * (Math.random() > 0.5 ? 1 : 2),
          backgroundColor: particle.color,
          borderRadius: particle.size / 4,
        },
        animatedStyle,
      ]}
    />
  );
}

export function Confetti({ visible, onComplete }: ConfettiProps) {
  const { containerWidth, height: screenHeight } = useAppDimensions();
  const containerOpacity = useSharedValue(0);

  // Generate particles
  const particles: Particle[] = React.useMemo(() => {
    if (!visible) return [];
    return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      id: i,
      x: Math.random() * containerWidth,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 6 + Math.random() * 8,
      rotation: Math.random() > 0.5 ? 1 : -1,
    }));
  }, [visible, containerWidth]);

  useEffect(() => {
    if (visible) {
      containerOpacity.value = 1;

      // Auto-dismiss after animation
      const timer = setTimeout(() => {
        containerOpacity.value = withTiming(0, { duration: 300 }, () => {
          if (onComplete) runOnJS(onComplete)();
        });
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [visible]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[styles.container, containerStyle]} pointerEvents="none">
      {particles.map((particle, index) => (
        <ConfettiParticle key={particle.id} particle={particle} index={index} fallDistance={screenHeight} />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    overflow: 'hidden',
  },
  particle: {
    position: 'absolute',
    top: 0,
  },
});
