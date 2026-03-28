import React from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { ComparisonCard } from './ComparisonCard';
import { Movie } from '../../types';
import { useAppDimensions } from '../../contexts/DimensionsContext';

const SWIPE_UP_THRESHOLD = 80;
const isWeb = Platform.OS === 'web';

interface SwipeableComparisonProps {
  movieA: Movie;
  movieB: Movie;
  onChooseA: () => void;
  onChooseB: () => void;
  onSkip: () => void;
  onMarkUnknownA?: () => void;
  onMarkUnknownB?: () => void;
  disabled?: boolean;
  winnerId: string | null;
  betaChanges: { a: number; b: number };
}

export function SwipeableComparison({
  movieA,
  movieB,
  onChooseA,
  onChooseB,
  onSkip,
  onMarkUnknownA,
  onMarkUnknownB,
  disabled,
  winnerId,
  betaChanges,
}: SwipeableComparisonProps) {
  const { containerWidth, height: screenHeight } = useAppDimensions();
  const swipeThreshold = containerWidth * 0.25;
  const cardSwipeThreshold = containerWidth * 0.15;

  // Container-level gesture values
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const leftScale = useSharedValue(1);
  const rightScale = useSharedValue(1);

  // Individual card gesture values
  const leftCardX = useSharedValue(0);
  const leftCardOpacity = useSharedValue(1);
  const rightCardX = useSharedValue(0);
  const rightCardOpacity = useSharedValue(1);

  // Left card swipe gesture (swipe left to mark unknown)
  const leftCardGesture = Gesture.Pan()
    .enabled(!disabled && !!onMarkUnknownA && !isWeb)
    .onUpdate((event) => {
      // Only allow swiping left (negative X)
      if (event.translationX < 0) {
        leftCardX.value = event.translationX;
        leftCardOpacity.value = 1 - Math.abs(event.translationX) / (containerWidth * 0.3);
      }
    })
    .onEnd((event) => {
      if (event.translationX < -cardSwipeThreshold && onMarkUnknownA) {
        // Animate out and trigger callback
        leftCardX.value = withTiming(-containerWidth * 0.5, { duration: 200 });
        leftCardOpacity.value = withTiming(0, { duration: 200 }, () => {
          runOnJS(onMarkUnknownA)();
        });
      } else {
        // Reset
        leftCardX.value = withSpring(0);
        leftCardOpacity.value = withSpring(1);
      }
    });

  // Right card swipe gesture (swipe right to mark unknown)
  const rightCardGesture = Gesture.Pan()
    .enabled(!disabled && !!onMarkUnknownB && !isWeb)
    .onUpdate((event) => {
      // Only allow swiping right (positive X)
      if (event.translationX > 0) {
        rightCardX.value = event.translationX;
        rightCardOpacity.value = 1 - Math.abs(event.translationX) / (containerWidth * 0.3);
      }
    })
    .onEnd((event) => {
      if (event.translationX > cardSwipeThreshold && onMarkUnknownB) {
        // Animate out and trigger callback
        rightCardX.value = withTiming(containerWidth * 0.5, { duration: 200 });
        rightCardOpacity.value = withTiming(0, { duration: 200 }, () => {
          runOnJS(onMarkUnknownB)();
        });
      } else {
        // Reset
        rightCardX.value = withSpring(0);
        rightCardOpacity.value = withSpring(1);
      }
    });

  // Container pan gesture for choosing/skipping — disabled on web (use tap instead)
  const panGesture = Gesture.Pan()
    .enabled(!disabled && !isWeb)
    .onUpdate((event) => {
      translateX.value = event.translationX * 0.4;
      translateY.value = Math.min(0, event.translationY * 0.5);

      // Scale feedback
      if (event.translationX > 20) {
        leftScale.value = 1 + (event.translationX / containerWidth) * 0.1;
        rightScale.value = 1 - (event.translationX / containerWidth) * 0.05;
      } else if (event.translationX < -20) {
        rightScale.value = 1 + (Math.abs(event.translationX) / containerWidth) * 0.1;
        leftScale.value = 1 - (Math.abs(event.translationX) / containerWidth) * 0.05;
      } else {
        leftScale.value = 1;
        rightScale.value = 1;
      }
    })
    .onEnd((event) => {
      // Check for swipe up (skip)
      if (event.translationY < -SWIPE_UP_THRESHOLD && Math.abs(event.translationX) < 50) {
        translateY.value = withTiming(-screenHeight * 0.3, { duration: 200 }, () => {
          runOnJS(onSkip)();
        });
        return;
      }

      // Check for swipe left (choose right/B)
      if (event.translationX < -swipeThreshold) {
        translateX.value = withTiming(-containerWidth * 0.3, { duration: 200 });
        runOnJS(onChooseB)();
      }
      // Check for swipe right (choose left/A)
      else if (event.translationX > swipeThreshold) {
        translateX.value = withTiming(containerWidth * 0.3, { duration: 200 });
        runOnJS(onChooseA)();
      }
      // Reset position
      else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        leftScale.value = withSpring(1);
        rightScale.value = withSpring(1);
      }
    });

  const containerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  const leftCardStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: leftScale.value },
      { translateX: leftCardX.value },
    ],
    opacity: leftCardOpacity.value,
  }));

  const rightCardStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: rightScale.value },
      { translateX: rightCardX.value },
    ],
    opacity: rightCardOpacity.value,
  }));

  const isMovieAWinner = winnerId === movieA.id;
  const isMovieBWinner = winnerId === movieB.id;

  // Reset card positions when movies change
  React.useEffect(() => {
    leftCardX.value = 0;
    leftCardOpacity.value = 1;
    rightCardX.value = 0;
    rightCardOpacity.value = 1;
  }, [movieA.id, movieB.id]);

  // On web, skip gesture detectors and rely on ComparisonCard's onSelect (tap/click)
  if (isWeb) {
    return (
      <View style={styles.container}>
        <View style={styles.cardWrapper}>
          <ComparisonCard
            movie={movieA}
            position="left"
            onSelect={onChooseA}
            disabled={disabled}
            isWinner={isMovieAWinner}
            isLoser={isMovieBWinner}
            betaChange={winnerId ? betaChanges.a : undefined}
          />
        </View>
        <View style={styles.cardWrapper}>
          <ComparisonCard
            movie={movieB}
            position="right"
            onSelect={onChooseB}
            disabled={disabled}
            isWinner={isMovieBWinner}
            isLoser={isMovieAWinner}
            betaChange={winnerId ? betaChanges.b : undefined}
          />
        </View>
      </View>
    );
  }

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.container, containerStyle]}>
        <GestureDetector gesture={leftCardGesture}>
          <Animated.View style={[styles.cardWrapper, leftCardStyle]}>
            <ComparisonCard
              movie={movieA}
              position="left"
              onSelect={onChooseA}
              disabled={disabled}
              isWinner={isMovieAWinner}
              isLoser={isMovieBWinner}
              betaChange={winnerId ? betaChanges.a : undefined}
            />
          </Animated.View>
        </GestureDetector>

        <GestureDetector gesture={rightCardGesture}>
          <Animated.View style={[styles.cardWrapper, rightCardStyle]}>
            <ComparisonCard
              movie={movieB}
              position="right"
              onSelect={onChooseB}
              disabled={disabled}
              isWinner={isMovieBWinner}
              isLoser={isMovieAWinner}
              betaChange={winnerId ? betaChanges.b : undefined}
            />
          </Animated.View>
        </GestureDetector>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingBottom: 16,
  },
  cardWrapper: {
    flex: 1,
  },
});
