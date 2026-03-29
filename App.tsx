// Polyfills must be imported first
import './src/polyfills';

import 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, ActivityIndicator, Pressable, Platform, Modal } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, withTiming, useSharedValue, interpolate } from 'react-native-reanimated';
import React, { useState, useCallback, useEffect, useRef, useMemo, Suspense } from 'react';
import { AppProvider, useAppStore } from './src/store/useAppStore';
import { useLockedFeature } from './src/contexts/LockedFeatureContext';
import { AuthProvider } from './src/contexts/AuthContext';
import { SyncProvider } from './src/contexts/SyncContext';
import { DimensionsProvider, useAppDimensions, DESKTOP_SIDEBAR_WIDTH } from './src/contexts/DimensionsContext';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { ComparisonScreen } from './src/screens/ComparisonScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { AuthScreen } from './src/screens/AuthScreen';
// FriendsScreen is now accessed via ProfileScreen
import { DailyScreen } from './src/screens/DailyScreen';
import { DecideScreen } from './src/screens/DecideScreen';
import { VsScreen } from './src/screens/VsScreen';
import { ChallengeScreen } from './src/screens/ChallengeScreen';

// Lazy-load screens that are locked behind comparison thresholds or shown as overlays
const DiscoverScreen = React.lazy(() => import('./src/screens/DiscoverScreen').then(m => ({ default: m.DiscoverScreen })));
const UnifiedRankingsScreen = React.lazy(() => import('./src/screens/UnifiedRankingsScreen').then(m => ({ default: m.UnifiedRankingsScreen })));
const Aaybee100Screen = React.lazy(() => import('./src/screens/Aaybee100Screen').then(m => ({ default: m.Aaybee100Screen })));
const TvScreen = React.lazy(() => import('./src/screens/TvScreen').then(m => ({ default: m.TvScreen })));
import { GlobalHeader } from './src/components/GlobalHeader';
import { TabIcon } from './src/components/TabIcon';
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
import { parseDeepLink, clearDeepLink, DeepLinkIntent } from './src/utils/deepLink';
import { notificationService } from './src/services/notificationService';
import { vsService } from './src/services/vsService';
import { friendService } from './src/services/friendService';
import { challengeService } from './src/services/challengeService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, borderRadius, typography } from './src/theme/cinematic';

// Navigation types — dual-mode with contextual bottom tabs
type AppMode = 'solo' | 'social';
type SoloTab = 'compare' | 'rankings' | 'discover';
type SocialTab = 'vs' | 'crews' | 'decide';
type TabType = SoloTab | SocialTab;

function LoadingScreen() {
  return (
    <View style={styles.loadingContainer}>
      <Text style={styles.loadingTitle}>aaybee</Text>
      <Text style={styles.loadingSubtitle}>your personal movie ranking</Text>
      <ActivityIndicator size="small" color={colors.textMuted} style={styles.loadingSpinner} />
    </View>
  );
}

// Tab lock thresholds
const TAB_UNLOCK_THRESHOLDS: Partial<Record<TabType, number>> = {
  rankings: 10,
  discover: 40,
  decide: 0,
  vs: 0, // always unlocked
};

// Mode toggle component — sits between header and screen content
function ModeToggle({ mode, onModeChange, socialBadge }: { mode: AppMode; onModeChange: (m: AppMode) => void; socialBadge?: boolean }) {
  const indicatorX = useSharedValue(mode === 'solo' ? 0 : 0.5);

  useEffect(() => {
    indicatorX.value = withTiming(mode === 'solo' ? 0 : 0.5, { duration: 250 });
  }, [mode]);

  const indicatorStyle = useAnimatedStyle(() => ({
    left: `${indicatorX.value * 100}%` as any,
  }));

  return (
    <View style={styles.modeToggle}>
      <Pressable
        style={styles.modeToggleItem}
        onPress={() => onModeChange('solo')}
      >
        <Text style={[
          styles.modeToggleText,
          mode === 'solo' && styles.modeToggleTextActive,
        ]}>
          MY MOVIES
        </Text>
      </Pressable>
      <Pressable
        style={styles.modeToggleItem}
        onPress={() => onModeChange('social')}
      >
        <Text style={[
          styles.modeToggleText,
          mode === 'social' && styles.modeToggleTextActive,
        ]}>
          PLAY WITH FRIENDS
        </Text>
        {socialBadge && <View style={styles.modeBadgeDot} />}
      </Pressable>
      {/* Active indicator */}
      <Animated.View style={[styles.modeToggleIndicator, indicatorStyle]} />
    </View>
  );
}

