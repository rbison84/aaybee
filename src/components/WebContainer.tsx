import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useAppDimensions, MOBILE_CONTAINER_WIDTH } from '../contexts/DimensionsContext';
import { theme } from '../theme';

interface WebContainerProps {
  children: React.ReactNode;
}

/**
 * WebContainer wraps the app on web to provide a mobile-like appearance.
 * On tablet screens, it constrains the app to a phone-sized container
 * centered on a dark background.
 * On desktop screens, children render at full width (desktop layout handled by App.tsx).
 */
export function WebContainer({ children }: WebContainerProps) {
  const { isWeb, isMobile, isDesktop, height } = useAppDimensions();

  // On native, mobile web, or desktop web, render children directly
  if (!isWeb || isMobile || isDesktop) {
    return <>{children}</>;
  }

  // Phone frame uses ~90% of viewport height, leaving room for branding below
  const frameHeight = Math.round(height * 0.9);

  // On tablet web only, wrap in centered container with phone frame
  return (
    <View style={[styles.outerContainer, { height }]}>
      {/* Background pattern */}
      <View style={styles.backgroundPattern} />

      {/* Phone frame container */}
      <View style={[styles.phoneFrame, { height: frameHeight }]}>
        {/* Device notch decoration */}
        <View style={styles.notchContainer}>
          <View style={styles.notch} />
        </View>

        {/* App content */}
        <View style={styles.appContainer}>
          {children}
        </View>

        {/* Home indicator */}
        <View style={styles.homeIndicatorContainer}>
          <View style={styles.homeIndicator} />
        </View>
      </View>

      {/* Branding */}
      <View style={styles.brandingContainer}>
        <Text style={styles.brandingTitle}>AAYBEE</Text>
        <Text style={styles.brandingSubtitle}>Your personal movie rankings</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    width: '100%' as any,
    backgroundColor: '#0D0B14',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  backgroundPattern: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0D0B14',
    opacity: 1,
  },
  phoneFrame: {
    width: MOBILE_CONTAINER_WIDTH,
    maxWidth: '100%' as any,
    backgroundColor: '#000',
    borderRadius: 44,
    overflow: 'hidden',
    // Shadow for depth
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)',
    } as any : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 20 },
      shadowOpacity: 0.5,
      shadowRadius: 40,
    }),
  },
  notchContainer: {
    height: 34,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 8,
  },
  notch: {
    width: 120,
    height: 28,
    backgroundColor: '#000',
    borderRadius: 20,
    // Dynamic island style
    ...(Platform.OS === 'web' ? {
      background: 'linear-gradient(180deg, #1a1a1a 0%, #000 100%)',
    } as any : {}),
  },
  appContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  homeIndicatorContainer: {
    height: 20,
    backgroundColor: theme.colors.tabBarBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeIndicator: {
    width: 134,
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 3,
  },
  brandingContainer: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  brandingTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.15)',
  },
  brandingSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.1)',
    marginTop: 2,
  },
});

export default WebContainer;
