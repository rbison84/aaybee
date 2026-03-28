import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useHaptics } from '../../hooks/useHaptics';

interface RankingHeaderProps {
  totalRanked: number;
  totalComparisons: number;
  onShare: () => void;
  onClose?: () => void;
  showCloseButton?: boolean;
}

export function RankingHeader({
  totalRanked,
  totalComparisons,
  onShare,
  onClose,
  showCloseButton = false,
}: RankingHeaderProps) {
  const haptics = useHaptics();
  const shareScale = useSharedValue(1);

  const handleShare = () => {
    haptics.medium();
    shareScale.value = withSpring(0.95, { damping: 15 }, () => {
      shareScale.value = withSpring(1);
    });
    onShare();
  };

  const shareStyle = useAnimatedStyle(() => ({
    transform: [{ scale: shareScale.value }],
  }));

  return (
    <View style={styles.container}>
      {/* Close Button (optional, for non-tab navigation) */}
      {showCloseButton && onClose && (
        <Pressable style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeText}>←</Text>
        </Pressable>
      )}

      {/* Title & Stats */}
      <View style={[styles.titleContainer, !showCloseButton && styles.titleContainerFull]}>
        <Text style={styles.title}>Your Ranking</Text>
        <Text style={styles.subtitle}>
          {totalRanked} movies • {totalComparisons} picks
        </Text>
      </View>

      {/* Share Button */}
      <Pressable onPress={handleShare}>
        <Animated.View style={[styles.shareButton, shareStyle]}>
          <Text style={styles.shareEmoji}>📤</Text>
          <Text style={styles.shareText}>Share</Text>
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  closeText: {
    fontSize: 20,
    color: '#fff',
  },
  titleContainer: {
    flex: 1,
  },
  titleContainerFull: {
    marginLeft: 0,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 6,
  },
  shareEmoji: {
    fontSize: 14,
  },
  shareText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
});