// Bottom Tab Bar — 3 contextual tabs per mode with slide animation
interface TabBarProps {
  mode: AppMode;
  activeTab: TabType;
  onTabPress: (tab: TabType) => void;
  lockedTabs: Record<TabType, boolean>;
  onLockedTabPress: (tab: TabType) => void;
}

function TabBar({ mode, activeTab, onTabPress, lockedTabs, onLockedTabPress }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const translateX = useSharedValue(0);
  const prevMode = useRef(mode);

  useEffect(() => {
    if (prevMode.current !== mode) {
      const direction = mode === 'social' ? 1 : -1;
      translateX.value = direction * 100;
      translateX.value = withTiming(0, { duration: 250 });
      prevMode.current = mode;
    }
  }, [mode]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: interpolate(Math.abs(translateX.value), [0, 100], [1, 0]),
  }));

  const tabs: { key: TabType; label: string }[] = mode === 'solo'
    ? [{ key: 'compare', label: 'compare' }, { key: 'rankings', label: 'rankings' }, { key: 'discover', label: 'discover' }]
    : [{ key: 'vs', label: 'vs' }, { key: 'crews', label: 'crews' }, { key: 'decide', label: 'decide' }];

  return (
    <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      <Animated.View style={[{ flexDirection: 'row' as const, flex: 1 }, animStyle]}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const isLocked = lockedTabs[tab.key];
          return (
            <Pressable
              key={tab.key}
              style={styles.tabItem}
              onPress={() => isLocked ? onLockedTabPress(tab.key) : onTabPress(tab.key)}
            >
              <View style={isLocked ? styles.lockedIconWrapper : undefined}>
                <TabIcon name={tab.key} active={isActive && !isLocked} size={24} />
              </View>
              <Text style={[
                styles.tabLabel,
                isActive && !isLocked && styles.tabLabelActive,
                isLocked && styles.tabLabelLocked,
              ]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </Animated.View>
    </View>
  );
}

// Desktop Sidebar — two grouped sections with mode-aware navigation
interface DesktopSidebarProps {
  activeTab: TabType;
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  onTabPress: (tab: TabType) => void;
  lockedTabs: Record<TabType, boolean>;
  onLockedTabPress: (tab: TabType) => void;
  onSearchPress: () => void;
  onProfilePress: () => void;
}

function DesktopSidebar({
  activeTab,
  mode,
  onModeChange,
  onTabPress,
  lockedTabs,
  onLockedTabPress,
  onSearchPress,
  onProfilePress,
}: DesktopSidebarProps) {
  const soloTabs: { key: SoloTab; label: string }[] = [
    { key: 'compare', label: 'compare' },
    { key: 'rankings', label: 'rankings' },
    { key: 'discover', label: 'discover' },
  ];

  const socialTabs: { key: SocialTab; label: string }[] = [
    { key: 'vs', label: 'vs' },
    { key: 'crews', label: 'crews' },
    { key: 'decide', label: 'decide' },
  ];

  const shortcuts: { label: string; onPress: () => void }[] = [
    { label: 'search', onPress: onSearchPress },
    { label: 'profile', onPress: onProfilePress },
  ];

  const handleSoloTabPress = (tab: SoloTab) => {
    if (mode !== 'solo') onModeChange('solo');
    onTabPress(tab);
  };

  const handleSocialTabPress = (tab: SocialTab) => {
    if (mode !== 'social') onModeChange('social');
    onTabPress(tab);
  };

  return (
    <View style={sidebarStyles.container}>
      <Text style={sidebarStyles.logo}>aaybee</Text>

      {/* MY MOVIES section */}
      <Text style={sidebarStyles.sectionHeader}>MY MOVIES</Text>
      <View style={sidebarStyles.navSection}>
        {soloTabs.map((tab) => {
          const isActive = activeTab === tab.key && mode === 'solo';
          const isLocked = lockedTabs[tab.key];
          return (
            <Pressable
              key={tab.key}
              style={[
                sidebarStyles.navItem,
                isActive && sidebarStyles.navItemActive,
                isLocked && sidebarStyles.navItemLocked,
              ]}
              onPress={() => isLocked ? onLockedTabPress(tab.key) : handleSoloTabPress(tab.key)}
            >
              <TabIcon name={tab.key} active={isActive && !isLocked} size={20} />
              <Text style={[
                sidebarStyles.navLabel,
                isActive && !isLocked && sidebarStyles.navLabelActive,
                isLocked && sidebarStyles.navLabelLocked,
              ]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={sidebarStyles.divider} />

      {/* PLAY WITH FRIENDS section */}
      <Text style={sidebarStyles.sectionHeader}>PLAY WITH FRIENDS</Text>
      <View style={sidebarStyles.navSection}>
        {socialTabs.map((tab) => {
          const isActive = activeTab === tab.key && mode === 'social';
          const isLocked = lockedTabs[tab.key];
          return (
            <Pressable
              key={tab.key}
              style={[
                sidebarStyles.navItem,
                isActive && sidebarStyles.navItemActive,
                isLocked && sidebarStyles.navItemLocked,
              ]}
              onPress={() => isLocked ? onLockedTabPress(tab.key) : handleSocialTabPress(tab.key)}
            >
              <TabIcon name={tab.key} active={isActive && !isLocked} size={20} />
              <Text style={[
                sidebarStyles.navLabel,
                isActive && !isLocked && sidebarStyles.navLabelActive,
                isLocked && sidebarStyles.navLabelLocked,
              ]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={sidebarStyles.divider} />

      <View style={sidebarStyles.navSection}>
        {shortcuts.map((item) => (
          <Pressable
            key={item.label}
            style={sidebarStyles.navItem}
            onPress={item.onPress}
          >
            <Text style={sidebarStyles.shortcutLabel}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={sidebarStyles.keyboardHints}>
        <Text style={sidebarStyles.hintText}>keyboard shortcuts</Text>
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
    borderRightColor: colors.tabBarBorder,
    paddingTop: spacing.xxxl,
    paddingHorizontal: spacing.lg,
  },
  logo: {
    fontSize: 28,
    color: colors.textPrimary,
    fontWeight: '800',
    letterSpacing: -1.5,
    marginBottom: spacing.xxxl,
    paddingHorizontal: spacing.sm,
  },
  sectionHeader: {
    ...typography.tiny,
    color: colors.textMuted,
    fontWeight: '600',
    opacity: 0.5,
    letterSpacing: 1,
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
  navItemLocked: {
    opacity: 0.4,
  },
  navLabel: {
    ...typography.captionMedium,
    color: colors.textSecondary,
  },
  navLabelActive: {
    color: colors.accent,
    fontWeight: '600',
  },
  navLabelLocked: {
    color: colors.textMuted,
  },
  shortcutLabel: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.tabBarBorder,
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
        <Text style={{ fontSize: 28, color: colors.textPrimary, fontWeight: '800', letterSpacing: -1.5 }}>aaybee</Text>
        <Pressable onPress={onProfilePress} style={{ padding: 4 }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontSize: 14, color: colors.textMuted }}>?</Text>
          </View>
        </Pressable>
      </View>
      <View style={{ height: 1, backgroundColor: colors.tabBarBorder }} />
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
  const [showProfile, setShowProfile] = useState(false);
  const [mode, setMode] = useState<AppMode>('solo');
  const [soloTab, setSoloTab] = useState<SoloTab>('compare');
  const [socialTab, setSocialTab] = useState<SocialTab>('vs');
  const activeTab: TabType = mode === 'solo' ? soloTab : socialTab;
  const [rankingsInitialTab, setRankingsInitialTab] = useState<'yours' | 'friends' | 'global'>('yours');
  const [rankingsInitialFilter, setRankingsInitialFilter] = useState<'classic' | 'top25' | 'all'>('classic');
  const [tabBeforeProfile, setTabBeforeProfile] = useState<TabType>('compare');
  const [showSearch, setShowSearch] = useState(false);
  const [showAaybee100, setShowAaybee100] = useState(false);
  const [showTv, setShowTv] = useState(false);
  const [showVs, setShowVs] = useState(false);
  const [vsInitialCode, setVsInitialCode] = useState<string | undefined>();
  const [challengeInitialCode, setChallengeInitialCode] = useState<string | undefined>();
  const [rankingReveal, setRankingReveal] = useState<'classic' | 'top25' | 'all' | null>(null);
  const [showGuestPrompt, setShowGuestPrompt] = useState(false);

  // Load persisted mode on mount + smart default landing
  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem('aaybee_mode');
      if (saved === 'solo' || saved === 'social') {
        setMode(saved);
      }
      // If user has pending social activity, override to social
      if (user?.id) {
        const [friendChallenges] = await Promise.all([
          challengeService.getMyActiveChallenges(user.id),
        ]);
        const hasPending = friendChallenges.some(c =>
          (c.status === 'active' && c.challenger_id === user.id)
        );
        if (hasPending) setMode('social');
      }
    })();
  }, [user?.id]);

  // Save mode on change
  const handleModeChange = useCallback((newMode: AppMode) => {
    setMode(newMode);
    AsyncStorage.setItem('aaybee_mode', newMode).catch(() => {});
  }, []);

  // Deep link: parse URL on mount
  const [deepLink] = useState<DeepLinkIntent>(() => parseDeepLink());

  // Guest mode: landed via deep link without an account
  const isGuestMode = !hasCompletedOnboarding && !!deepLink && isAuthGuest;

  // Compute locked tabs
  const lockedTabs = useMemo((): Record<TabType, boolean> => {
    if (isGuestMode) {
      // Guest mode: solo tabs locked, social tabs unlocked if deep-linked
      return {
        compare: true, rankings: true, discover: true,
        vs: deepLink?.type !== 'challenge',
        crews: deepLink?.type !== 'daily',
        decide: true,
      };
    }
    return {
      compare: false,
      vs: false,
      crews: false,
      rankings: unlockAllFeatures ? false : postOnboardingComparisons < (TAB_UNLOCK_THRESHOLDS.rankings ?? 0),
      discover: unlockAllFeatures ? false : postOnboardingComparisons < (TAB_UNLOCK_THRESHOLDS.discover ?? 0),
      decide: unlockAllFeatures ? false : postOnboardingComparisons < (TAB_UNLOCK_THRESHOLDS.decide ?? 0),
    };
  }, [postOnboardingComparisons, unlockAllFeatures, isGuestMode, deepLink]);

  const handleLockedTabPress = useCallback((tab: TabType) => {
    if (isGuestMode) {
      setShowGuestPrompt(true);
      return;
    }
    const threshold = TAB_UNLOCK_THRESHOLDS[tab] ?? 0;
    const remaining = threshold - postOnboardingComparisons;
    showLockedFeature({
      feature: tab,
      requirement: `compare ${remaining} more movie${remaining !== 1 ? 's' : ''} to unlock`,
      progress: {
        current: postOnboardingComparisons,
        required: threshold,
      },
    });
  }, [postOnboardingComparisons, showLockedFeature, isGuestMode]);

  // Navigation helpers for unlock milestones — show reveal overlay instead of navigating directly
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
    setRankingsInitialTab('yours');
    if (rankingReveal === 'classic') {
      setRankingsInitialFilter('classic');
    } else if (rankingReveal === 'top25') {
      setRankingsInitialFilter('top25');
    } else {
      setRankingsInitialFilter('all');
    }
    handleModeChange('solo');
    setSoloTab('rankings');
    setRankingReveal(null);
  }, [rankingReveal, handleModeChange]);

  const handleRevealDismiss = useCallback(() => {
    setRankingReveal(null);
  }, []);


  // Toggle debug panel
  const toggleDebug = useCallback(() => {
    setDebugVisible(prev => !prev);
  }, []);

  // Close all header overlays (only one should be open at a time)
  const closeAllOverlays = useCallback(() => {
    setShowProfile(false);
    setShowSearch(false);
    setShowAaybee100(false);
    setShowTv(false);
    setShowVs(false);
  }, []);

  // Handle opening profile - remember current tab
  const handleOpenProfile = useCallback(() => {
    closeAllOverlays();
    setTabBeforeProfile(activeTab);
    setShowProfile(true);
  }, [activeTab, closeAllOverlays]);

  // Handle tab press - if profile is open, close it and navigate
  const handleTabPress = useCallback((tab: TabType) => {
    if (showProfile) {
      setShowProfile(false);
    }
    // Route to the correct mode-specific setter
    const soloTabs: TabType[] = ['compare', 'rankings', 'discover'];
    if (soloTabs.includes(tab)) {
      setSoloTab(tab as SoloTab);
    } else {
      setSocialTab(tab as SocialTab);
    }
  }, [showProfile]);

  // Handle profile close via X button - return to previous tab
  const handleProfileClose = useCallback(() => {
    setShowProfile(false);
    // Restore previous tab in the correct mode
    const soloTabsList: TabType[] = ['compare', 'rankings', 'discover'];
    if (soloTabsList.includes(tabBeforeProfile)) {
      handleModeChange('solo');
      setSoloTab(tabBeforeProfile as SoloTab);
    } else {
      handleModeChange('social');
      setSocialTab(tabBeforeProfile as SocialTab);
    }
  }, [tabBeforeProfile, handleModeChange]);

  // Track if onboarding just completed (went from false to true)
  const prevOnboardingComplete = useRef(hasCompletedOnboarding);
  useEffect(() => {
    // Only reset when onboarding JUST completed (false -> true)
    if (hasCompletedOnboarding && !prevOnboardingComplete.current) {
      setShowProfile(false);
      handleModeChange('solo');
      setSoloTab('compare');
    }
    prevOnboardingComplete.current = hasCompletedOnboarding;
  }, [hasCompletedOnboarding, handleModeChange]);

  // Deep link: consume after app is ready (no onboarding required)
  const deepLinkConsumed = useRef(false);
  useEffect(() => {
    if (!deepLink || deepLinkConsumed.current || isLoading) return;
    deepLinkConsumed.current = true;
    clearDeepLink();

    if (deepLink.type === 'daily') {
      handleModeChange('social');
      setSocialTab('crews');
    } else if (deepLink.type === 'vs') {
      // Legacy VS links — open VS overlay (keep for backwards compat)
      closeAllOverlays();
      setVsInitialCode(deepLink.code);
      setShowVs(true);
    } else if (deepLink.type === 'challenge') {
      handleModeChange('social');
      setSocialTab('vs');
      setChallengeInitialCode(deepLink.code);
    } else if (deepLink.type === 'share') {
      handleModeChange('social');
      setSocialTab('crews');
    }
  }, [deepLink, isLoading, closeAllOverlays, handleModeChange]);

  // Register for push notifications when user is authenticated
  useEffect(() => {
    if (user?.id) {
      notificationService.registerForPushNotifications(user.id).catch(() => {});
    }
  }, [user?.id]);

  // Handle notification taps — route to challenge tab
  useEffect(() => {
    return notificationService.addNotificationResponseListener((data) => {
      if (data.type === 'vs' && data.code) {
        handleModeChange('social');
        setSocialTab('vs');
        setChallengeInitialCode(data.code as string);
      }
    });
  }, [handleModeChange]);

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
        (c.status === 'pending' && c.creator_id === user.id) || // waiting for friend
        (c.status === 'active' && c.challenger_id === user.id) // friend sent you one
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

  // Show onboarding for new users — but let /daily and /vs deep links through
  if (!hasCompletedOnboarding && !deepLink) {
    return (
      <>
        <OnboardingScreen
          onComplete={() => {}}
        />
        <DebugPanel visible={debugVisible} onClose={() => setDebugVisible(false)} />
      </>
    );
  }

  const { isDesktop, isWeb } = useAppDimensions();
  const isDesktopWeb = isDesktop && isWeb;

  const stats = getStats();

  // Render active screen content (without header - header is global)
  // Safety fallback: if active tab is locked, force compare
  const effectiveTab = lockedTabs[activeTab] ? 'compare' : activeTab;
  const renderScreenContent = () => {
    switch (effectiveTab) {
      case 'compare':
        return (
          <ComparisonScreen
            onOpenRanking={() => { handleModeChange('solo'); setSoloTab('rankings'); }}
            onOpenDiscover={() => { handleModeChange('solo'); setSoloTab('discover'); }}
            onOpenDecide={() => { handleModeChange('social'); setSocialTab('decide'); }}
            onOpenAuth={() => setShowAuth(true)}
            onOpenProfile={handleOpenProfile}
            onOpenTop10Search={navigateToTop10Search}
            onOpenTop25={navigateToTop25}
            onOpenGlobal={navigateToGlobal}
          />
        );
      case 'rankings':
        return (
          <Suspense fallback={<LoadingScreen />}>
            <UnifiedRankingsScreen
              onContinueComparing={() => { handleModeChange('solo'); setSoloTab('compare'); }}
              onOpenAaybee100={() => { closeAllOverlays(); setShowAaybee100(true); }}
              initialTab={rankingsInitialTab}
              initialFilter={rankingsInitialFilter}
            />
          </Suspense>
        );
      case 'crews':
        return (
          <DailyScreen />
        );
      case 'vs':
        return (
          <ChallengeScreen
            initialCode={challengeInitialCode}
          />
        );
      case 'discover':
        return (
          <Suspense fallback={<LoadingScreen />}>
            <DiscoverScreen
              onNavigateToCompare={() => { handleModeChange('solo'); setSoloTab('compare'); }}
            />
          </Suspense>
        );
      case 'decide':
        return (
          <DecideScreen onNavigateToCompare={() => { handleModeChange('solo'); setSoloTab('compare'); }} />
        );
      default:
        return (
          <ComparisonScreen
            onOpenRanking={() => { handleModeChange('solo'); setSoloTab('rankings'); }}
            onOpenDiscover={() => { handleModeChange('solo'); setSoloTab('discover'); }}
            onOpenDecide={() => { handleModeChange('social'); setSocialTab('decide'); }}
            onOpenAuth={() => setShowAuth(true)}
            onOpenProfile={handleOpenProfile}
            onOpenTop10Search={navigateToTop10Search}
            onOpenTop25={navigateToTop25}
            onOpenGlobal={navigateToGlobal}
          />
        );
    }
  };

  const screenContent = (
    <View style={styles.screenContainer}>
      {renderScreenContent()}

      {/* Profile screen overlay */}
      {showProfile && (
        <View style={styles.screenOverlay}>
          <ProfileScreen
            onOpenDebug={toggleDebug}
            onClose={handleProfileClose}
            isGuestMode={isGuestMode}
            onOpenAuth={() => { setShowProfile(false); setShowAuth(true); }}
            onOpenTv={() => { setShowProfile(false); closeAllOverlays(); setShowTv(true); }}
          />
        </View>
      )}

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

      {/* VS overlay */}
      {showVs && (
        <View style={styles.screenOverlay}>
          <VsScreen
            onClose={() => { setShowVs(false); setVsInitialCode(undefined); }}
            initialCode={vsInitialCode}
          />
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
      {/* Desktop: sidebar layout; Mobile/Tablet: header + bottom tabs */}
      {isDesktopWeb ? (
        <View style={styles.desktopLayout}>
          {!isGuestMode ? (
            <DesktopSidebar
              activeTab={activeTab}
              mode={mode}
              onModeChange={handleModeChange}
              onTabPress={handleTabPress}
              lockedTabs={lockedTabs}
              onLockedTabPress={handleLockedTabPress}
              onSearchPress={() => { closeAllOverlays(); setShowSearch(true); }}
              onProfilePress={handleOpenProfile}
            />
          ) : (
            <View style={[sidebarStyles.container, { justifyContent: 'space-between' }]}>
              <Text style={sidebarStyles.logo}>aaybee</Text>
              <Pressable
                style={{ paddingHorizontal: spacing.sm, paddingVertical: spacing.md }}
                onPress={handleOpenProfile}
              >
                <Text style={sidebarStyles.shortcutLabel}>profile</Text>
              </Pressable>
            </View>
          )}
          <View style={styles.desktopContent}>
            {screenContent}
          </View>
        </View>
      ) : (
        <>
          {/* Global Header (mobile/tablet only) — minimal for guest deep link users */}
          {isGuestMode ? (
            <GuestHeader onProfilePress={handleOpenProfile} />
          ) : (
            <GlobalHeader
              onProfilePress={handleOpenProfile}
              onSearchPress={() => { closeAllOverlays(); setShowSearch(true); }}
              notificationCount={pendingChallengeCount}
            />
          )}

          {/* Mode toggle (mobile/tablet only) */}
          {!isGuestMode && (
            <ModeToggle mode={mode} onModeChange={handleModeChange} socialBadge={pendingChallengeCount > 0} />
          )}

          {screenContent}

          {/* Bottom Tab Bar (mobile/tablet only) */}
          <TabBar
            mode={mode}
            activeTab={activeTab}
            onTabPress={handleTabPress}
            lockedTabs={lockedTabs}
            onLockedTabPress={handleLockedTabPress}
          />
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
              <Text style={styles.guestPromptTitle}>sign in required</Text>
              <Text style={styles.guestPromptText}>
                create an account to unlock all features — compare movies, build your rankings, discover new films, and challenge friends
              </Text>
              <Pressable
                style={styles.guestPromptButton}
                onPress={() => { setShowGuestPrompt(false); setShowAuth(true); }}
              >
                <Text style={styles.guestPromptButtonText}>create account</Text>
              </Pressable>
              <Pressable
                style={styles.guestPromptSkip}
                onPress={() => setShowGuestPrompt(false)}
              >
                <Text style={styles.guestPromptSkipText}>skip</Text>
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
  },
  loadingSubtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.xxxl,
  },
  loadingSpinner: {
    marginTop: spacing.sm,
  },
  // Mode toggle
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.tabBarBorder,
  },
  modeToggleItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  modeToggleText: {
    ...typography.captionMedium,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 11,
  } as any,
  modeToggleTextActive: {
    color: colors.textPrimary,
  },
  modeToggleIndicator: {
    position: 'absolute',
    bottom: 0,
    height: 2,
    backgroundColor: colors.accent,
    width: '50%',
  } as any,
  modeBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
    position: 'absolute',
    top: spacing.sm,
    right: spacing.lg,
  },
  // Tab Bar - 3 contextual tabs
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.tabBarBorder,
    paddingTop: spacing.xs,
    // paddingBottom is set dynamically via safe area insets in the component
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  tabLabel: {
    ...typography.tiny,
    color: colors.tabBarInactive,
    fontWeight: '500',
    marginTop: 2,
    fontSize: 10,
  },
  tabLabelActive: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  tabLabelLocked: {
    color: colors.textMuted,
    opacity: 0.4,
  },
  lockedIconWrapper: {
    opacity: 0.4,
  },
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
  },
  guestPromptText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 20,
  },
  guestPromptButton: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.lg,
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
  },
  guestPromptSkip: {
    paddingVertical: spacing.sm,
  },
  guestPromptSkipText: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
