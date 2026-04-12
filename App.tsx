// Polyfills must be imported first
import './src/polyfills';

import 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, ActivityIndicator, Pressable, Platform, Modal } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import React, { useState, useCallback, useEffect, useRef, useMemo, Suspense } from 'react';
import { AppProvider, useAppStore } from './src/store/useAppStore';
import { useLockedFeature } from './src/contexts/LockedFeatureContext';
import { AuthProvider } from './src/contexts/AuthContext';
import { SyncProvider } from './src/contexts/SyncContext';
import { DimensionsProvider, useAppDimensions, DESKTOP_SIDEBAR_WIDTH } from './src/contexts/DimensionsContext';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { MiniOnboardingScreen } from './src/screens/MiniOnboardingScreen';
import { ComparisonScreen } from './src/screens/ComparisonScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { AuthScreen } from './src/screens/AuthScreen';
// FriendsScreen is now accessed via ProfileScreen
import { DailyScreen } from './src/screens/DailyScreen';
import { DecideScreen } from './src/screens/DecideScreen';
import { ChallengeScreen } from './src/screens/ChallengeScreen';
import { FriendsScreen } from './src/screens/FriendsScreen';
import { MyGamesScreen } from './src/screens/MyGamesScreen';
import { TasteProfileScreen } from './src/screens/TasteProfileScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';

// Lazy-load screens that are locked behind comparison thresholds or shown as overlays
const DiscoverScreen = React.lazy(() => import('./src/screens/DiscoverScreen').then(m => ({ default: m.DiscoverScreen })));
const UnifiedRankingsScreen = React.lazy(() => import('./src/screens/UnifiedRankingsScreen').then(m => ({ default: m.UnifiedRankingsScreen })));
const Aaybee100Screen = React.lazy(() => import('./src/screens/Aaybee100Screen').then(m => ({ default: m.Aaybee100Screen })));
const TvScreen = React.lazy(() => import('./src/screens/TvScreen').then(m => ({ default: m.TvScreen })));
import { GlobalHeader } from './src/components/GlobalHeader';
// SearchIcon removed — no longer used in App shell
// TabIcon no longer needed — nav uses text labels
import { DebugPanel } from './src/components/debug';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { WebContainer } from './src/components/WebContainer';
import { MovieDetailProvider } from './src/contexts/MovieDetailContext';
import { AlertProvider } from './src/contexts/AlertContext';
import { LockedFeatureProvider } from './src/contexts/LockedFeatureContext';
import { RecommendationTrackingProvider } from './src/contexts/RecommendationTrackingContext';
import { MovieDetailModal } from './src/components/MovieDetailModal';
import { QuickRankProvider } from './src/contexts/QuickRankContext';
import { QuickRankModal } from './src/components/QuickRankModal';
import { DevSettingsProvider, useDevSettings } from './src/contexts/DevSettingsContext';
import { MovieSearchModal } from './src/components/MovieSearchModal';
import { RankingRevealOverlay } from './src/components/comparison/RankingRevealOverlay';
import { useAuth } from './src/contexts/AuthContext';
import { parseDeepLink, clearDeepLink, captureRefParam, listenForNativeRef, DeepLinkIntent } from './src/utils/deepLink';
import { notificationService } from './src/services/notificationService';
import { vsService } from './src/services/vsService';
import { friendService } from './src/services/friendService';
import { challengeService } from './src/services/challengeService';
import { knockoutService } from './src/services/knockoutService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, borderRadius, typography } from './src/theme/cinematic';
import Svg, { Path, Circle as SvgCircle, Line, Polygon, Polyline } from 'react-native-svg';

// Navigation — SameGoat-style: landing page with PLAY + FRIENDS buttons
type NavPhase = 'landing' | 'playMenu' | 'vs' | 'daily' | 'decide' | 'discover' | 'friends' | 'profile' | 'myGames' | 'rankings' | 'tasteProfile' | 'settings' | 'trailers' | 'aaybee100';
// Keep TabType for compatibility with components that reference it
type TabType = 'vs' | 'daily' | 'decide' | 'discover' | 'compare' | 'rankings';

function LoadingScreen() {
  return (
    <View style={styles.loadingContainer}>
      <Text style={styles.loadingTitle}>AAYBEE</Text>
      <Text style={styles.loadingSubtitle}>(YOUR MOVIES, DECIDED.)</Text>
      <ActivityIndicator size="small" color={colors.textMuted} style={styles.loadingSpinner} />
    </View>
  );
}

