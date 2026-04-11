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

// Lazy-load screens that are locked behind comparison thresholds or shown as overlays
const DiscoverScreen = React.lazy(() => import('./src/screens/DiscoverScreen').then(m => ({ default: m.DiscoverScreen })));
// UnifiedRankingsScreen now lazy-loaded inside ProfileScreen
const Aaybee100Screen = React.lazy(() => import('./src/screens/Aaybee100Screen').then(m => ({ default: m.Aaybee100Screen })));
const TvScreen = React.lazy(() => import('./src/screens/TvScreen').then(m => ({ default: m.TvScreen })));
import { GlobalHeader } from './src/components/GlobalHeader';
import { SearchIcon } from './src/components/icons';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, borderRadius, typography } from './src/theme/cinematic';

// Navigation — SameGoat-style: landing page with PLAY + FRIENDS buttons
type NavPhase = 'landing' | 'playMenu' | 'vs' | 'daily' | 'decide' | 'discover' | 'friends' | 'profile';
// Keep TabType for compatibility with components that reference it
type TabType = 'vs' | 'daily' | 'decide' | 'discover' | 'compare' | 'rankings';

function LoadingScreen() {
  return (
    <View style={styles.loadingContainer}>
      <Text style={styles.loadingTitle}>AAYBEE</Text>
      <Text style={styles.loadingSubtitle}>(YOUR MOVIES, RANKED.)</Text>
      <ActivityIndicator size="small" color={colors.textMuted} style={styles.loadingSpinner} />
    </View>
  );
}

