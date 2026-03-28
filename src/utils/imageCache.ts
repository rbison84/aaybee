import { Image } from 'react-native';

// Simple in-memory cache to track prefetched URLs
const prefetchedUrls = new Set<string>();
const prefetchQueue: string[] = [];
let isPrefetching = false;

/**
 * Prefetch an image URL for faster loading
 */
export function prefetchImage(url: string | null | undefined): void {
  if (!url || prefetchedUrls.has(url)) return;

  prefetchQueue.push(url);
  processQueue();
}

/**
 * Prefetch multiple images
 */
export function prefetchImages(urls: (string | null | undefined)[]): void {
  urls.forEach(url => prefetchImage(url));
}

/**
 * Process the prefetch queue with rate limiting
 */
async function processQueue(): Promise<void> {
  if (isPrefetching || prefetchQueue.length === 0) return;

  isPrefetching = true;

  const batch = [...prefetchQueue];
  prefetchQueue.length = 0;

  await Promise.all(
    batch
      .filter(url => !prefetchedUrls.has(url))
      .map(url =>
        Image.prefetch(url)
          .then(() => prefetchedUrls.add(url))
          .catch(() => {}) // Silently fail - prefetch is optional optimization
      )
  );

  isPrefetching = false;

  // Process any URLs added during the batch
  if (prefetchQueue.length > 0) processQueue();
}

/**
 * Check if an image URL has been prefetched
 */
export function isImagePrefetched(url: string | null | undefined): boolean {
  return url ? prefetchedUrls.has(url) : false;
}

/**
 * Clear the prefetch cache (useful for memory management)
 */
export function clearPrefetchCache(): void {
  prefetchedUrls.clear();
}
