import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useHaptics } from '../../hooks/useHaptics';

type BannerType = 'need_more' | 'refine_top10' | 'share_ready' | 'almost_done';

interface EngagementBannerProps {
  type: BannerType;
  data?: {
    comparisons?: number;
    neededComparisons?: number;
  };
  onAction: () => void;
}

const BANNER_CONFIG: Record<BannerType, {
  emoji: string;
  title: string;
  subtitle: string;
  action: string;
  color: string;
}> = {
  need_more: {
    emoji: '🎯',
    title: 'Keep going!',
    subtitle: 'More comparisons = more accurate ranking',
    action: 'Continue',
    color: '#3b82f6',
  },
  refine_top10: {
    emoji: '✨',
    title: 'Refine your Top 10',
    subtitle: 'Your ranking is getting interesting',
    action: 'Fine-tune',
    color: '#8b5cf6',
  },
  share_ready: {
    emoji: '🏆',
    title: 'Your ranking is ready!',
    subtitle: 'Share your movie taste with friends',
    action: 'Share Top 10',
    color: '#22c55e',
  },
  almost_done: {
    emoji: '🔥',
    title: 'Almost there!',
    subtitle: 'X more picks for solid accuracy',
    action: 'Let\'s go',
    color: '#f59e0b',
  },
};

export function EngagementBanner({ type, data, onAction }: EngagementBannerProps) {
  const haptics = useHaptics();
  const scale = useSharedValue(1);
  const config = BANNER_CONFIG[type];

  // Format subtitle with data
  let subtitle = config.subtitle;
  if (type === 'almost_done' && data?.neededComparisons) {
    subtitle = `${data.neededComparisons} more picks for solid accuracy`;
  }

  const handlePress = () => {
    haptics.medium();
    scale.value = withSequence(
      withSpring(0.98),
      withSpring(1)
    );
    onAction();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable onPress={handlePress}>
      <Animated.View
        style={[
          styles.container,
          { borderLeftColor: config.color },
          animatedStyle,
        ]}
      >
        <Text style={styles.emoji}>{config.emoji}</Text>

        <View style={styles.content}>
          <Text style={styles.title}>{config.title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        <View style={[styles.actionButton, { backgroundColor: config.color }]}>
          <Text style={styles.actionText}>{config.action}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Determine which banner to show based on user state
 */
export function getBannerType(
  totalComparisons: number,
  knownMovies: number
): BannerType | null {
  // Less than 20 comparisons: encourage more
  if (totalComparisons < 20) {
    return 'need_more';
  }

  // Between 20-50: almost there
  if (totalComparisons < 50) {
    return 'almost_done';
  }

  // 50+ with good known count: share ready
  if (totalComparisons >= 50 && knownMovies >= 20) {
    return 'share_ready';
  }

  // 50+ but want refinement
  if (totalComparisons >= 30 && knownMovies >= 15) {
    return 'refine_top10';
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 12,
    marginVertical: 8,
    padding: 14,
    borderRadius: 12,
    borderLeftWidth: 4,
    gap: 12,
  },
  emoji: {
    fontSize: 28,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  subtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
});
