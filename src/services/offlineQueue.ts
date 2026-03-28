import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = '@aaybee/offline_queue';

export type QueuedOperationType =
  | 'sync_profile'
  | 'sync_movie'
  | 'sync_comparison'
  | 'batch_sync_movies';

export interface QueuedOperation {
  id: string;
  type: QueuedOperationType;
  payload: any;
  createdAt: number;
  retryCount: number;
  lastError?: string;
}

/**
 * Get all queued operations
 */
export async function getQueuedOperations(): Promise<QueuedOperation[]> {
  try {
    const data = await AsyncStorage.getItem(QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('[OfflineQueue] Failed to get queue:', error);
    return [];
  }
}

/**
 * Add an operation to the queue
 */
export async function addToQueue(
  type: QueuedOperationType,
  payload: any
): Promise<void> {
  try {
    const queue = await getQueuedOperations();

    // Check for duplicate operations (same type and key data)
    const isDuplicate = queue.some(op => {
      if (op.type !== type) return false;

      // For movie syncs, check movie_id
      if (type === 'sync_movie' && op.payload.movie_id === payload.movie_id) {
        return true;
      }
      // For comparisons, check the combination
      if (type === 'sync_comparison' &&
          op.payload.movie_a_id === payload.movie_a_id &&
          op.payload.movie_b_id === payload.movie_b_id) {
        return true;
      }
      // For profile sync, always replace
      if (type === 'sync_profile') {
        return true;
      }
      return false;
    });

    if (isDuplicate) {
      // Update existing operation instead of adding duplicate
      const updatedQueue = queue.map(op => {
        if (op.type === type) {
          if (type === 'sync_movie' && op.payload.movie_id === payload.movie_id) {
            return { ...op, payload, createdAt: Date.now() };
          }
          if (type === 'sync_profile') {
            return { ...op, payload, createdAt: Date.now() };
          }
        }
        return op;
      });
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(updatedQueue));
    } else {
      const operation: QueuedOperation = {
        id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        payload,
        createdAt: Date.now(),
        retryCount: 0,
      };
      queue.push(operation);
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    }
  } catch (error) {
    console.error('[OfflineQueue] Failed to add to queue:', error);
  }
}

/**
 * Remove an operation from the queue
 */
export async function removeFromQueue(operationId: string): Promise<void> {
  try {
    const queue = await getQueuedOperations();
    const filtered = queue.filter(op => op.id !== operationId);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('[OfflineQueue] Failed to remove from queue:', error);
  }
}

/**
 * Update an operation's retry count and error
 */
export async function updateOperationRetry(
  operationId: string,
  error: string
): Promise<void> {
  try {
    const queue = await getQueuedOperations();
    const updated = queue.map(op => {
      if (op.id === operationId) {
        return {
          ...op,
          retryCount: op.retryCount + 1,
          lastError: error,
        };
      }
      return op;
    });
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('[OfflineQueue] Failed to update operation:', error);
  }
}

/**
 * Clear all queued operations
 */
export async function clearQueue(): Promise<void> {
  try {
    await AsyncStorage.removeItem(QUEUE_KEY);
  } catch (error) {
    console.error('[OfflineQueue] Failed to clear queue:', error);
  }
}

/**
 * Get queue size
 */
export async function getQueueSize(): Promise<number> {
  const queue = await getQueuedOperations();
  return queue.length;
}

/**
 * Remove operations that have exceeded max retries
 */
export async function pruneFailedOperations(maxRetries: number = 5): Promise<number> {
  try {
    const queue = await getQueuedOperations();
    const validOps = queue.filter(op => op.retryCount < maxRetries);
    const prunedCount = queue.length - validOps.length;

    if (prunedCount > 0) {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(validOps));
      console.log(`[OfflineQueue] Pruned ${prunedCount} failed operations`);
    }

    return prunedCount;
  } catch (error) {
    console.error('[OfflineQueue] Failed to prune operations:', error);
    return 0;
  }
}
