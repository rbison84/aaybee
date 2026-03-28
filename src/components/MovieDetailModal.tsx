import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  Linking,
  Modal,
  useWindowDimensions,
  Platform,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Polygon } from 'react-native-svg';
import YoutubePlayer from 'react-native-youtube-iframe';
import { useMovieDetail } from '../contexts/MovieDetailContext';
import { useAuth } from '../contexts/AuthContext';
import { useQuickRank } from '../contexts/QuickRankContext';
import { useAppStore } from '../store/useAppStore';
import { watchlistService } from '../services/watchlistService';
import {
  getFullMovieDetails,
  formatRuntime,
  getProviderLogoUrl,
  getMovieTrailer,
  getYouTubeThumbnailUrl,
  WatchProviders,
  WatchProvider,
  CastMember,
  MovieTrailer,
} from '../services/tmdb';
import { colors, spacing, borderRadius, typography, shadows } from '../theme/cinematic';
import { openLetterboxd } from '../utils/letterboxd';
import { useAppDimensions } from '../contexts/DimensionsContext';
import { useAlert } from '../contexts/AlertContext';
import { Genre } from '../types';

// Genre labels
const genreLabels: Record<Genre, string> = {
  action: 'action',
  comedy: 'comedy',
  drama: 'drama',
  scifi: 'sci-fi',
  romance: 'romance',
  thriller: 'thriller',
  animation: 'animation',
  horror: 'horror',
  adventure: 'adventure',
  fantasy: 'fantasy',
};

// Close icon
function CloseIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 6L6 18M6 6l12 12"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Bookmark/Watchlist icon
function BookmarkIcon({ color, filled }: { color: string; filled?: boolean }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill={filled ? color : 'none'}>
      <Path
        d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Play button icon
function PlayIcon() {
  return (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Polygon
        points="5,3 19,12 5,21"
        fill="#FFFFFF"
      />
    </Svg>
  );
}

// Provider logo component
function ProviderLogo({
  provider,
  onPress,
}: {
  provider: WatchProvider;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.providerLogo} onPress={onPress}>
      <Image
        source={{ uri: getProviderLogoUrl(provider.logo_path) }}
        style={styles.providerImage}
      />
    </Pressable>
  );
}

// Provider section
function ProviderSection({
  title,
  providers,
  link,
}: {
  title: string;
  providers: WatchProvider[];
  link: string | null;
}) {
  if (providers.length === 0) return null;

  const handleProviderPress = async () => {
    if (link) {
      try {
        await Linking.openURL(link);
      } catch (error) {
        console.warn('Failed to open provider link:', error);
      }
    }
  };

  return (
    <View style={styles.providerSection}>
      <Text style={styles.providerSectionTitle}>{title}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.providerRow}
      >
        {providers.slice(0, 8).map((provider) => (
          <ProviderLogo
            key={provider.provider_id}
            provider={provider}
            onPress={handleProviderPress}
          />
        ))}
      </ScrollView>
    </View>
  );
}

// Trailer thumbnail component
function TrailerThumbnail({
  trailer,
  onPlay,
  playerWidth,
  playerHeight,
}: {
  trailer: MovieTrailer;
  onPlay: () => void;
  playerWidth: number;
  playerHeight: number;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);

  return (
    <Pressable style={[styles.trailerThumbnailContainer, { width: playerWidth, height: playerHeight }]} onPress={onPlay}>
      <Image
        source={{ uri: getYouTubeThumbnailUrl(trailer.key) }}
        style={styles.trailerThumbnail}
        onLoad={() => setImageLoaded(true)}
      />
      {!imageLoaded && (
        <View style={[styles.trailerThumbnail, styles.trailerThumbnailLoading]} />
      )}
      {/* Overlay */}
      <View style={styles.trailerOverlay}>
        {/* Play button */}
        <View style={styles.playButton}>
          <PlayIcon />
        </View>
      </View>
    </Pressable>
  );
}

// Trailer player component
function TrailerPlayer({
  trailer,
  isPlaying,
  onStateChange,
  playerWidth,
  playerHeight,
}: {
  trailer: MovieTrailer;
  isPlaying: boolean;
  onStateChange: (state: string) => void;
  playerWidth: number;
  playerHeight: number;
}) {
  if (Platform.OS === 'web') {
    return (
      <View style={[styles.trailerPlayerContainer, { width: playerWidth, height: playerHeight }]}>
        <iframe
          width={playerWidth}
          height={playerHeight}
          src={`https://www.youtube.com/embed/${trailer.key}${isPlaying ? '?autoplay=1' : ''}`}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ borderRadius: 12 }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.trailerPlayerContainer, { width: playerWidth, height: playerHeight }]}>
      <YoutubePlayer
        height={playerHeight}
        width={playerWidth}
        videoId={trailer.key}
        play={isPlaying}
        onChangeState={onStateChange}
        webViewProps={{
          allowsInlineMediaPlayback: true,
        }}
      />
    </View>
  );
}

