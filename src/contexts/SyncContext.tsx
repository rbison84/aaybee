import React, { createContext, useContext, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuth } from './AuthContext';
import { useSync } from '../hooks/useSync';
import { SyncStatus } from '../services/syncService';

interface SyncContextType {
  syncStatus: SyncStatus;
  queueSize: number;
  isOnline: boolean;
  triggerSync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { user, isGuest } = useAuth();
  const { syncStatus, queueSize, isOnline, processPendingSync } = useSync();
  const appState = useRef(AppState.currentState);

  // Process queue when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active' &&
        !isGuest &&
        user?.id
      ) {
        console.log('[SyncContext] App came to foreground, checking queue...');
        processPendingSync();
      }

      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [isGuest, user?.id, processPendingSync]);

  // Initial queue processing on mount (for logged-in users)
  useEffect(() => {
    if (!isGuest && user?.id && isOnline) {
      console.log('[SyncContext] Initial queue check...');
      processPendingSync();
    }
  }, [isGuest, user?.id, isOnline]);

  const triggerSync = useCallback(async () => {
    if (!isGuest && user?.id) {
      await processPendingSync();
    }
  }, [isGuest, user?.id, processPendingSync]);

  const value: SyncContextType = {
    syncStatus,
    queueSize,
    isOnline,
    triggerSync,
  };

  return (
    <SyncContext.Provider value={value}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSyncContext(): SyncContextType {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error('useSyncContext must be used within a SyncProvider');
  }
  return context;
}