// Persistent Top Bar — AAYBEE left, profile right. Always visible.
function PersistentTopBar({ onProfile, onHome, hasBadge }: {
  onProfile: () => void;
  onHome: () => void;
  hasBadge?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { user, isGuest } = useAuth();
  const isSignedIn = !!user?.id && !isGuest;

  return (
    <View style={{ backgroundColor: colors.background }}>
      <View style={[navStyles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={onHome}>
          <Text style={navStyles.topLogo}>AAYBEE</Text>
        </Pressable>
        <Pressable onPress={onProfile}>
          <Text style={navStyles.profileLink}>
            {isSignedIn ? (user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'profile').toLowerCase() : 'sign in'}
          </Text>
          {!!hasBadge && isSignedIn && (
            <View style={navStyles.profileDot} />
          )}
        </Pressable>
      </View>
      <View style={navStyles.topBarLine} />
    </View>
  );
}

// Sub-nav bar — shows current section label + back button. Always visible below top bar.
function SubNavBar({ label, onBack }: { label: string; onBack?: () => void }) {
  if (!label) return null;
  return (
    <View style={navStyles.subNav}>
      {onBack ? (
        <Pressable onPress={onBack} style={navStyles.backButton}>
          <Text style={navStyles.backText}>{'<'} BACK</Text>
        </Pressable>
      ) : (
        <View />
      )}
      <Text style={navStyles.subNavLabel}>{label}</Text>
      <View style={{ minWidth: 50 }} />
    </View>
  );
}

const navStyles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
    backgroundColor: colors.background,
  },
  topLogo: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.accent,
    letterSpacing: 4,
  },
  profileLink: {
    fontSize: 10,
    fontWeight: '400',
    color: colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  profileDot: {
    position: 'absolute',
    left: -8,
    top: '50%',
    marginTop: -3,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  } as any,
  topBarLine: {
    height: 1,
    backgroundColor: colors.border,
  },
  subNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  subNavLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  backButton: {
    paddingVertical: spacing.xs,
    minWidth: 50,
  },
  backText: {
    fontSize: 10,
    fontWeight: '400',
    color: colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});

// Button icons — inline SVG, black stroke, no fill (matching SameGoat)
const IconPlay = () => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Polygon points="5,3 19,12 5,21" stroke="#000" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
  </Svg>
);
const IconPeople = () => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <SvgCircle cx={9} cy={7} r={3} stroke="#000" strokeWidth={1.5} />
    <Path d="M3 21v-1a6 6 0 0 1 12 0v1" stroke="#000" strokeWidth={1.5} strokeLinecap="round" />
    <SvgCircle cx={17} cy={9} r={2.5} stroke="#000" strokeWidth={1.5} />
    <Path d="M21 21v-.5a4.5 4.5 0 0 0-4-4.47" stroke="#000" strokeWidth={1.5} strokeLinecap="round" />
  </Svg>
);
const IconSignIn = () => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" stroke="#000" strokeWidth={1.5} strokeLinecap="round" />
    <Polyline points="10,17 15,12 10,7" stroke="#000" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    <Line x1={15} y1={12} x2={3} y2={12} stroke="#000" strokeWidth={1.5} strokeLinecap="round" />
  </Svg>
);
const IconGlobe = () => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <SvgCircle cx={12} cy={12} r={10} stroke="#000" strokeWidth={1.5} />
    <Path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z" stroke="#000" strokeWidth={1.5} />
  </Svg>
);
const IconBracket = () => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path d="M4 4v4h4M4 20v-4h4M20 12h-8M12 4v16M8 8h4M8 16h4" stroke="#000" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
const IconQuestion = () => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <SvgCircle cx={12} cy={12} r={10} stroke="#000" strokeWidth={1.5} />
    <Path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" stroke="#000" strokeWidth={1.5} strokeLinecap="round" />
    <SvgCircle cx={12} cy={17} r={0.5} fill="#000" />
  </Svg>
);
const IconCompass = () => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <SvgCircle cx={12} cy={12} r={10} stroke="#000" strokeWidth={1.5} />
    <Polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" stroke="#000" strokeWidth={1.5} strokeLinejoin="round" />
  </Svg>
);

