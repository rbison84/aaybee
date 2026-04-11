// ============================================
// My Games — Current (waiting) and History (completed) tabs
// ============================================

import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuth } from '../contexts/AuthContext';
import { knockoutService, KnockoutChallenge } from '../services/knockoutService';
import { colors, spacing, borderRadius } from '../theme/cinematic';

type TabType = 'current' | 'history';

interface MyGamesScreenProps {
  onViewGame?: (code: string) => void;
  onPlayChallenge?: (code: string) => void;
}

export function MyGamesScreen({ onViewGame, onPlayChallenge }: MyGamesScreenProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('current');
  const [challenges, setChallenges] = useState<KnockoutChallenge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    knockoutService.getMyChallenges(user.id).then((data) => {
      setChallenges(data);
      setLoading(false);
    });
  }, [user?.id]);

  if (!user?.id) {
    return (
      <View style={styles.container}>
        <View style={styles.emptySection}>
          <Text style={styles.emptyTitle}>SIGN IN TO SEE YOUR GAMES</Text>
        </View>
      </View>
    );
  }

  // Split into current (waiting for someone) and history (complete)
  const current = challenges.filter(c => {
    if (c.status === 'waiting') {
      // I created it and it's waiting for challenger
      if (c.creator_id === user.id) return true;
      // I was challenged and haven't played yet
      if (c.challenged_user_id === user.id) return true;
    }
    return false;
  });

  const history = challenges.filter(c => c.status === 'complete');

  const renderGame = (game: KnockoutChallenge) => {
    const isCreator = game.creator_id === user.id;
    const isChallenger = game.challenger_id === user.id;
    const isChallengeTarget = game.challenged_user_id === user.id;
    const otherName = isCreator
      ? (game.challenger_name || game.challenged_user_id ? 'Waiting...' : 'Anyone')
      : game.creator_name;

    const winnerTitle = isCreator
      ? game.creator_winner?.title
      : (game.challenger_winner?.title || game.creator_winner?.title);

    return (
      <Animated.View key={game.id} entering={FadeInDown.duration(300)}>
        <Pressable
          style={styles.gameCard}
          onPress={() => {
            if (game.status === 'complete') {
              onViewGame?.(game.code);
            } else if (isChallengeTarget && game.status === 'waiting') {
              onPlayChallenge?.(game.code);
            }
          }}
        >
          <View style={styles.gameRow}>
            <View style={styles.gameLeft}>
              <Text style={styles.gameName}>
                {isCreator ? 'YOU' : game.creator_name.toUpperCase()}
                {' VS '}
                {game.status === 'complete'
                  ? (isCreator ? (game.challenger_name || '?').toUpperCase() : 'YOU')
                  : '...'}
              </Text>
              {winnerTitle && (
                <Text style={styles.gameWinner} numberOfLines={1}>
                  {game.status === 'complete' ? `WINNER: ${winnerTitle.toUpperCase()}` : `YOUR PICK: ${winnerTitle.toUpperCase()}`}
                </Text>
              )}
            </View>
            <View style={styles.gameRight}>
              {game.status === 'complete' && game.match_percent != null ? (
                <Text style={styles.gamePercent}>{game.match_percent}%</Text>
              ) : isChallengeTarget && game.status === 'waiting' ? (
                <View style={styles.playBadge}>
                  <Text style={styles.playBadgeText}>PLAY</Text>
                </View>
              ) : (
                <Text style={styles.gameStatus}>WAITING</Text>
              )}
            </View>
          </View>
          <Text style={styles.gameDate}>{getTimeAgo(game.created_at)}</Text>
        </Pressable>
      </Animated.View>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {/* Tabs */}
      <View style={styles.tabBar}>
        <Pressable style={[styles.tab, activeTab === 'current' && styles.tabActive]} onPress={() => setActiveTab('current')}>
          <Text style={[styles.tabText, activeTab === 'current' && styles.tabTextActive]}>
            CURRENT{current.length > 0 ? ` (${current.length})` : ''}
          </Text>
        </Pressable>
        <Pressable style={[styles.tab, activeTab === 'history' && styles.tabActive]} onPress={() => setActiveTab('history')}>
          <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>HISTORY</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={colors.textMuted} style={{ marginTop: spacing.xxl }} />
      ) : (
        <View style={styles.gamesList}>
          {activeTab === 'current' ? (
            current.length === 0 ? (
              <View style={styles.emptySection}>
                <Text style={styles.emptyTitle}>NO ACTIVE GAMES</Text>
                <Text style={styles.emptySubtitle}>CHALLENGE A FRIEND FROM THE FRIENDS TAB</Text>
              </View>
            ) : (
              current.map(renderGame)
            )
          ) : (
            history.length === 0 ? (
              <View style={styles.emptySection}>
                <Text style={styles.emptyTitle}>NO COMPLETED GAMES YET</Text>
              </View>
            ) : (
              history.map(renderGame)
            )
          )}
        </View>
      )}
    </ScrollView>
  );
}

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}M AGO`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}H AGO`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}D AGO`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  tabBar: {
    flexDirection: 'row',
    marginBottom: spacing.xl,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    alignItems: 'center',
  },
  tabActive: {
    borderBottomColor: colors.accent,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 2,
  },
  tabTextActive: {
    color: colors.textPrimary,
  },
  gamesList: {
    gap: spacing.sm,
  },
  gameCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  gameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gameLeft: {
    flex: 1,
  },
  gameName: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  gameWinner: {
    fontSize: 10,
    fontWeight: '400',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  gameRight: {
    alignItems: 'flex-end',
    marginLeft: spacing.md,
  },
  gamePercent: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.accent,
  },
  gameStatus: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textMuted,
    letterSpacing: 1,
  },
  playBadge: {
    backgroundColor: colors.textPrimary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  playBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.background,
    letterSpacing: 1,
  },
  gameDate: {
    fontSize: 8,
    fontWeight: '400',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginTop: spacing.xs,
  },
  emptySection: {
    alignItems: 'center',
    paddingTop: spacing.xxxl,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
});
