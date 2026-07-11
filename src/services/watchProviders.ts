// ============================================
// WATCH PROVIDERS — streaming availability + click-through intent
// ============================================
// Data comes from TMDB's /watch/providers endpoint (licensed from JustWatch —
// the UI must show "streaming data by JustWatch" attribution wherever
// providers are displayed). The aggregate `link` opens the movie's JustWatch
// page, which works for every provider; per-provider affiliate wrapping can
// be layered in later without changing callers.
//
// Every click-through is logged to watch_clicks — the revenue-intent event.

import { Platform } from 'react-native';
import { supabase } from './supabase';

const API_TOKEN = process.env.EXPO_PUBLIC_TMDB_API_TOKEN || '';
const BASE_URL = 'https://api.themoviedb.org/3';
const LOGO_BASE = 'https://image.tmdb.org/t/p/w92';

export interface WatchProvider {
  providerId: number;
  name: string;
  logoUrl: string;
  kind: 'stream' | 'rent' | 'buy';
}

export interface WatchAvailability {
  link: string | null;          // JustWatch aggregate page for the movie
  providers: WatchProvider[];   // flatrate first, then rent/buy
}

/** Parse the numeric TMDB id out of an app movie id ('tmdb-603' → 603). */
export function tmdbIdFromMovieId(movieId: string | undefined): number | undefined {
  if (!movieId) return undefined;
  const match = movieId.match(/^tmdb-(\d+)$/);
  return match ? parseInt(match[1], 10) : undefined;
}

// ---- Region ----

function detectRegion(): string {
  try {
    const locale =
      (typeof navigator !== 'undefined' && navigator.language) ||
      Intl.DateTimeFormat().resolvedOptions().locale ||
      '';
    const region = locale.split('-')[1]?.toUpperCase();
    if (region && /^[A-Z]{2}$/.test(region)) return region;
  } catch {}
  return 'US';
}

const REGION = detectRegion();

// ---- Cache (24h, in-memory) ----

const cache = new Map<number, { data: WatchAvailability; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000;

// ---- Fetch ----

export async function getWatchAvailability(tmdbId: number | undefined): Promise<WatchAvailability | null> {
  if (!tmdbId || !API_TOKEN) return null;

  const cached = cache.get(tmdbId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data;

  try {
    const res = await fetch(`${BASE_URL}/movie/${tmdbId}/watch/providers`, {
      headers: { Authorization: `Bearer ${API_TOKEN}`, Accept: 'application/json' },
    });
    if (!res.ok) return null;

    const json = await res.json();
    const regionData = json?.results?.[REGION] || json?.results?.US;
    if (!regionData) {
      const empty: WatchAvailability = { link: null, providers: [] };
      cache.set(tmdbId, { data: empty, timestamp: Date.now() });
      return empty;
    }

    const mapKind = (list: any[] | undefined, kind: WatchProvider['kind']): WatchProvider[] =>
      (list || []).map((p: any) => ({
        providerId: p.provider_id,
        name: p.provider_name,
        logoUrl: p.logo_path ? `${LOGO_BASE}${p.logo_path}` : '',
        kind,
      }));

    // Streaming (flatrate) first — that's the "watch tonight" answer
    const providers = [
      ...mapKind(regionData.flatrate, 'stream'),
      ...mapKind(regionData.rent, 'rent'),
      ...mapKind(regionData.buy, 'buy'),
    ];

    // De-dupe by provider (a service can appear in rent AND buy)
    const seen = new Set<number>();
    const deduped = providers.filter(p => {
      if (seen.has(p.providerId)) return false;
      seen.add(p.providerId);
      return true;
    });

    const data: WatchAvailability = {
      link: regionData.link || null,
      providers: deduped,
    };
    cache.set(tmdbId, { data, timestamp: Date.now() });
    return data;
  } catch {
    return null;
  }
}

// ---- Click-through logging + open ----

export type WatchClickSource = 'trailer' | 'decide' | 'detail' | 'discover';

export async function logWatchClick(
  userId: string | null | undefined,
  movieId: string,
  provider: string | null,
  source: WatchClickSource,
): Promise<void> {
  if (!userId) return; // insert policy is authenticated-only
  try {
    await supabase.from('watch_clicks').insert({
      user_id: userId,
      movie_id: movieId,
      provider,
      source,
    });
  } catch {}
}

/**
 * Open the watch page (JustWatch aggregate) and log the intent event.
 */
export async function openWatchLink(
  availability: WatchAvailability,
  userId: string | null | undefined,
  movieId: string,
  source: WatchClickSource,
  provider?: string,
): Promise<void> {
  logWatchClick(userId, movieId, provider || availability.providers[0]?.name || null, source).catch(() => {});

  const url = availability.link;
  if (!url) return;
  try {
    if (Platform.OS === 'web') {
      window.open(url, '_blank', 'noopener');
    } else {
      const { Linking } = require('react-native');
      await Linking.openURL(url);
    }
  } catch {}
}