// Landing content — logo + tagline above, stacked buttons below
function LandingContent({ onPlay, onFriends, onSignIn, friendsBadge }: {
  onPlay: () => void;
  onFriends: () => void;
  onSignIn: () => void;
  friendsBadge?: number;
}) {
  const { user, isGuest } = useAuth();
  const isSignedIn = !!user?.id && !isGuest;

  return (
    <View style={landingStyles.container}>
      {/* Logo + tagline — upper area */}
      <View style={landingStyles.logoSection}>
        <Text style={landingStyles.logo}>AAYBEE</Text>
        <Text style={landingStyles.tagline}>(your movies, decided.)</Text>
      </View>

      {/* Stacked buttons */}
      <View style={landingStyles.buttons}>
        <Pressable style={landingStyles.bigButton} onPress={onPlay}>
          <IconPlay />
          <View>
            <Text style={landingStyles.bigButtonLabel}>PLAY</Text>
            <Text style={landingStyles.bigButtonSub}>(pick a mode.)</Text>
          </View>
        </Pressable>
        {isSignedIn ? (
          <Pressable style={landingStyles.bigButton} onPress={onFriends}>
            <IconPeople />
            <View style={{ flex: 1 }}>
              <Text style={landingStyles.bigButtonLabel}>FRIENDS</Text>
              <Text style={landingStyles.bigButtonSub}>
                {friendsBadge && friendsBadge > 0 ? `(${friendsBadge} challenge${friendsBadge !== 1 ? 's' : ''})` : '(your people.)'}
              </Text>
            </View>
            {!!friendsBadge && friendsBadge > 0 && (
              <View style={landingStyles.badge} />
            )}
          </Pressable>
        ) : (
          <Pressable style={landingStyles.bigButton} onPress={onSignIn}>
            <IconSignIn />
            <View>
              <Text style={landingStyles.bigButtonLabel}>SIGN IN</Text>
              <Text style={landingStyles.bigButtonSub}>(save your games.)</Text>
            </View>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const landingStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: spacing.xxxl,
  },
  logo: {
    fontSize: 48,
    fontWeight: '900',
    color: colors.accent,
    letterSpacing: 6,
  },
  tagline: {
    fontSize: 14,
    color: colors.textMuted,
    letterSpacing: 1,
    marginTop: spacing.sm,
  },
  buttons: {
    gap: spacing.sm,
  },
  bigButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.xxl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    position: 'relative',
  },
  bigButtonLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#000000',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  bigButtonSub: {
    fontSize: 10,
    color: 'rgba(0,0,0,0.5)',
    letterSpacing: 0.3,
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
});

