import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  ActivityIndicator,
  Platform,
  ViewToken,
  LayoutChangeEvent,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useAppStore } from '../store/useAppStore';
import { useMovieDetail } from '../contexts/MovieDetailContext';
import { useQuickRank } from '../contexts/QuickRankContext';
import { useAuth } from '../contexts/AuthContext';
import { useAlert } from '../contexts/AlertContext';
import { watchlistService } from '../services/watchlistService';
import { getMovieTrailer } from '../services/tmdb';
import { TvChannel, extractTmdbId, getAllChannelsMap, getCuratedSections } from '../data/tvChannels';
import { ChannelSelector } from '../components/tv/ChannelSelector';
import { TvGuide } from '../components/tv/TvGuide';
import { TrailerCard, TvItem, WebPersistentPlayer, WebPersistentPlayerHandle, isWebAudioUnlocked } from '../components/tv/TrailerCard';
import { Movie, Genre } from '../types';
import { useAppDimensions } from '../contexts/DimensionsContext';
import { colors, spacing, typography, borderRadius } from '../theme/cinematic';

interface TvScreenProps {
  onClose: () => void;
}

/** Web-only: brief TV static/noise overlay for channel-change transitions */
function TvStaticOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    let running = true;
    let animId: number;

    const draw = () => {
      if (!running) return;
      const img = ctx.createImageData(w, h);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 190;
      }
      ctx.putImageData(img, 0, 0);
      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => { running = false; cancelAnimationFrame(animId); };
  }, []);

  return (
    <div style={{
      position: 'absolute' as const,
      top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 15,
    }}>
      <canvas
        ref={canvasRef}
        width={200}
        height={150}
        style={{
          width: '100%',
          height: '100%',
          imageRendering: 'pixelated',
        } as React.CSSProperties}
      />
    </div>
  );
}