export function MovieDetailModal() {
  const { selectedMovie, isVisible, closeMovieDetail, initialWatchlistStatus } = useMovieDetail();
  const { user, isGuest } = useAuth();
  const { startQuickRank } = useQuickRank();
  const { markMovieAsKnown } = useAppStore();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { containerWidth, isConstrained, isDesktop, isWeb, height: appHeight } = useAppDimensions();
  const isDesktopWeb = isDesktop && isWeb;
  const { showAlert } = useAlert();
  const modalWidth = isDesktopWeb ? Math.min(600, containerWidth) : containerWidth;
  const playerWidth = modalWidth - 40;
  const playerHeight = (playerWidth * 9) / 16;
  const posterWidth = modalWidth * 0.45;
  const posterDisplayHeight = posterWidth * 1.5;

  // Calculate modal height dynamically
  // On constrained web (tablet), use the phone frame's content area height
  // On desktop web, use window height directly
  const effectiveHeight = isDesktopWeb ? windowHeight : isConstrained ? Math.round(appHeight * 0.9) : windowHeight;
  const modalHeight = effectiveHeight * 0.85;

  // Animation values
  const translateY = useSharedValue(modalHeight);
  const overlayOpacity = useSharedValue(0);

  // State
  const [loading, setLoading] = useState(true);
  const [runtime, setRuntime] = useState<string | null>(null);
  const [certification, setCertification] = useState<string | null>(null);
  const [overview, setOverview] = useState<string | null>(null);
  const [watchProviders, setWatchProviders] = useState<WatchProviders | null>(null);
  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const [director, setDirector] = useState<string | null>(null);
  const [cast, setCast] = useState<CastMember[]>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [watchlistStatusChecked, setWatchlistStatusChecked] = useState(false);
  const [isOnWatchlist, setIsOnWatchlist] = useState(false);

  // Trailer state
  const [trailer, setTrailer] = useState<MovieTrailer | null>(null);
  const [trailerLoading, setTrailerLoading] = useState(true);
  const [isTrailerPlaying, setIsTrailerPlaying] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);

  // Modal visibility state (separate from isVisible to allow close animation)
  const [modalVisible, setModalVisible] = useState(false);

  // Load movie details
  useEffect(() => {
    if (!selectedMovie || !isVisible) return;

    setLoading(true);
    setTrailerLoading(true);
    setOverviewExpanded(false);
    setIsTrailerPlaying(false);
    setShowPlayer(false);
    setTrailer(null);

    // Use initial status if provided, otherwise reset
    if (initialWatchlistStatus !== null) {
      setIsOnWatchlist(initialWatchlistStatus);
      setWatchlistStatusChecked(true);
    } else {
      setIsOnWatchlist(false);
      setWatchlistStatusChecked(false);
    }

    const loadDetails = async () => {
      try {
        const tmdbId = selectedMovie.tmdbId || parseInt(selectedMovie.id.replace('tmdb-', ''));

        // Load movie details and trailer in parallel
        const [details, trailerData] = await Promise.all([
          getFullMovieDetails(tmdbId, 'US'),
          getMovieTrailer(tmdbId),
        ]);

        setRuntime(formatRuntime(details.runtime));
        setCertification(details.certification);
        setOverview(details.overview || selectedMovie.overview || null);
        setWatchProviders(details.watchProviders);
        setDirector(details.director || selectedMovie.directorName || null);
        setCast(details.cast);
        setTrailer(trailerData);
      } catch (error) {
        console.error('[MovieDetail] Failed to load details:', error);
        setOverview(selectedMovie.overview || null);
        setWatchProviders(null);
        setDirector(selectedMovie.directorName || null);
        setCast([]);
        setTrailer(null);
      } finally {
        setLoading(false);
        setTrailerLoading(false);
      }
    };

    // Check if movie is on watchlist (skip if we already know from context)
    const checkWatchlist = async () => {
      if (initialWatchlistStatus !== null) {
        // Already have the status from context
        return;
      }
      if (!user?.id || isGuest) {
        setWatchlistStatusChecked(true);
        return;
      }
      try {
        const onWatchlist = await watchlistService.isInWatchlist(user.id, selectedMovie.id);
        setIsOnWatchlist(onWatchlist);
      } catch (error) {
        console.error('[MovieDetail] Failed to check watchlist:', error);
      } finally {
        setWatchlistStatusChecked(true);
      }
    };

    loadDetails();
    checkWatchlist();
  }, [selectedMovie, isVisible, user?.id, isGuest, initialWatchlistStatus]);

  // Stop trailer when modal closes
  useEffect(() => {
    if (!isVisible) {
      setIsTrailerPlaying(false);
      setShowPlayer(false);
    }
  }, [isVisible]);

  // Animation: open/close - simple slide up without bounce
  useEffect(() => {
    if (isVisible) {
      setModalVisible(true);
      translateY.value = withTiming(0, { duration: 300 });
      overlayOpacity.value = withTiming(1, { duration: 200 });
    } else {
      translateY.value = withTiming(modalHeight, { duration: 250 });
      overlayOpacity.value = withTiming(0, { duration: 200 });
      // Delay hiding the Modal until animation completes
      const timer = setTimeout(() => setModalVisible(false), 250);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  // Swipe to dismiss gesture
  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY > modalHeight * 0.25 || event.velocityY > 500) {
        translateY.value = withTiming(modalHeight, { duration: 200 }, () => {
          runOnJS(closeMovieDetail)();
        });
        overlayOpacity.value = withTiming(0, { duration: 200 });
      } else {
        translateY.value = withTiming(0, { duration: 200 });
      }
    });

  // Animated styles
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const modalStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Handle watchlist add/remove
  const handleWatchlistToggle = useCallback(async () => {
    if (!selectedMovie || !user?.id || isGuest) {
      if (isGuest) {
        showAlert('sign in required', 'create an account to manage your watchlist');
      }
      return;
    }

    setWatchlistLoading(true);
    try {
      if (isOnWatchlist) {
        // Remove from watchlist
        const result = await watchlistService.removeFromWatchlist(user.id, selectedMovie.id);
        if (result.success) {
          setIsOnWatchlist(false);
        } else {
          showAlert('error', result.error || 'failed to remove from watchlist');
        }
      } else {
        // Add to watchlist
        const result = await watchlistService.addToWatchlist(
          user.id,
          selectedMovie.id,
          'manual'
        );

        if (result.success) {
          setIsOnWatchlist(true);
        } else if (result.error?.includes('already')) {
          setIsOnWatchlist(true);
        } else {
          showAlert('error', result.error || 'failed to add to watchlist');
        }
      }
    } catch (error) {
      console.error('[MovieDetail] Watchlist toggle error:', error);
      showAlert('error', 'something went wrong');
    } finally {
      setWatchlistLoading(false);
    }
  }, [selectedMovie, user?.id, isGuest, isOnWatchlist]);

  // Handle trailer play
  const handlePlayTrailer = useCallback(() => {
    setShowPlayer(true);
    setIsTrailerPlaying(true);
  }, []);

  // Handle trailer state change
  const handleTrailerStateChange = useCallback((state: string) => {
    if (state === 'ended') {
      setIsTrailerPlaying(false);
    }
  }, []);

  // Handle rank it now
  const handleRankPress = useCallback(() => {
    if (!selectedMovie) return;

    markMovieAsKnown(selectedMovie.id, {
      title: selectedMovie.title,
      year: selectedMovie.year,
      posterUrl: selectedMovie.posterUrl || undefined,
      genres: selectedMovie.genres,
      posterColor: selectedMovie.posterColor,
      overview: selectedMovie.overview || '',
      voteAverage: selectedMovie.voteAverage,
      voteCount: selectedMovie.voteCount,
      directorName: selectedMovie.directorName,
      directorId: selectedMovie.directorId,
      collectionId: selectedMovie.collectionId,
      collectionName: selectedMovie.collectionName,
      certification: selectedMovie.certification,
      tmdbId: selectedMovie.tmdbId,
      posterPath: selectedMovie.posterPath ?? undefined,
    });

    startQuickRank({
      id: selectedMovie.id,
      title: selectedMovie.title,
      year: selectedMovie.year,
      posterUrl: selectedMovie.posterUrl || null,
    });

    closeMovieDetail();
  }, [selectedMovie, markMovieAsKnown, startQuickRank, closeMovieDetail]);

  // Handle Letterboxd button
  const handleLetterboxdPress = useCallback(() => {
    if (selectedMovie) {
      openLetterboxd(selectedMovie.title, selectedMovie.year);
    }
  }, [selectedMovie]);

  if (!selectedMovie) return null;

  const hasWatchProviders =
    watchProviders &&
    (watchProviders.stream.length > 0 ||
      watchProviders.rent.length > 0 ||
      watchProviders.buy.length > 0);

  // Meta line: year, runtime, certification
  const metaParts = [selectedMovie.year.toString()];
  if (runtime) metaParts.push(runtime);
  if (certification) metaParts.push(certification);
  const metaLine = metaParts.join(' · ');

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      onRequestClose={closeMovieDetail}
    >
      <View style={styles.modalRoot}>
        {/* Overlay */}
        <Animated.View style={[styles.overlay, overlayStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeMovieDetail} />
        </Animated.View>

        {/* Modal Content */}
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.modal, { height: modalHeight }, modalStyle]}>
          {/* Drag handle */}
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          {/* Close button */}
          <Pressable style={styles.closeButton} onPress={closeMovieDetail}>
            <CloseIcon color={colors.textMuted} />
          </Pressable>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
            showsVerticalScrollIndicator={false}
          >
            {/* Poster */}
            <View style={styles.posterContainer}>
              {selectedMovie.posterUrl ? (
                <Image
                  source={{ uri: selectedMovie.posterUrl }}
                  style={[styles.poster, { width: posterWidth, height: posterDisplayHeight }]}
                />
              ) : (
                <View style={[styles.poster, styles.posterFallback, { width: posterWidth, height: posterDisplayHeight }]}>
                  <Text style={styles.posterFallbackText}>
                    {selectedMovie.title.slice(0, 2)}
                  </Text>
                </View>
              )}
            </View>

            {/* Title & Meta */}
            <Text style={styles.title}>{selectedMovie.title}</Text>
            <Text style={styles.meta}>{metaLine}</Text>

            {/* Rank It Now Button */}
            <Pressable style={styles.rankButton} onPress={handleRankPress}>
              <Text style={styles.rankButtonText}>rank it now</Text>
            </Pressable>

            {/* Watchlist Button */}
            <Pressable
              style={[
                styles.watchlistButton,
                watchlistStatusChecked && isOnWatchlist && styles.watchlistButtonRemove,
                (watchlistLoading || !watchlistStatusChecked) && styles.watchlistButtonDisabled,
              ]}
              onPress={handleWatchlistToggle}
              disabled={watchlistLoading || !watchlistStatusChecked}
            >
              {watchlistLoading || !watchlistStatusChecked ? (
                <ActivityIndicator size="small" color={colors.textPrimary} />
              ) : (
                <>
                  <BookmarkIcon color={colors.textPrimary} filled={isOnWatchlist} />
                  <Text style={[styles.watchlistButtonText, isOnWatchlist && styles.watchlistButtonTextRemove]}>
                    {isOnWatchlist ? 'remove from watchlist' : '+ watchlist'}
                  </Text>
                </>
              )}
            </Pressable>

            {/* Letterboxd Button */}
            <Pressable style={styles.letterboxdButton} onPress={handleLetterboxdPress}>
              <Text style={styles.letterboxdButtonText}>log on letterboxd</Text>
            </Pressable>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Director & Cast */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>DIRECTOR & CAST</Text>

              {loading ? (
                <ActivityIndicator size="small" color={colors.textMuted} style={{ marginTop: 8 }} />
              ) : (
                <>
                  {director && (
                    <View style={styles.creditRow}>
                      <Text style={styles.creditLabel}>directed by</Text>
                      <Text style={styles.creditName}>{director}</Text>
                    </View>
                  )}

                  {cast.length > 0 && (
                    <View style={styles.castContainer}>
                      <Text style={styles.creditLabel}>starring</Text>
                      <Text style={styles.castText}>
                        {cast.map(person => person.name).join(', ')}
                      </Text>
                    </View>
                  )}

                  {!director && cast.length === 0 && (
                    <Text style={styles.noDataText}>no cast information available</Text>
                  )}
                </>
              )}
            </View>

            {/* Divider */}
            <View style={styles.divider} />

            {/* About */}
            {overview && (
              <>
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>ABOUT</Text>
                  <Text
                    style={styles.overviewText}
                    numberOfLines={overviewExpanded ? undefined : 3}
                  >
                    {overview}
                  </Text>
                  {overview.length > 150 && !overviewExpanded && (
                    <Pressable onPress={() => setOverviewExpanded(true)}>
                      <Text style={styles.readMoreText}>read more</Text>
                    </Pressable>
                  )}
                </View>
                <View style={styles.divider} />
              </>
            )}

            {/* Trailer - only show if trailer exists */}
            {!trailerLoading && trailer && (
              <>
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>TRAILER</Text>

                  {showPlayer ? (
                    <TrailerPlayer
                      trailer={trailer}
                      isPlaying={isTrailerPlaying}
                      onStateChange={handleTrailerStateChange}
                      playerWidth={playerWidth}
                      playerHeight={playerHeight}
                    />
                  ) : (
                    <TrailerThumbnail
                      trailer={trailer}
                      onPlay={handlePlayTrailer}
                      playerWidth={playerWidth}
                      playerHeight={playerHeight}
                    />
                  )}

                </View>
                <View style={styles.divider} />
              </>
            )}

            {/* Trailer loading skeleton */}
            {trailerLoading && (
              <>
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>TRAILER</Text>
                  <View style={[styles.trailerSkeleton, { width: playerWidth, height: playerHeight }]}>
                    <ActivityIndicator size="small" color={colors.textMuted} />
                  </View>
                </View>
                <View style={styles.divider} />
              </>
            )}

            {/* Where to Watch */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>WHERE TO WATCH</Text>
              {loading ? (
                <ActivityIndicator size="small" color={colors.textMuted} style={{ marginTop: 12 }} />
              ) : hasWatchProviders ? (
                <>
                  <ProviderSection
                    title="stream"
                    providers={watchProviders!.stream}
                    link={watchProviders!.link}
                  />
                  <ProviderSection
                    title="rent"
                    providers={watchProviders!.rent}
                    link={watchProviders!.link}
                  />
                  <ProviderSection
                    title="buy"
                    providers={watchProviders!.buy}
                    link={watchProviders!.link}
                  />
                </>
              ) : (
                <Text style={styles.noProvidersText}>
                  not available for streaming in your region
                </Text>
              )}
            </View>

          </ScrollView>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modal: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: borderRadius.xxl,
    borderTopRightRadius: borderRadius.xxl,
    ...(Platform.OS === 'web' ? {
      maxWidth: 600,
      alignSelf: 'center' as const,
      width: '100%' as any,
    } : {}),
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 16,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
  },
  posterContainer: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  poster: {
    borderRadius: 12,
    ...shadows.lg,
  },
  posterFallback: {
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  posterFallbackText: {
    ...typography.h1,
    color: colors.textMuted,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  meta: {
    ...typography.caption,
    color: '#A0A0A5',
    textAlign: 'center',
    marginBottom: 20,
  },
  rankButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginBottom: 8,
  },
  rankButtonText: {
    ...typography.captionMedium,
    color: colors.background,
    fontWeight: '700',
  },
  watchlistButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginBottom: 8,
  },
  watchlistButtonRemove: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  watchlistButtonDisabled: {
    opacity: 0.7,
  },
  watchlistButtonText: {
    ...typography.captionMedium,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  watchlistButtonTextRemove: {
    color: colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  section: {
    marginBottom: 4,
  },
  sectionTitle: {
    ...typography.tiny,
    color: colors.textMuted,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 12,
  },
  creditRow: {
    marginBottom: 12,
  },
  creditLabel: {
    ...typography.tiny,
    color: colors.textMuted,
    marginBottom: 4,
  },
  creditName: {
    ...typography.bodyMedium,
    color: colors.accent,
  },
  castContainer: {
    marginTop: 4,
  },
  castText: {
    ...typography.caption,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  noDataText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  overviewText: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  readMoreText: {
    ...typography.caption,
    color: colors.accent,
    marginTop: 8,
  },

  // Trailer styles
  trailerThumbnailContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  trailerThumbnail: {
    width: '100%',
    height: '100%',
  },
  trailerThumbnailLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: colors.border,
  },
  trailerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 4, // Offset play icon to center visually
  },
  trailerPlayerContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  trailerSkeleton: {
    borderRadius: borderRadius.lg,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Provider styles
  providerSection: {
    marginTop: 12,
  },
  providerSectionTitle: {
    ...typography.tiny,
    color: colors.textMuted,
    marginBottom: 8,
  },
  providerRow: {
    flexDirection: 'row',
    gap: 12,
  },
  providerLogo: {
    width: 40,
    height: 40,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  providerImage: {
    width: '100%',
    height: '100%',
  },
  noProvidersText: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
  },

  // Letterboxd button
  letterboxdButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 12,
    backgroundColor: '#1E2B1E',
    marginTop: spacing.sm,
  },
  letterboxdButtonText: {
    ...typography.captionMedium,
    color: '#00D735',
    fontWeight: '600',
  },
});

export default MovieDetailModal;
