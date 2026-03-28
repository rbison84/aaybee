import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { friendService, FriendProfile } from '../../services/friendService';
import { colors, borderRadius, typography, spacing } from '../../theme/cinematic';

interface FriendsRankedBadgeProps {
  movieId: string;
  movieTitle: string;
}

interface FriendRankInfo {
  friend: FriendProfile;
  rank: number;
  beta: number;
}

export function FriendsRankedBadge({ movieId, movieTitle }: FriendsRankedBadgeProps) {
  const { user, isGuest } = useAuth();
  const [friendsWhoRanked, setFriendsWhoRanked] = useState<FriendRankInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isGuest || !user?.id) {
      setIsLoading(false);
      return;
    }

    const loadFriendsWhoRanked = async () => {
      try {
        const result = await friendService.getFriendsWhoRankedMovie(user.id, movieId);
        setFriendsWhoRanked(result);
      } catch (error) {
        console.error('[FriendsRankedBadge] Error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadFriendsWhoRanked();
  }, [user?.id, movieId, isGuest]);

  // Don't show if guest, loading, or no friends ranked this movie
  if (isGuest || isLoading || friendsWhoRanked.length === 0) {
    return null;
  }

  // Categorize friends
  const inTop10 = friendsWhoRanked.filter(f => f.rank <= 10);
  const inTop20 = friendsWhoRanked.filter(f => f.rank > 10 && f.rank <= 20);
  const others = friendsWhoRanked.filter(f => f.rank > 20);

  // Build message - no emoji in UI chrome
  let message = '';
  let isHighlight = false;

  if (inTop10.length > 0) {
    const names = inTop10.slice(0, 2).map(f => f.friend.display_name || 'a friend');
    if (inTop10.length === 1) {
      message = `${names[0]} has this in their top 10`;
    } else if (inTop10.length === 2) {
      message = `${names[0]} & ${names[1]} have this in their top 10`;
    } else {
      message = `${names[0]} + ${inTop10.length - 1} others have this in their top 10`;
    }
    isHighlight = true;
  } else if (inTop20.length > 0) {
    message = `${inTop20.length} friend${inTop20.length > 1 ? 's' : ''} ranked this in top 20`;
  } else if (others.length > 0) {
    message = `${others.length} friend${others.length > 1 ? 's' : ''} ranked this`;
  }

  if (!message) return null;

  return (
    <View style={[styles.container, isHighlight && styles.containerHighlight]}>
      <Text style={[styles.text, isHighlight && styles.textHighlight]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: borderRadius.md,
    alignSelf: 'center',
  },
  containerHighlight: {
    backgroundColor: colors.accentSubtle,
    borderWidth: 1,
    borderColor: colors.accent + '40',
  },
  text: {
    ...typography.tiny,
    color: colors.textMuted,
    fontWeight: '500',
  },
  textHighlight: {
    color: colors.accent,
    fontWeight: '600',
  },
});