export function TvScreen({ onClose }: TvScreenProps) {
  const { movies, getRankedMovies } = useAppStore();
  const { openMovieDetail } = useMovieDetail();
  const { startQuickRank, isVisible: quickRankVisible } = useQuickRank();
  const { user, isGuest } = useAuth();
  const { showAlert } = useAlert();
  const { containerWidth } = useAppDimensions();

  // Measure actual container height via onLayout instead of using window height
  const [containerHeight, setContainerHeight] = useState(0);
  const [channelBarHeight, setChannelBarHeight] = useState(0);
  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerHeight(e.nativeEvent.layout.height);
  }, []);
  const handleChannelBarLayout = useCallback((e: LayoutChangeEvent) => {
    setChannelBarHeight(e.nativeEvent.layout.height);
  }, []);

  const itemHeight = containerHeight;

  const rankedMovies = useMemo(() => getRankedMovies(), [getRankedMovies]);

  const allChannelsMap = useMemo(() => getAllChannelsMap(movies, rankedMovies), [movies, rankedMovies]);
  const curatedSections = useMemo(() => getCuratedSections(movies, rankedMovies), [movies, rankedMovies]);
  const forYouChannel = useMemo(() => allChannelsMap.get('for-you')!, [allChannelsMap]);

  // Dynamic filter channels created via the guide's "play N movies" button
  const customChannelsRef = useRef<Map<string, TvChannel>>(new Map());

  const [activeChannelId, setActiveChannelId] = useState('for-you');
  const [guideVisible, setGuideVisible] = useState(false);
  // (pill bar is now derived from activeChannelId directly — no history needed)

  // Pill bar: only "for you" + the currently active channel (if different)
  const recentChannels = useMemo(() => {
    const result: TvChannel[] = [];
    const forYou = allChannelsMap.get('for-you');
    if (forYou) result.push(forYou);
    if (activeChannelId !== 'for-you') {
      const active = allChannelsMap.get(activeChannelId) ?? customChannelsRef.current.get(activeChannelId);
      if (active) result.push(active);
    }
    return result;
  }, [activeChannelId, allChannelsMap]);
  const [trailerItems, setTrailerItems] = useState<TvItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentVisibleIndex, setCurrentVisibleIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [webUnmuted, setWebUnmuted] = useState(() => Platform.OS !== 'web' || isWebAudioUnlocked());
  const [showStatic, setShowStatic] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const webPlayerRef = useRef<WebPersistentPlayerHandle>(null);
  const prefetchedRef = useRef<Set<string>>(new Set());
  const staticTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Build context info for a movie
  const getMovieContext = useCallback((movie: Movie): { contextLine: string; isRanked: boolean } => {
    const rankIndex = rankedMovies.findIndex(m => m.id === movie.id);
    if (rankIndex >= 0) {
      return { contextLine: `your #${rankIndex + 1}`, isRanked: true };
    }
    return { contextLine: 'not ranked', isRanked: false };
  }, [rankedMovies]);

  // Load trailers for the active channel
  const loadTrailers = useCallback(async (channelId: string) => {
    setIsLoading(true);
    setTrailerItems([]);
    setCurrentVisibleIndex(0);
    prefetchedRef.current.clear();

    const channel = allChannelsMap.get(channelId) ?? customChannelsRef.current.get(channelId);
    if (!channel || channel.movieIds.length === 0) {
      setIsLoading(false);
      return;
    }

    // Take first 5 movies, fetch trailers in parallel
    const initialIds = channel.movieIds.slice(0, 5);
    const results = await Promise.all(
      initialIds.map(async (movieId): Promise<TvItem | null> => {
        const movie = movies.get(movieId);
        if (!movie) return null;

        const tmdbId = movie.tmdbId ?? extractTmdbId(movieId);
        const trailer = await getMovieTrailer(tmdbId);
        if (!trailer) return null;

        const { contextLine, isRanked } = getMovieContext(movie);
        return {
          id: `${channelId}-${movieId}`,
          movie,
          trailer,
          channelId,
          contextLine,
          isRanked,
        };
      })
    );

    const validItems = results.filter((r): r is TvItem => r !== null);
    setTrailerItems(validItems);
    setIsLoading(false);

    // Mark initial IDs as prefetched
    initialIds.forEach(id => prefetchedRef.current.add(id));

    // Start prefetching remaining
    prefetchMore(channel, validItems, 5);
  }, [allChannelsMap, movies, getMovieContext]);

  // Prefetch more trailers from the channel
  const prefetchMore = useCallback(async (
    channel: TvChannel,
    currentItems: TvItem[],
    startIndex: number
  ) => {
    const remaining = channel.movieIds.slice(startIndex);
    for (const movieId of remaining) {
      if (prefetchedRef.current.has(movieId)) continue;
      prefetchedRef.current.add(movieId);

      const movie = movies.get(movieId);
      if (!movie) continue;

      const tmdbId = movie.tmdbId ?? extractTmdbId(movieId);
      const trailer = await getMovieTrailer(tmdbId);
      if (!trailer) continue;

      const { contextLine, isRanked } = getMovieContext(movie);
      const newItem: TvItem = {
        id: `${channel.id}-${movieId}`,
        movie,
        trailer,
        channelId: channel.id,
        contextLine,
        isRanked,
      };

      setTrailerItems(prev => [...prev, newItem]);
    }
  }, [movies, getMovieContext]);

  // Load trailers when channel changes
  useEffect(() => {
    loadTrailers(activeChannelId);
  }, [activeChannelId, loadTrailers]);

  // Handle channel selection from pill bar
  const handleChannelSelect = useCallback((channelId: string) => {
    if (Platform.OS === 'web') {
      clearTimeout(staticTimeoutRef.current);
      setShowStatic(true);
      staticTimeoutRef.current = setTimeout(() => setShowStatic(false), 250);
    }
    setActiveChannelId(channelId);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  // Handle channel selection from TV Guide
  const handleGuideSelect = useCallback((channel: TvChannel) => {
    setGuideVisible(false);
    setPaused(false);
    if (Platform.OS === 'web') {
      clearTimeout(staticTimeoutRef.current);
      setShowStatic(true);
      staticTimeoutRef.current = setTimeout(() => setShowStatic(false), 250);
    }
    setActiveChannelId(channel.id);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  // Handle "play N movies" from filter selections in TV Guide
  const handlePlayFilters = useCallback((decades: string[], genres: Genre[], movieIds: string[]) => {
    // Build label from selections
    const parts: string[] = [
      ...decades.map(id => id.replace('decade-', '')),
      ...genres,
    ];
    const label = parts.join(' + ') || 'filtered';

    // Generate stable ID from sorted selections
    const sortedParts = [...decades, ...genres].sort();
    const channelId = `filter-${sortedParts.join('-')}`;

    const channel: TvChannel = {
      id: channelId,
      label,
      emoji: '🔍',
      movieIds,
    };

    // Register in custom channels map
    customChannelsRef.current.set(channelId, channel);

    // Close guide, unpause, show static, switch channel
    setGuideVisible(false);
    setPaused(false);
    if (Platform.OS === 'web') {
      clearTimeout(staticTimeoutRef.current);
      setShowStatic(true);
      staticTimeoutRef.current = setTimeout(() => setShowStatic(false), 250);
    }

    setActiveChannelId(channelId);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  // Track visible item
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setCurrentVisibleIndex(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current;

  // Open movie detail
  const handleOpenDetail = useCallback((movie: Movie) => {
    openMovieDetail(movie);
  }, [openMovieDetail]);

  // Add to watchlist
  const handleAddWatchlist = useCallback(async (movie: Movie) => {
    if (isGuest || !user) {
      showAlert('sign in to save your watchlist');
      return;
    }
    setPaused(true);
    try {
      await watchlistService.addToWatchlist(user.id, movie.id, 'manual');
      showAlert(`${movie.title} added to watchlist`);
    } catch {
      showAlert('could not add to watchlist');
    }
    setPaused(false);
  }, [user, isGuest, showAlert]);

  // Rank it now via QuickRank
  const handleRankIt = useCallback((movie: Movie) => {
    setPaused(true);
    startQuickRank({
      id: movie.id,
      title: movie.title,
      year: movie.year,
      posterUrl: movie.posterUrl || null,
    });
  }, [startQuickRank]);

  // Resume playback when QuickRank modal closes
  const prevQuickRankVisible = useRef(false);
  useEffect(() => {
    if (prevQuickRankVisible.current && !quickRankVisible) {
      setPaused(false);
    }
    prevQuickRankVisible.current = quickRankVisible;
  }, [quickRankVisible]);

  // Auto-advance to next trailer when current one ends (loops on web)
  const handleTrailerEnd = useCallback(() => {
    setCurrentVisibleIndex(prev => {
      const len = trailerItems.length;
      if (len === 0) return prev;

      if (Platform.OS === 'web') {
        const nextIndex = (prev + 1) % len;
        clearTimeout(staticTimeoutRef.current);
        setShowStatic(true);
        staticTimeoutRef.current = setTimeout(() => setShowStatic(false), 250);
        return nextIndex;
      } else {
        const nextIndex = prev + 1;
        if (nextIndex >= len) return prev;
        flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
        return nextIndex;
      }
    });
  }, [trailerItems.length]);

  // Web: navigate between trailers via buttons (loops)
  const handleWebNav = useCallback((direction: 'prev' | 'next') => {
    setCurrentVisibleIndex(prev => {
      const len = trailerItems.length;
      if (len === 0) return prev;
      const nextIndex = direction === 'next'
        ? (prev + 1) % len
        : (prev - 1 + len) % len;
      clearTimeout(staticTimeoutRef.current);
      setShowStatic(true);
      staticTimeoutRef.current = setTimeout(() => setShowStatic(false), 250);
      return nextIndex;
    });
  }, [trailerItems.length]);

  // Web: tap to unmute
  const handleWebUnmute = useCallback(() => {
    webPlayerRef.current?.unmute();
    setWebUnmuted(true);
  }, []);

  // Web: swipe up/down to navigate trailers
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    let startX = 0;
    let startY = 0;

    const onTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };

    const onTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dy) < 50 || Math.abs(dy) < Math.abs(dx)) return;
      handleWebNav(dy < 0 ? 'next' : 'prev');
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [handleWebNav]);

  // Render each trailer card
  const renderItem = useCallback(({ item, index }: { item: TvItem; index: number }) => (
    <TrailerCard
      item={item}
      isActive={index === currentVisibleIndex}
      paused={paused}
      itemHeight={itemHeight}
      onOpenDetail={handleOpenDetail}
      onTrailerEnd={handleTrailerEnd}
      onAddWatchlist={handleAddWatchlist}
      onRankIt={handleRankIt}
    />
  ), [currentVisibleIndex, paused, itemHeight, handleOpenDetail, handleTrailerEnd, handleAddWatchlist, handleRankIt]);

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: itemHeight,
    offset: itemHeight * index,
    index,
  }), [itemHeight]);

  const keyExtractor = useCallback((item: TvItem) => item.id, []);

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {containerHeight === 0 || isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>loading trailers...</Text>
        </View>
      ) : trailerItems.length === 0 ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.emptyText}>no trailers available</Text>
        </View>
      ) : Platform.OS === 'web' ? (
        /* Web: single trailer view — no FlatList */
        <TrailerCard
          item={trailerItems[currentVisibleIndex]}
          isActive={true}
          paused={paused}
          itemHeight={itemHeight}
          onOpenDetail={handleOpenDetail}
          onTrailerEnd={handleTrailerEnd}
          onAddWatchlist={handleAddWatchlist}
          onRankIt={handleRankIt}
        />
      ) : (
        <FlatList
          ref={flatListRef}
          data={trailerItems}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          pagingEnabled
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          getItemLayout={getItemLayout}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          removeClippedSubviews
        />
      )}

      {/* Web: persistent YouTube player positioned over the active card */}
      {Platform.OS === 'web' && trailerItems.length > 0 && !isLoading && containerHeight > 0 && (() => {
        const activeItem = trailerItems[currentVisibleIndex];
        if (!activeItem) return null;
        const pw = containerWidth;
        const ph = Math.round(pw * 9 / 16);
        const topOffset = (containerHeight - ph) / 2;
        return (
          <View style={[styles.webPlayerOverlay, { top: topOffset, width: pw, height: ph }]} pointerEvents="box-none">
            <WebPersistentPlayer
              ref={webPlayerRef}
              videoKey={activeItem.trailer.key}
              playerWidth={pw}
              playerHeight={ph}
              onEnd={handleTrailerEnd}
            />
          </View>
        );
      })()}

      {/* Web: TV static transition */}
      {showStatic && <TvStaticOverlay />}

      {/* Web: tap-to-unmute overlay */}
      {Platform.OS === 'web' && !webUnmuted && trailerItems.length > 0 && !isLoading && containerHeight > 0 && (
        <Pressable style={styles.unmuteOverlay} onPress={handleWebUnmute}>
          <View style={styles.unmuteContent}>
            <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
              <Path d="M11 5L6 9H2v6h4l5 4V5z" fill="#fff" />
              <Path d="M23 9l-6 6M17 9l6 6" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
            </Svg>
            <Text style={styles.unmuteText}>tap to unmute</Text>
          </View>
        </Pressable>
      )}

      {/* Header + channel bar */}
      <View style={styles.channelBar} onLayout={handleChannelBarLayout}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }} />
          <Text style={styles.title}>aaybee teevee</Text>
          <View style={{ flex: 1, alignItems: 'flex-end' as const }}>
            <Pressable style={styles.closeButton} onPress={onClose} hitSlop={8}>
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                <Path d="M18 6L6 18M6 6l12 12" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" />
              </Svg>
            </Pressable>
          </View>
        </View>
        <ChannelSelector
          channels={recentChannels}
          activeChannelId={activeChannelId}
          onSelect={handleChannelSelect}
          onOpenGuide={() => { setGuideVisible(true); setPaused(true); }}
        />
        <View style={styles.channelBarDivider} />
      </View>

      {/* TV Guide overlay */}
      {guideVisible && (
        <TvGuide
          activeChannelId={activeChannelId}
          curatedSections={curatedSections}
          forYouChannel={forYouChannel}
          onSelectChannel={handleGuideSelect}
          onPlayFilters={handlePlayFilters}
          onClose={() => { setGuideVisible(false); setPaused(false); }}
          allMovies={movies}
          rankedMovies={rankedMovies}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
  },
  channelBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: colors.background,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  closeButton: {
    padding: spacing.xs,
  },
  channelBarDivider: {
    height: 1,
    backgroundColor: colors.divider,
  },
  webPlayerOverlay: {
    position: 'absolute',
    left: 0,
    zIndex: 5,
  },
  unmuteOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 25,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(19, 17, 28, 0.4)',
  },
  unmuteContent: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  unmuteText: {
    ...typography.body,
    color: '#fff',
    fontWeight: '600',
  },
});
