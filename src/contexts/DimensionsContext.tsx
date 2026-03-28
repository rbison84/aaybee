import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { Dimensions, Platform, ScaledSize } from 'react-native';

interface AppDimensions {
  width: number;
  height: number;
  containerWidth: number;
  isWeb: boolean;
  isConstrained: boolean;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  scale: number;
}

const MOBILE_MAX_WIDTH = 430;
const TABLET_BREAKPOINT = 768;
const DESKTOP_BREAKPOINT = 1024;
const DESKTOP_SIDEBAR_WIDTH = 220;
const DESKTOP_CONTENT_MAX = 700;

const DimensionsContext = createContext<AppDimensions | null>(null);

/**
 * Get the actual visible viewport size on web.
 * Uses visualViewport API (accurate on mobile Safari where the address bar
 * changes the visible area) with window.innerWidth/Height as fallback.
 */
function getWebViewportSize(): { width: number; height: number } {
  if (typeof window === 'undefined') {
    const win = Dimensions.get('window');
    return { width: win.width, height: win.height };
  }
  // visualViewport gives the actual visible area on mobile browsers
  // (excludes on-screen keyboard, accounts for pinch-zoom & browser chrome)
  const vv = window.visualViewport;
  if (vv) {
    return { width: vv.width, height: vv.height };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

/** Keep the CSS custom property in sync so pure-CSS rules can use it too. */
function syncCssAppHeight(height: number) {
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--app-height', `${height}px`);
  }
}

export function DimensionsProvider({ children }: { children: React.ReactNode }) {
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>(() => {
    if (Platform.OS === 'web') {
      return getWebViewportSize();
    }
    const window = Dimensions.get('window');
    return { width: window.width, height: window.height };
  });

  useEffect(() => {
    if (Platform.OS === 'web') {
      const update = () => {
        const size = getWebViewportSize();
        setDimensions(size);
        syncCssAppHeight(size.height);
      };

      // Sync on mount
      update();

      // Listen to visualViewport resize (fires on mobile Safari URL bar show/hide)
      const vv = typeof window !== 'undefined' ? window.visualViewport : null;
      if (vv) {
        vv.addEventListener('resize', update);
        vv.addEventListener('scroll', update);
      }
      // Also listen to window resize for desktop browser resizing
      window.addEventListener('resize', update);

      return () => {
        if (vv) {
          vv.removeEventListener('resize', update);
          vv.removeEventListener('scroll', update);
        }
        window.removeEventListener('resize', update);
      };
    } else {
      const subscription = Dimensions.addEventListener('change', ({ window }: { window: ScaledSize }) => {
        setDimensions({ width: window.width, height: window.height });
      });
      return () => subscription?.remove();
    }
  }, []);

  const value = useMemo<AppDimensions>(() => {
    const { width, height } = dimensions;
    const isWeb = Platform.OS === 'web';
    const isMobile = width < TABLET_BREAKPOINT;
    const isTablet = width >= TABLET_BREAKPOINT && width < DESKTOP_BREAKPOINT;
    const isDesktop = width >= DESKTOP_BREAKPOINT;
    const isConstrained = isWeb && !isMobile;

    // On desktop web, use wider content area; on tablet web, use mobile-like width
    const containerWidth = isDesktop && isWeb
      ? Math.min(width - DESKTOP_SIDEBAR_WIDTH, DESKTOP_CONTENT_MAX)
      : isConstrained
        ? MOBILE_MAX_WIDTH
        : width;
    const scale = Math.min(containerWidth / MOBILE_MAX_WIDTH, 1);

    return {
      width,
      height,
      containerWidth,
      isWeb,
      isConstrained,
      isMobile,
      isTablet,
      isDesktop,
      scale,
    };
  }, [dimensions]);

  return (
    <DimensionsContext.Provider value={value}>
      {children}
    </DimensionsContext.Provider>
  );
}

export function useAppDimensions(): AppDimensions {
  const context = useContext(DimensionsContext);
  if (!context) {
    // Fallback for components outside provider (shouldn't happen in normal use)
    const win = Platform.OS === 'web' ? getWebViewportSize() : Dimensions.get('window');
    const isWeb = Platform.OS === 'web';
    const isMobile = win.width < TABLET_BREAKPOINT;
    const isConstrained = isWeb && !isMobile;
    const containerWidth = isConstrained ? MOBILE_MAX_WIDTH : win.width;
    return {
      width: win.width,
      height: win.height,
      containerWidth,
      isWeb,
      isConstrained,
      isMobile,
      isTablet: win.width >= TABLET_BREAKPOINT && win.width < DESKTOP_BREAKPOINT,
      isDesktop: win.width >= DESKTOP_BREAKPOINT,
      scale: Math.min(containerWidth / MOBILE_MAX_WIDTH, 1),
    };
  }
  return context;
}

// Export constants for components that need them
export const MOBILE_CONTAINER_WIDTH = MOBILE_MAX_WIDTH;
export { DESKTOP_SIDEBAR_WIDTH, DESKTOP_CONTENT_MAX };
export const WEB_BREAKPOINTS = {
  MOBILE_MAX_WIDTH,
  TABLET_BREAKPOINT,
  DESKTOP_BREAKPOINT,
};
