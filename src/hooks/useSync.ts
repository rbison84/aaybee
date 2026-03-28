import { useState, useEffect, useCallback } from 'react';
import {
  SyncStatus,
  getSyncStatus,
  subscribeSyncStatus,
  processOfflineQueue,
} from '../services/syncService';
import { getQueueSize } from '../services/offlineQueue';
import { useNetworkStatus } from './useNetworkStatus';
import { useAuth } from '../contexts/AuthContext';

interface UseSyncReturn {
  syncStatus: SyncStatus;
  queueSize: number;
  isOnline: boolean;
  processPendingSync: () => Promise<number>;
}

/**
 * Hook to monitor and manage sync status
 */
export function useSync(): UseSyncReturn {
  const { user, isGuest } = useAuth();
  const { isConnected, isInternetReachable } = useNetworkStatus();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(getSyncStatus());
  const [queueSize, setQueueSize] = useState(0);

  const isOnline = isConnected && (isInternetReachable ?? true);

  // Subscribe to sync status changes
  useEffect(() => {
    const unsubscribe = subscribeSyncStatus(setSyncStatus);
    return unsubscribe;
  }, []);

  // Update queue size periodically
  useEffect(() => {
    const updateQueueSize = async () => {
      const size = await getQueueSize();
      setQueueSize(size);
    };

    updateQueueSize();

    // Check every 30 seconds
    const interval = setInterval(updateQueueSize, 30000);
    return () => clearInterval(interval);
  }, []);

  // Auto-process queue when coming back online
  useEffect(() => {
    if (isOnline && !isGuest && user?.id && queueSize > 0) {
      console.log('[useSync] Back online with pending operations, processing queue...');
      processOfflineQueue(user.id).then(processed => {
        if (processed > 0) {
          getQueueSize().then(setQueueSize);
        }
      });
    }
  }, [isOnline, isGuest, user?.id, queueSize]);

  const processPendingSync = useCallback(async () => {
    if (isGuest || !user?.id) {
      return 0;
    }

    const processed = await processOfflineQueue(user.id);
    const newSize = await getQueueSize();
    setQueueSize(newSize);

    return processed;
  }, [isGuest, user?.id]);

  return {
    syncStatus,
    queueSize,
    isOnline,
    processPendingSync,
  };
}
