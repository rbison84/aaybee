// ============================================
// Profile Screen — menu of profile sub-sections
// No own header — persistent top bar + sub-nav handles it
// Each button navigates to a sub-phase via callbacks
// ============================================

import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
} from 'react-native';
import Svg, { Path, Circle as SvgCircle, Polygon, Rect, Line } from 'react-native-svg';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, spacing, borderRadius } from '../theme/cinematic';
import { CinematicButton } from '../components/cinematic';

interface ProfileScreenProps {
  onOpenDebug?: () => void;
  isGuestMode?: boolean;
  onOpenAuth?: () => void;
  onOpenTv?: () => void;
  onOpenAaybee100?: () => void;
  onOpenMyGames?: () => void;
  onOpenRankings?: () => void;
  onOpenTasteProfile?: () => void;
  onOpenSettings?: () => void;
}

// Icons matching the white-button style (black stroke, no fill)
const IconGamepad = () => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Rect x={2} y={6} width={20} height={12} rx={3} stroke="#000" strokeWidth={1.5} />
    <Line x1={9} y1={10} x2={9} y2={14} stroke="#000" strokeWidth={1.5} strokeLinecap="round" />
    <Line x1={7} y1={12} x2={11} y2={12} stroke="#000" strokeWidth={1.5} strokeLinecap="round" />
    <SvgCircle cx={16} cy={11} r={1} fill="#000" />
    <SvgCircle cx={18} cy={13} r={1} fill="#000" />
  </Svg>
);
const IconBars = () => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Line x1={4} y1={8} x2={20} y2={8} stroke="#000" strokeWidth={1.5} strokeLinecap="round" />
    <Line x1={4} y1={12} x2={16} y2={12} stroke="#000" strokeWidth={1.5} strokeLinecap="round" />
    <Line x1={4} y1={16} x2={12} y2={16} stroke="#000" strokeWidth={1.5} strokeLinecap="round" />
  </Svg>
);
const IconStar = () => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" stroke="#000" strokeWidth={1.5} strokeLinejoin="round" />
  </Svg>
);
const IconTv = () => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Rect x={2} y={5} width={20} height={13} rx={2} stroke="#000" strokeWidth={1.5} />
    <Line x1={8} y1={21} x2={16} y2={21} stroke="#000" strokeWidth={1.5} strokeLinecap="round" />
    <Line x1={12} y1={18} x2={12} y2={21} stroke="#000" strokeWidth={1.5} strokeLinecap="round" />
  </Svg>
);
const IconGear = () => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <SvgCircle cx={12} cy={12} r={3} stroke="#000" strokeWidth={1.5} />
    <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="#000" strokeWidth={1.5} />
  </Svg>
);

export function ProfileScreen({
  onOpenDebug,
  isGuestMode,
  onOpenAuth,
  onOpenTv,
  onOpenAaybee100,
  onOpenMyGames,
  onOpenRankings,
  onOpenTasteProfile,
  onOpenSettings,
}: ProfileScreenProps) {

  const buttons: { label: string; sub: string; icon: React.ReactNode; onPress?: () => void; hidden?: boolean }[] = [
    { label: 'MY GAMES', sub: 'current & history.', icon: <IconGamepad />, onPress: onOpenMyGames, hidden: isGuestMode },
    { label: 'RANKINGS', sub: 'your movies, decided.', icon: <IconBars />, onPress: onOpenRankings },
    { label: 'TASTE PROFILE', sub: 'your movie DNA.', icon: <IconStar />, onPress: onOpenTasteProfile },
    { label: 'TRAILERS', sub: 'watch & discover.', icon: <IconTv />, onPress: onOpenTv },
    { label: 'SETTINGS', sub: 'account & preferences.', icon: <IconGear />, onPress: onOpenSettings },
  ];

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {buttons.filter(b => !b.hidden).map((btn, idx) => (
          <Animated.View key={btn.label} entering={FadeInDown.delay(idx * 50).duration(300)}>
            <Pressable
              style={styles.menuButton}
              onPress={btn.onPress}
            >
              {btn.icon}
              <View style={{ flex: 1 }}>
                <Text style={styles.menuLabel}>{btn.label}</Text>
                <Text style={styles.menuSub}>{btn.sub}</Text>
              </View>
            </Pressable>
          </Animated.View>
        ))}

        {/* Sign up / sign in for guests */}
        {isGuestMode && onOpenAuth && (
          <Animated.View entering={FadeInDown.delay(250).duration(300)} style={{ marginTop: spacing.md }}>
            <Pressable style={styles.menuButton} onPress={onOpenAuth}>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuLabel}>SIGN UP / SIGN IN</Text>
                <Text style={styles.menuSub}>(save your progress.)</Text>
              </View>
            </Pressable>
          </Animated.View>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  menuButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.xxl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  menuLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  menuSub: {
    fontSize: 9,
    color: 'rgba(0,0,0,0.45)',
    letterSpacing: 0.3,
    marginTop: 2,
  },
  bottomPadding: {
    height: spacing.xxxl,
  },
});