// Play Menu content — vertical stack of white buttons
function PlayMenuContent({ onVs, onDaily, onDecide, onDiscover }: {
  onVs: () => void;
  onDaily: () => void;
  onDecide: () => void;
  onDiscover: () => void;
}) {
  const modes: { label: string; sub: string; icon: React.ReactNode; onPress: () => void }[] = [
    { label: 'VS', sub: 'head to head.', icon: <IconBracket />, onPress: onVs },
    { label: 'DAILY', sub: "today's circle play.", icon: <IconGlobe />, onPress: onDaily },
    { label: 'DECIDE', sub: 'settle it.', icon: <IconQuestion />, onPress: onDecide },
    { label: 'DISCOVER', sub: 'compare & explore.', icon: <IconCompass />, onPress: onDiscover },
  ];

  return (
    <View style={playMenuStyles.container}>
      {modes.map((mode) => (
        <Pressable key={mode.label} style={playMenuStyles.modeButton} onPress={mode.onPress}>
          {mode.icon}
          <View style={{ flex: 1 }}>
            <Text style={playMenuStyles.modeLabel}>{mode.label}</Text>
            <Text style={playMenuStyles.modeSub}>{mode.sub}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const playMenuStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  modeButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.xxl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  modeLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  modeSub: {
    fontSize: 9,
    color: 'rgba(0,0,0,0.45)',
    letterSpacing: 0.3,
    marginTop: 2,
  },
});

// Desktop Sidebar — flat list with same nav structure
function DesktopSidebar({ phase, onNavigate, onSearchPress, onProfilePress }: {
  phase: NavPhase;
  onNavigate: (phase: NavPhase) => void;
  onSearchPress: () => void;
  onProfilePress: () => void;
}) {
  const playModes: { key: NavPhase; label: string }[] = [
    { key: 'vs', label: 'VS' },
    { key: 'daily', label: 'DAILY' },
    { key: 'decide', label: 'DECIDE' },
    { key: 'discover', label: 'DISCOVER' },
  ];

  return (
    <View style={sidebarStyles.container}>
      <Pressable onPress={() => onNavigate('landing')}>
        <Text style={sidebarStyles.logo}>AAYBEE</Text>
      </Pressable>

      <Text style={sidebarStyles.sectionHeader}>PLAY</Text>
      <View style={sidebarStyles.navSection}>
        {playModes.map((mode) => (
          <Pressable
            key={mode.key}
            style={[sidebarStyles.navItem, phase === mode.key && sidebarStyles.navItemActive]}
            onPress={() => onNavigate(mode.key)}
          >
            <Text style={[sidebarStyles.navLabel, phase === mode.key && sidebarStyles.navLabelActive]}>
              {mode.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={sidebarStyles.divider} />

      <Pressable
        style={[sidebarStyles.navItem, phase === 'friends' && sidebarStyles.navItemActive]}
        onPress={() => onNavigate('friends')}
      >
        <Text style={[sidebarStyles.navLabel, phase === 'friends' && sidebarStyles.navLabelActive]}>
          FRIENDS
        </Text>
      </Pressable>

      <View style={sidebarStyles.divider} />

      <Pressable style={sidebarStyles.navItem} onPress={onSearchPress}>
        <Text style={sidebarStyles.shortcutLabel}>SEARCH</Text>
      </Pressable>
      <Pressable style={sidebarStyles.navItem} onPress={onProfilePress}>
        <Text style={sidebarStyles.shortcutLabel}>PROFILE</Text>
      </Pressable>

      <View style={sidebarStyles.keyboardHints}>
        <Text style={sidebarStyles.hintText}>KEYBOARD SHORTCUTS</Text>
        <Text style={sidebarStyles.hintDetail}>{'\u2190'} {'\u2192'} or click to choose</Text>
        <Text style={sidebarStyles.hintDetail}>S to skip</Text>
        <Text style={sidebarStyles.hintDetail}>Z to undo</Text>
      </View>
    </View>
  );
}

const sidebarStyles = StyleSheet.create({
  container: {
    width: DESKTOP_SIDEBAR_WIDTH,
    backgroundColor: colors.background,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingTop: spacing.xxxl,
    paddingHorizontal: spacing.lg,
  },
  logo: {
    fontSize: 28,
    color: colors.textPrimary,
    fontWeight: '800',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: spacing.xxxl,
    paddingHorizontal: spacing.sm,
  },
  sectionHeader: {
    ...typography.tiny,
    color: colors.textMuted,
    fontWeight: '600',
    letterSpacing: 2,
    fontSize: 10,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.xs,
  },
  navSection: {
    gap: spacing.xs,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  navItemActive: {
    backgroundColor: colors.accentSubtle,
  },
  navLabel: {
    ...typography.captionMedium,
    color: colors.textSecondary,
  },
  navLabelActive: {
    color: colors.accent,
    fontWeight: '600',
  },
  shortcutLabel: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  keyboardHints: {
    marginTop: 'auto' as any,
    paddingBottom: spacing.xxxl,
    paddingHorizontal: spacing.sm,
  },
  hintText: {
    ...typography.tiny,
    color: colors.textMuted,
    fontWeight: '600',
    marginBottom: spacing.sm,
    opacity: 0.6,
  },
  hintDetail: {
    ...typography.tiny,
    color: colors.textMuted,
    opacity: 0.4,
    marginBottom: 2,
  },
});

// Discover tab wrapper — Compare | Recommend tabs at top
function DiscoverWrapper({ discoverTab, onTabChange, onOpenRanking, onOpenDecide, onOpenAuth, onOpenProfile, onOpenTop10Search, onOpenTop25, onOpenGlobal }: {
  discoverTab: 'compare' | 'recommend';
  onTabChange: (tab: 'compare' | 'recommend') => void;
  onOpenRanking: () => void;
  onOpenDecide: () => void;
  onOpenAuth: () => void;
  onOpenProfile: () => void;
  onOpenTop10Search: () => void;
  onOpenTop25: () => void;
  onOpenGlobal: () => void;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Tab bar */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable
          style={{ flex: 1, paddingVertical: spacing.md, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: discoverTab === 'compare' ? colors.accent : 'transparent' }}
          onPress={() => onTabChange('compare')}
        >
          <Text style={{ fontSize: 14, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' as const, color: discoverTab === 'compare' ? colors.textPrimary : colors.textMuted }}>COMPARE</Text>
        </Pressable>
        <Pressable
          style={{ flex: 1, paddingVertical: spacing.md, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: discoverTab === 'recommend' ? colors.accent : 'transparent' }}
          onPress={() => onTabChange('recommend')}
        >
          <Text style={{ fontSize: 14, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' as const, color: discoverTab === 'recommend' ? colors.textPrimary : colors.textMuted }}>RECOMMEND</Text>
        </Pressable>
      </View>

      {/* Content */}
      {discoverTab === 'compare' ? (
        <ComparisonScreen
          onOpenRanking={onOpenRanking}
          onOpenDiscover={() => onTabChange('recommend')}
          onOpenDecide={onOpenDecide}
          onOpenAuth={onOpenAuth}
          onOpenProfile={onOpenProfile}
          onOpenTop10Search={onOpenTop10Search}
          onOpenTop25={onOpenTop25}
          onOpenGlobal={onOpenGlobal}
        />
      ) : (
        <Suspense fallback={<LoadingScreen />}>
          <DiscoverScreen
            onNavigateToCompare={() => onTabChange('compare')}
          />
        </Suspense>
      )}
    </View>
  );
}

// GuestHeader and ScreenHeader removed — replaced by PersistentTopBar + SubNavBar

function MainApp() {
  const { hasCompletedOnboarding, isLoading, totalComparisons, postOnboardingComparisons, getStats } = useAppStore();
  const { showLockedFeature } = useLockedFeature();
  const { unlockAllFeatures } = useDevSettings();
  const { isGuest: isAuthGuest, user } = useAuth();
  const [debugVisible, setDebugVisible] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [phase, setPhase] = useState<NavPhase>('landing');
  const [showSearch, setShowSearch] = useState(false);
  const [showAaybee100, setShowAaybee100] = useState(false);
  const [showTv, setShowTv] = useState(false);
  const [challengeInitialCode, setChallengeInitialCode] = useState<string | undefined>();
  const [rankingReveal, setRankingReveal] = useState<'classic' | 'top25' | 'all' | null>(null);
  const [showGuestPrompt, setShowGuestPrompt] = useState(false);
  const [showMiniOnboarding, setShowMiniOnboarding] = useState(false);
  const [discoverTab, setDiscoverTab] = useState<'compare' | 'recommend'>('compare');
  const [challengedFriendId, setChallengedFriendId] = useState<string | undefined>();
  const [challengedFriendName, setChallengedFriendName] = useState<string | undefined>();

  // Deep link: parse URL on mount
  const [deepLink] = useState<DeepLinkIntent>(() => {
    captureRefParam();
    return parseDeepLink();
  });

  // Listen for native deep links while app is running
  useEffect(() => listenForNativeRef(), []);

  // Guest mode: landed via deep link without an account
  const isGuestMode = !hasCompletedOnboarding && !!deepLink && isAuthGuest;

  // Navigation helpers for unlock milestones
  const navigateToTop10Search = useCallback(() => {
    setRankingReveal('classic');
  }, []);

  const navigateToTop25 = useCallback(() => {
    setRankingReveal('top25');
  }, []);

  const navigateToGlobal = useCallback(() => {
    setRankingReveal('all');
  }, []);

  // Ranking reveal overlay handlers
  const handleRevealComplete = useCallback(() => {
    // Navigate to profile (which now contains rankings)
    setPhase('profile');
    setRankingReveal(null);
  }, []);

  const handleRevealDismiss = useCallback(() => {
    setRankingReveal(null);
  }, []);

  const toggleDebug = useCallback(() => {
    setDebugVisible(prev => !prev);
  }, []);

  const closeAllOverlays = useCallback(() => {
    setShowSearch(false);
    setShowAaybee100(false);
    setShowTv(false);
  }, []);

  const handleNavigate = useCallback((newPhase: NavPhase) => {
    closeAllOverlays();
    setPhase(newPhase);
  }, [closeAllOverlays]);

  // Track if onboarding just completed
  const prevOnboardingComplete = useRef(hasCompletedOnboarding);
  useEffect(() => {
    if (hasCompletedOnboarding && !prevOnboardingComplete.current) {
      if (showMiniOnboarding) {
        setPhase('discover');
        setShowMiniOnboarding(false);
      }
    }
    prevOnboardingComplete.current = hasCompletedOnboarding;
  }, [hasCompletedOnboarding, showMiniOnboarding]);

  // Deep link: consume after app is ready
  const deepLinkConsumed = useRef(false);
  useEffect(() => {
    if (!deepLink || deepLinkConsumed.current || isLoading) return;
    deepLinkConsumed.current = true;
    clearDeepLink();

    if (deepLink.type === 'daily') {
      setPhase('daily');
    } else if (deepLink.type === 'vs' || deepLink.type === 'challenge') {
      setChallengeInitialCode(deepLink.code);
      setPhase('vs');
    } else if (deepLink.type === 'share') {
      setPhase('daily');
    }
  }, [deepLink, isLoading]);

  // Register for push notifications when user is authenticated
  useEffect(() => {
    if (user?.id) {
      notificationService.registerForPushNotifications(user.id).catch(() => {});
    }
  }, [user?.id]);

  // Handle notification taps
  useEffect(() => {
    return notificationService.addNotificationResponseListener((data) => {
      if (data.type === 'daily') {
        setPhase('daily');
      } else if (data.type === 'vs' && data.code) {
        setChallengeInitialCode(data.code as string);
        setPhase('vs');
      }
    });
  }, []);

  // Check for pending notifications (VS challenges + friend requests)
  const [pendingChallengeCount, setPendingChallengeCount] = useState(0);
  useEffect(() => {
    if (!user?.id) return;
    let mounted = true;
    const checkPending = async () => {
      const [challenges, friendRequests, friendChallenges] = await Promise.all([
        vsService.getMyChallenges(user.id),
        friendService.getPendingRequests(user.id),
        challengeService.getMyActiveChallenges(user.id),
      ]);
      const pendingVs = challenges.filter(c =>
        (c.status === 'selecting' && c.challenged_id === user.id) ||
        (c.status === 'challenged_comparing' && c.challenged_id === user.id) ||
        (c.status === 'challenger_comparing' && c.challenger_id === user.id)
      );
      const pendingFriendChallenges = friendChallenges.filter(c =>
        (c.status === 'pending' && c.creator_id === user.id) ||
        (c.status === 'active' && c.challenger_id === user.id)
      );
      // Also count knockout ready games
      const knockoutReady = await knockoutService.getReadyGamesCount(user.id);
      if (mounted) setPendingChallengeCount(pendingVs.length + friendRequests.length + pendingFriendChallenges.length + knockoutReady);
    };
    checkPending();
    const interval = setInterval(checkPending, 30000);
    return () => { mounted = false; clearInterval(interval); };
  }, [user?.id]);

  // Show loading screen while initializing
  if (isLoading) {
    return (
      <>
        <LoadingScreen />
        <DebugPanel visible={debugVisible} onClose={() => setDebugVisible(false)} />
      </>
    );
  }

  const { isDesktop, isWeb } = useAppDimensions();
  const isDesktopWeb = isDesktop && isWeb;

  // Render the current phase
  const renderPhaseContent = () => {
    switch (phase) {
      case 'landing':
        return (
          <LandingContent
            onPlay={() => setPhase('playMenu')}
            onFriends={() => setPhase('friends')}
            onSignIn={() => setShowAuth(true)}
            friendsBadge={pendingChallengeCount}
          />
        );

      case 'playMenu':
        return (
          <PlayMenuContent
            onVs={() => { setChallengedFriendId(undefined); setChallengedFriendName(undefined); setChallengeInitialCode(undefined); setPhase('vs'); }}
            onDaily={() => setPhase('daily')}
            onDecide={() => setPhase('decide')}
            onDiscover={() => {
              if (!hasCompletedOnboarding) {
                setShowMiniOnboarding(true);
              }
              setPhase('discover');
            }}
          />
        );

      case 'vs':
        return (
          <ChallengeScreen
            initialCode={challengeInitialCode}
            onOpenAuth={() => setShowAuth(true)}
            autoStartKnockout={!challengeInitialCode}
            challengedFriendId={challengedFriendId}
            challengedFriendName={challengedFriendName}
          />
        );

      case 'daily':
        return <DailyScreen />;

      case 'decide':
        return (
          <DecideScreen onNavigateToCompare={() => setPhase('discover')} />
        );

      case 'discover':
        if (showMiniOnboarding) {
          return (
            <MiniOnboardingScreen
              onComplete={() => setShowMiniOnboarding(false)}
            />
          );
        }
        return (
          <DiscoverWrapper
            discoverTab={discoverTab}
            onTabChange={setDiscoverTab}
            onOpenRanking={() => setPhase('profile')}
            onOpenDecide={() => setPhase('decide')}
            onOpenAuth={() => setShowAuth(true)}
            onOpenProfile={() => setPhase('profile')}
            onOpenTop10Search={navigateToTop10Search}
            onOpenTop25={navigateToTop25}
            onOpenGlobal={navigateToGlobal}
          />
        );

      case 'friends':
        return (
          <FriendsScreen
            onChallenge={(friendId, friendName) => {
              setChallengedFriendId(friendId);
              setChallengedFriendName(friendName);
              setChallengeInitialCode(undefined);
              setPhase('vs');
            }}
            onAcceptChallenge={(code) => {
              setChallengedFriendId(undefined);
              setChallengedFriendName(undefined);
              setChallengeInitialCode(code);
              setPhase('vs');
            }}
          />
        );

      case 'myGames':
        return (
          <MyGamesScreen
            onViewGame={(code) => {
              setChallengeInitialCode(code);
              setChallengedFriendId(undefined);
              setChallengedFriendName(undefined);
              setPhase('vs');
            }}
            onPlayChallenge={(code) => {
              setChallengeInitialCode(code);
              setChallengedFriendId(undefined);
              setChallengedFriendName(undefined);
              setPhase('vs');
            }}
          />
        );

      case 'profile':
        return (
          <ProfileScreen
            onOpenDebug={toggleDebug}
            isGuestMode={isGuestMode}
            onOpenAuth={() => { setShowAuth(true); }}
            onOpenTv={() => setPhase('trailers')}
            onOpenAaybee100={() => { closeAllOverlays(); setShowAaybee100(true); }}
            onOpenAaybee100Nav={() => setPhase('aaybee100')}
            onOpenMyGames={() => setPhase('myGames')}
            onOpenRankings={() => setPhase('rankings')}
            onOpenTasteProfile={() => setPhase('tasteProfile')}
            onOpenSettings={() => setPhase('settings')}
          />
        );

      case 'rankings':
        return (
          <Suspense fallback={<LoadingScreen />}>
            <UnifiedRankingsScreen
              onContinueComparing={() => setPhase('discover')}
              onOpenAaybee100={() => { closeAllOverlays(); setShowAaybee100(true); }}
              initialTab="yours"
              initialFilter="classic"
            />
          </Suspense>
        );

      case 'tasteProfile':
        return (
          <TasteProfileScreen onClose={() => setPhase('profile')} />
        );

      case 'settings':
        return (
          <SettingsScreen onClose={() => setPhase('profile')} onOpenDebug={toggleDebug} />
        );

      case 'trailers':
        return (
          <Suspense fallback={<LoadingScreen />}>
            <TvScreen onClose={() => setPhase('profile')} />
          </Suspense>
        );

      case 'aaybee100':
        return (
          <Suspense fallback={<LoadingScreen />}>
            <Aaybee100Screen onClose={() => setPhase('profile')} />
          </Suspense>
        );

      default:
        return (
          <LandingContent
            onPlay={() => setPhase('playMenu')}
            onFriends={() => setPhase('friends')}
            onSignIn={() => setShowAuth(true)}
            friendsBadge={pendingChallengeCount}
          />
        );
    }
  };

  // Sub-nav config: label and back target for each phase
  const subNavConfig: Record<NavPhase, { label: string; backTo?: NavPhase }> = {
    landing: { label: '' },
    playMenu: { label: 'PLAY', backTo: 'landing' },
    vs: { label: 'VS', backTo: 'playMenu' },
    daily: { label: 'DAILY', backTo: 'playMenu' },
    decide: { label: 'DECIDE', backTo: 'playMenu' },
    discover: { label: 'DISCOVER', backTo: 'playMenu' },
    friends: { label: 'FRIENDS', backTo: 'landing' },
    profile: { label: 'PROFILE', backTo: 'landing' },
    myGames: { label: 'MY GAMES', backTo: 'profile' },
    rankings: { label: 'RANKINGS', backTo: 'profile' },
    tasteProfile: { label: 'TASTE PROFILE', backTo: 'profile' },
    settings: { label: 'SETTINGS', backTo: 'profile' },
    trailers: { label: 'TRAILERS', backTo: 'profile' },
    aaybee100: { label: 'AAYBEE 100', backTo: 'profile' },
  };
  const currentSubNav = subNavConfig[phase];

  const screenContent = (
    <View style={styles.screenContainer}>
      {renderPhaseContent()}

      {/* Aaybee 100 overlay */}
      {showAaybee100 && (
        <View style={styles.screenOverlay}>
          <Suspense fallback={<LoadingScreen />}>
            <Aaybee100Screen onClose={() => setShowAaybee100(false)} />
          </Suspense>
        </View>
      )}

      {/* TV overlay */}
      {showTv && (
        <View style={styles.screenOverlay}>
          <Suspense fallback={<LoadingScreen />}>
            <TvScreen onClose={() => setShowTv(false)} />
          </Suspense>
        </View>
      )}

      {/* Search overlay */}
      {showSearch && (
        <View style={styles.screenOverlay}>
          <MovieSearchModal onClose={() => setShowSearch(false)} />
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.mainContainer}>
      {isDesktopWeb ? (
        <View style={styles.desktopLayout}>
          <DesktopSidebar
            phase={phase}
            onNavigate={handleNavigate}
            onSearchPress={() => { closeAllOverlays(); setShowSearch(true); }}
            onProfilePress={() => setPhase('profile')}
          />
          <View style={styles.desktopContent}>
            {screenContent}
          </View>
        </View>
      ) : (
        <>
          {/* Persistent top bar — always visible */}
          <PersistentTopBar
            onProfile={() => setPhase('profile')}
            onHome={() => setPhase('landing')}
            hasBadge={pendingChallengeCount > 0}
          />

          {/* Sub-nav bar — shows section label + back (except landing) */}
          {currentSubNav.label ? (
            <SubNavBar
              label={currentSubNav.label}
              onBack={currentSubNav.backTo ? () => setPhase(currentSubNav.backTo!) : undefined}
            />
          ) : null}

          {screenContent}
        </>
      )}

      {/* Debug panel overlay */}
      <DebugPanel visible={debugVisible} onClose={() => setDebugVisible(false)} />

      {/* Ranking reveal overlay */}
      <RankingRevealOverlay
        visible={rankingReveal !== null}
        type={rankingReveal ?? 'classic'}
        onComplete={handleRevealComplete}
        onDismiss={handleRevealDismiss}
      />

      {/* Auth screen overlay */}
      {showAuth && (
        <View style={styles.overlay}>
          <AuthScreen onClose={() => setShowAuth(false)} />
        </View>
      )}

      {/* Guest sign-in prompt */}
      {showGuestPrompt && (
        <View style={styles.overlay}>
          <Pressable style={styles.guestPromptBackdrop} onPress={() => setShowGuestPrompt(false)}>
            <Pressable style={styles.guestPromptCard} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.guestPromptTitle}>SIGN IN REQUIRED</Text>
              <Text style={styles.guestPromptText}>
                CREATE AN ACCOUNT TO UNLOCK ALL FEATURES — COMPARE MOVIES, BUILD YOUR RANKINGS, DISCOVER NEW FILMS, AND CHALLENGE FRIENDS
              </Text>
              <Pressable
                style={styles.guestPromptButton}
                onPress={() => { setShowGuestPrompt(false); setShowAuth(true); }}
              >
                <Text style={styles.guestPromptButtonText}>CREATE ACCOUNT</Text>
              </Pressable>
              <Pressable
                style={styles.guestPromptSkip}
                onPress={() => setShowGuestPrompt(false)}
              >
                <Text style={styles.guestPromptSkipText}>SKIP</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <GestureHandlerRootView style={styles.root}>
          <DimensionsProvider>
            <WebContainer>
              <AuthProvider>
                <SyncProvider>
                  <AppProvider>
                    <AlertProvider>
                      <LockedFeatureProvider>
                        <DevSettingsProvider>
                          <RecommendationTrackingProvider>
                            <MovieDetailProvider>
                              <QuickRankProvider>
                                <MainApp />
                                <MovieDetailModal />
                                <QuickRankModal />
                              </QuickRankProvider>
                            </MovieDetailProvider>
                          </RecommendationTrackingProvider>
                        </DevSettingsProvider>
                      </LockedFeatureProvider>
                    </AlertProvider>
                    <StatusBar style="light" />
                  </AppProvider>
                </SyncProvider>
              </AuthProvider>
            </WebContainer>
          </DimensionsProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    ...(Platform.OS === 'web' ? {
      height: 'var(--app-height, 100dvh)',
      maxHeight: 'var(--app-height, 100dvh)',
    } as any : {}),
  },
  mainContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screenContainer: {
    flex: 1,
  },
  desktopLayout: {
    flex: 1,
    flexDirection: 'row',
  },
  desktopContent: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingTitle: {
    ...typography.h1,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    letterSpacing: 4,
  },
  loadingSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.xxxl,
  },
  loadingSpinner: {
    marginTop: spacing.sm,
  },
  // Bottom nav removed — navigation is through landing page
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  screenOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    backgroundColor: colors.background,
  },
  guestPromptBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  guestPromptCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xxl,
    marginHorizontal: spacing.xl,
    maxWidth: 340,
    width: '100%' as any,
    alignItems: 'center',
  },
  guestPromptTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.md,
    letterSpacing: 2,
  },
  guestPromptText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 18,
  },
  guestPromptButton: {
    backgroundColor: colors.textPrimary,
    borderRadius: borderRadius.xxl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    width: '100%' as any,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  guestPromptButtonText: {
    ...typography.captionMedium,
    color: colors.background,
    fontWeight: '700',
    letterSpacing: 1,
  },
  guestPromptSkip: {
    paddingVertical: spacing.sm,
  },
  guestPromptSkipText: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
