import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useHaptics } from '../../hooks/useHaptics';
import { CatMascot } from '../onboarding/CatMascot';
import { CinematicButton } from '../cinematic';
import { colors, borderRadius, typography, spacing } from '../../theme/cinematic';

export type RewardType =
  // Feature unlocks (based on postOnboardingComparisons)
  | 'taste_preview'           // 5 comparisons - early archetype preview
  | 'unlock_top10_search'     // 10 comparisons - top 10 + search
  | 'unlock_top25'            // 20 comparisons
  // Encouragement milestones
  | 'encouragement_30'        // 30 comparisons - "recommendations in 10 more"
  // More feature unlocks
  | 'unlock_recommendations'  // 40 comparisons
  | 'unlock_decide'           // 70 comparisons - personal Decide
  | 'unlock_all_rankings'     // 85 comparisons
  | 'unlock_taste_profile'    // 100 comparisons
  // Daily recommendation unlock (every 5 comparisons, max 5/day)
  | 'recommendation_earned'
  // Other rewards
  | 'new_top_movie';

interface MicroRewardProps {
  type: RewardType;
  data?: {
    movieTitle?: string;
    archetypeName?: string;
    count?: number;
  };
  onComplete: () => void;
  onNavigate?: () => void;
}

const REWARD_CONFIG: Record<RewardType, {
  title: string;
  subtitle: string;
  navigateLabel?: string;
  continueLabel?: string;
}> = {
  unlock_top10_search: {
    title: 'aaybee classic unlocked',
    subtitle: 'your ranking is taking shape',
    navigateLabel: 'view your classic',
  },
  encouragement_30: {
    title: 'you are doing great!',
    subtitle: 'you unlock your top 25 with 10 more comparisons',
    continueLabel: 'continue',
  },
  unlock_top25: {
    title: 'top 25 unlocked',
    subtitle: 'see more of your ranked movies',
    navigateLabel: 'view top 25',
  },
  unlock_recommendations: {
    title: 'recommendations unlocked',
    subtitle: 'earn up to 5 daily picks — 1 every 5 comparisons',
    navigateLabel: 'view recommendations',
  },
  unlock_decide: {
    title: 'personal decide unlocked',
    subtitle: 'let your rankings pick what to watch tonight',
    navigateLabel: 'try decide',
  },
  unlock_all_rankings: {
    title: 'full rankings unlocked',
    subtitle: 'see all your ranked movies',
    navigateLabel: 'view rankings',
  },
  unlock_taste_profile: {
    title: 'taste profile unlocked',
    subtitle: 'the complete picture of your taste',
    navigateLabel: 'view profile',
  },
  recommendation_earned: {
    title: 'recommendation unlocked',
    subtitle: 'a movie pick is waiting for you',
    navigateLabel: 'reveal',
    continueLabel: 'keep comparing',
  },
  new_top_movie: {
    title: 'new #1',
    subtitle: '',
  },
  taste_preview: {
    title: 'your taste is taking shape',
    subtitle: '',
    navigateLabel: 'see your taste',
    continueLabel: 'keep comparing',
  },
};

export function MicroReward({ type, data, onComplete, onNavigate }: MicroRewardProps) {
  const haptics = useHaptics();

  const isUnlockType = type.startsWith('unlock_');
  const isEncouragementType = type.startsWith('encouragement_');
  const isInteractiveType = isUnlockType || isEncouragementType || type === 'recommendation_earned' || type === 'taste_preview';

  const config = REWARD_CONFIG[type];
  const subtitle = type === 'taste_preview' && data?.archetypeName
    ? `you're ${data.archetypeName}`
    : type === 'new_top_movie' && data?.movieTitle
      ? data.movieTitle
      : config.subtitle;

  useEffect(() => {
    haptics.success();

    if (!isInteractiveType) {
      const timeout = setTimeout(onComplete, 2000);
      return () => clearTimeout(timeout);
    }
  }, []);

  const handleNavigate = () => {
    haptics.medium();
    onComplete();
    onNavigate?.();
  };

  const handleContinue = () => {
    haptics.light();
    onComplete();
  };

  return (
    <Animated.View
      style={styles.overlay}
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(200)}
    >
      <Pressable style={styles.content} onPress={!isInteractiveType ? handleContinue : undefined}>
        <CatMascot pose="arms" size={120} />

        {type === 'new_top_movie' && (
          <View style={styles.rankBadge}>
            <Text style={styles.rankBadgeText}>#1</Text>
          </View>
        )}

        <Text style={styles.title}>{config.title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

        {isInteractiveType && (
          <View style={styles.actions}>
            {config.navigateLabel && (
              <CinematicButton
                label={config.navigateLabel}
                variant="primary"
                onPress={handleNavigate}
                fullWidth
              />
            )}
            <CinematicButton
              label={config.continueLabel || 'continue'}
              variant={(config.navigateLabel && type !== 'recommendation_earned') ? 'ghost' : 'primary'}
              onPress={handleContinue}
              fullWidth
            />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

/**
 * Check if a feature unlock or encouragement milestone was reached based on postOnboardingComparisons
 */
export function checkUnlockMilestone(
  postOnboardingComparisons: number,
  previousPostOnboarding: number
): RewardType | null {
  const milestones: { threshold: number; type: RewardType }[] = [
    { threshold: 5, type: 'taste_preview' },
    { threshold: 10, type: 'unlock_top10_search' },
    { threshold: 20, type: 'encouragement_30' },
    { threshold: 30, type: 'unlock_top25' },
    { threshold: 40, type: 'unlock_recommendations' },
    { threshold: 70, type: 'unlock_decide' },
    { threshold: 85, type: 'unlock_all_rankings' },
    { threshold: 100, type: 'unlock_taste_profile' },
  ];

  for (const milestone of milestones) {
    if (previousPostOnboarding < milestone.threshold && postOnboardingComparisons >= milestone.threshold) {
      return milestone.type;
    }
  }

  return null;
}

/**
 * Check if top movie changed
 */
export function checkTopMovieChange(
  previousTopId: string | null,
  currentTopId: string | null
): boolean {
  if (!previousTopId || !currentTopId) return false;
  return previousTopId !== currentTopId;
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 80,
    zIndex: 100,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    width: '100%',
    maxWidth: 320,
  },
  rankBadge: {
    backgroundColor: colors.accent,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: borderRadius.sm,
    marginTop: spacing.md,
  },
  rankBadgeText: {
    ...typography.captionMedium,
    color: colors.background,
    fontWeight: '700',
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  actions: {
    width: '100%',
    gap: spacing.sm,
  },
});