// Landing Page — two big buttons: PLAY + FRIENDS (SameGoat-style)
function LandingPage({ onPlay, onFriends, onProfile, friendsBadge }: {
  onPlay: () => void;
  onFriends: () => void;
  onProfile: () => void;
  friendsBadge?: number;
}) {
  const insets = useSafeAreaInsets();
  const { user, isGuest } = useAuth();
  const userInitial = user?.email?.charAt(0).toUpperCase() || '?';

  return (
    <View style={landingStyles.container}>
      {/* Profile button — top right */}
      <View style={[landingStyles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <View />
        <Pressable onPress={onProfile} style={landingStyles.profileButton}>
          <Text style={landingStyles.profileText}>
            {isGuest ? '?' : userInitial}
          </Text>
        </Pressable>
      </View>

      {/* Center content */}
      <View style={landingStyles.center}>
        <Text style={landingStyles.logo}>AAYBEE</Text>
        <Text style={landingStyles.tagline}>(your movies, ranked.)</Text>
      </View>

      {/* Two big buttons */}
      <View style={[landingStyles.buttons, { paddingBottom: Math.max(insets.bottom + spacing.lg, spacing.xxxl) }]}>
        <View style={landingStyles.buttonRow}>
          <Pressable style={landingStyles.bigButton} onPress={onPlay}>
            <Text style={landingStyles.bigButtonLabel}>PLAY</Text>
            <Text style={landingStyles.bigButtonSub}>(pick a mode.)</Text>
          </Pressable>
          <Pressable style={landingStyles.bigButton} onPress={onFriends}>
            <Text style={landingStyles.bigButtonLabel}>FRIENDS</Text>
            <Text style={landingStyles.bigButtonSub}>(your people.)</Text>
            {!!friendsBadge && friendsBadge > 0 && (
              <View style={landingStyles.badge}>
                <Text style={landingStyles.badgeText}>{friendsBadge > 9 ? '9+' : friendsBadge}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const landingStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  profileButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    fontSize: 48,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  tagline: {
    fontSize: 12,
    color: colors.textMuted,
    letterSpacing: 1,
    marginTop: spacing.sm,
  },
  buttons: {
    paddingHorizontal: spacing.lg,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  bigButton: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xxl,
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  bigButtonLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  bigButtonSub: {
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginTop: spacing.xs,
  },
  badge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.background,
  },
});

// Play Menu — vertical stack of 4 modes (SameGoat-style)
function PlayMenu({ onBack, onVs, onDaily, onDecide, onDiscover }: {
  onBack: () => void;
  onVs: () => void;
  onDaily: () => void;
  onDecide: () => void;
  onDiscover: () => void;
}) {
  const insets = useSafeAreaInsets();

  const modes = [
    { label: 'VS', sub: 'head to head.', onPress: onVs },
    { label: 'DAILY', sub: "today's crew play.", onPress: onDaily },
    { label: 'DECIDE', sub: 'settle it.', onPress: onDecide },
    { label: 'DISCOVER', sub: 'compare & explore.', onPress: onDiscover },
  ];

  return (
    <View style={playMenuStyles.container}>
      <View style={[playMenuStyles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={onBack} style={playMenuStyles.backButton}>
          <Text style={playMenuStyles.backText}>{'<'} BACK</Text>
        </Pressable>
      </View>

      <View style={playMenuStyles.center}>
        {modes.map((mode) => (
          <Pressable key={mode.label} style={playMenuStyles.modeButton} onPress={mode.onPress}>
            <Text style={playMenuStyles.modeLabel}>{mode.label}</Text>
            <Text style={playMenuStyles.modeSub}>{mode.sub}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const playMenuStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    paddingHorizontal: spacing.lg,
  },
  backButton: {
    paddingVertical: spacing.sm,
  },
  backText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  modeButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xxl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xxl,
  },
  modeLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  modeSub: {
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginTop: spacing.xs,
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

// Minimal header for guest deep link users — just logo + profile
function GuestHeader({ onProfilePress }: { onProfilePress: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: colors.background, paddingTop: insets.top + spacing.xs }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, height: 44 }}>
        <Text style={{ fontSize: 28, color: colors.textPrimary, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' as const }}>AAYBEE</Text>
        <Pressable onPress={onProfilePress} style={{ padding: 4 }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontSize: 12, color: colors.textMuted, fontWeight: '700' }}>?</Text>
          </View>
        </Pressable>
      </View>
      <View style={{ height: 1, backgroundColor: colors.border }} />
    </View>
  );
}

// Screen header with back button — used when navigating into a play mode or friends
function ScreenHeader({ title, onBack, rightElement }: { title: string; onBack: () => void; rightElement?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: colors.background, paddingTop: insets.top + spacing.xs }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, height: 44 }}>
        <Pressable onPress={onBack} style={{ paddingVertical: spacing.xs, paddingRight: spacing.md }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' as const }}>{'<'} BACK</Text>
        </Pressable>
        <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary, letterSpacing: 2, textTransform: 'uppercase' as const }}>{title}</Text>
        <View style={{ minWidth: 60 }}>{rightElement}</View>
      </View>
      <View style={{ height: 1, backgroundColor: colors.border }} />
    </View>
  );
}

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
      if (mounted) setPendingChallengeCount(pendingVs.length + friendRequests.length + pendingFriendChallenges.length);
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
          <LandingPage
            onPlay={() => setPhase('playMenu')}
            onFriends={() => setPhase('friends')}
            onProfile={() => setPhase('profile')}
            friendsBadge={pendingChallengeCount}
          />
        );

      case 'playMenu':
        return (
          <PlayMenu
            onBack={() => setPhase('landing')}
            onVs={() => setPhase('vs')}
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
          <ComparisonScreen
            onOpenRanking={() => setPhase('profile')}
            onOpenDiscover={() => {}}
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
          <ChallengeScreen
            onOpenAuth={() => setShowAuth(true)}
          />
        );

      case 'profile':
        return (
          <ProfileScreen
            onOpenDebug={toggleDebug}
            onClose={() => setPhase('landing')}
            isGuestMode={isGuestMode}
            onOpenAuth={() => { setShowAuth(true); }}
            onOpenTv={() => { closeAllOverlays(); setShowTv(true); }}
            onOpenAaybee100={() => { closeAllOverlays(); setShowAaybee100(true); }}
          />
        );

      default:
        return (
          <LandingPage
            onPlay={() => setPhase('playMenu')}
            onFriends={() => setPhase('friends')}
            onProfile={() => setPhase('profile')}
            friendsBadge={pendingChallengeCount}
          />
        );
    }
  };

  // Determine if we should show back-nav header (not on landing/playMenu which have their own nav)
  const showScreenHeader = !['landing', 'playMenu'].includes(phase);
  const screenTitles: Record<NavPhase, string> = {
    landing: '', playMenu: '', vs: 'VS', daily: 'DAILY',
    decide: 'DECIDE', discover: 'DISCOVER', friends: 'FRIENDS', profile: 'PROFILE',
  };

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
          {/* Show header with back button on screen phases (not landing/playMenu which have their own) */}
          {showScreenHeader && !isGuestMode && (
            <ScreenHeader
              title={screenTitles[phase]}
              onBack={() => {
                // VS/Daily/Decide/Discover go back to play menu; Friends/Profile go to landing
                if (['vs', 'daily', 'decide', 'discover'].includes(phase)) {
                  setPhase('playMenu');
                } else {
                  setPhase('landing');
                }
              }}
              rightElement={
                <Pressable onPress={() => { closeAllOverlays(); setShowSearch(true); }} style={{ padding: 6 }}>
                  <SearchIcon size={20} color={colors.textMuted} />
                </Pressable>
              }
            />
          )}
          {showScreenHeader && isGuestMode && (
            <GuestHeader onProfilePress={() => setPhase('profile')} />
          )}

          {screenContent}

          {/* No bottom nav — navigation is through landing page buttons */}
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
