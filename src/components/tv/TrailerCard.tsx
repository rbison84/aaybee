import React, { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { StyleSheet, Text, View, Image, Pressable, Platform, ActivityIndicator } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Movie } from '../../types';
import { MovieTrailer } from '../../services/tmdb';
import { getYouTubeThumbnailUrl } from '../../services/tmdb';
import { useAppDimensions } from '../../contexts/DimensionsContext';
import { colors, spacing, typography, borderRadius } from '../../theme/cinematic';

let YoutubePlayer: any = null;
if (Platform.OS !== 'web') {
  try {
    YoutubePlayer = require('react-native-youtube-iframe').default;
  } catch {}
}

export interface TvItem {
  id: string;
  movie: Movie;
  trailer: MovieTrailer;
  channelId: string;
  contextLine: string;
  isRanked: boolean;
}

interface TrailerCardProps {
  item: TvItem;
  isActive: boolean;
  paused: boolean;
  itemHeight: number;
  onOpenDetail: (movie: Movie) => void;
  onTrailerEnd?: () => void;
  onAddWatchlist?: (movie: Movie) => void;
  onRankIt?: (movie: Movie) => void;
}

export function TrailerCard({ item, isActive, paused, itemHeight, onOpenDetail, onTrailerEnd, onAddWatchlist, onRankIt }: TrailerCardProps) {
  const { movie, trailer, contextLine, isRanked } = item;
  const { containerWidth } = useAppDimensions();

  const playerWidth = containerWidth;
  const playerHeight = Math.round(playerWidth * 9 / 16);

  const playing = isActive && !paused;

  return (
    <View style={[styles.container, { height: itemHeight }]}>
      <View style={styles.playerArea}>
        {/* Thumbnail — always rendered as base layer */}
        <View style={[styles.thumbnailContainer, { width: playerWidth, height: playerHeight }]}>
          <Image
            source={{ uri: getYouTubeThumbnailUrl(trailer.key) }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
          {!isActive && (
            <ActivityIndicator style={styles.loadingIndicator} color={colors.accent} />
          )}
        </View>

        {/* Player — layered on top (native only; web uses persistent player in TvScreen) */}
        {isActive && Platform.OS !== 'web' && YoutubePlayer && (
          <View style={[styles.playerOverlay, { width: playerWidth, height: playerHeight }]}>
            <NativeTrailerPlayer
              trailer={trailer}
              isActive={playing}
              playerWidth={playerWidth}
              playerHeight={playerHeight}
              onEnd={onTrailerEnd}
            />
          </View>
        )}
      </View>

      {/* Bottom overlay with movie info + action buttons */}
      <View style={styles.infoOverlay}>
        <View style={styles.gradient} />
        <View style={styles.infoRow}>
          {/* Left: poster + text (tappable to open detail) */}
          <Pressable style={styles.infoContent} onPress={() => onOpenDetail(movie)}>
            {movie.posterUrl ? (
              <Image
                source={{ uri: movie.posterUrl }}
                style={styles.posterThumb}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.posterThumb, { backgroundColor: movie.posterColor || colors.surface }]}>
                <Text style={styles.posterFallback}>{movie.title.slice(0, 2)}</Text>
              </View>
            )}
            <View style={styles.textArea}>
              <Text style={styles.movieTitle} numberOfLines={2}>
                {movie.title} <Text style={styles.movieYear}>({movie.year})</Text>
              </Text>
              <Text style={styles.contextLine} numberOfLines={1}>
                {contextLine}
              </Text>
            </View>
          </Pressable>

          {/* Right: action buttons — same height as poster (66px) */}
          <View style={styles.actionButtons}>
            <Pressable style={styles.actionBtn} onPress={() => onAddWatchlist?.(movie)}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                <Path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
              </Svg>
              <Text style={styles.actionBtnText}>watchlist</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, isRanked && styles.actionBtnDisabled]}
              onPress={isRanked ? undefined : () => onRankIt?.(movie)}
              disabled={isRanked}
            >
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                <Path d="M3 17l6-6 4 4 8-8" stroke={isRanked ? colors.textMuted : '#fff'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                <Path d="M17 7h4v4" stroke={isRanked ? colors.textMuted : '#fff'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
              <Text style={[styles.actionBtnText, isRanked && styles.actionBtnTextDisabled]}>
                {isRanked ? 'ranked' : 'rank it'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

/** Web: Persistent YouTube player — single iframe, switch videos via loadVideoById.
 *  Exported for use in TvScreen. */

// Load the YouTube IFrame API script once
let ytApiReady = false;
let ytApiPromise: Promise<void> | null = null;

function loadYTApi(): Promise<void> {
  if (ytApiReady) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise<void>((resolve) => {
    (window as any).onYouTubeIframeAPIReady = () => {
      ytApiReady = true;
      resolve();
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
  });

  return ytApiPromise;
}

// Unlock Safari's audio subsystem by playing a silent buffer
function unlockWebAudio() {
  try {
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    ctx.resume();
  } catch {}
}

let webAudioUnlocked = false;

export interface WebPersistentPlayerHandle {
  unmute: () => void;
}

export function isWebAudioUnlocked(): boolean {
  return webAudioUnlocked;
}

interface WebPersistentPlayerProps {
  videoKey: string;
  playerWidth: number;
  playerHeight: number;
  onEnd?: () => void;
}

export const WebPersistentPlayer = forwardRef<WebPersistentPlayerHandle, WebPersistentPlayerProps>(
  function WebPersistentPlayer({ videoKey, playerWidth, playerHeight, onEnd }, ref) {
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const playerRef = useRef<any>(null);
  const currentKeyRef = useRef(videoKey);
  const readyRef = useRef(false);

  useImperativeHandle(ref, () => ({
    unmute: () => {
      unlockWebAudio();
      webAudioUnlocked = true;
      const player = playerRef.current;
      if (player) {
        try {
          player.unMute();
          player.setVolume(100);
        } catch {}
      }
    },
  }), []);

  // Create the player once on mount
  useEffect(() => {
    let destroyed = false;

    const createPlayer = () => {
      if (destroyed) return;
      const YT = (window as any).YT;
      if (!YT?.Player) return;

      playerRef.current = new YT.Player('yt-persistent-player', {
        width: playerWidth,
        height: playerHeight,
        videoId: currentKeyRef.current,
        playerVars: {
          autoplay: 1,
          mute: 1,
          playsinline: 1,
          modestbranding: 1,
          rel: 0,
          controls: 0,
          disablekb: 1,
        },
        events: {
          onReady: (event: any) => {
            if (destroyed) return;
            readyRef.current = true;
            const player = event.target;
            player.mute();
            player.playVideo();
            // (YouTube controls are interactive — no pointer-events blocking needed)
          },
          onStateChange: (event: any) => {
            if (destroyed) return;
            // YT.PlayerState.ENDED === 0
            if (event.data === 0) {
              onEndRef.current?.();
            }
          },
        },
      });
    };

    loadYTApi().then(createPlayer);

    return () => {
      destroyed = true;
      readyRef.current = false;
      try { playerRef.current?.destroy(); } catch {}
      playerRef.current = null;
    };
  // Only create/destroy on mount/unmount — dimensions won't change mid-session
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When videoKey changes, load the new video on the existing player
  useEffect(() => {
    currentKeyRef.current = videoKey;
    const player = playerRef.current;
    if (!player || !readyRef.current) return;

    try {
      player.loadVideoById(videoKey);
      // loadVideoById auto-plays; it preserves mute state from the existing player
    } catch {}
  }, [videoKey]);

  return (
    <View style={{ width: playerWidth, height: playerHeight }}>
      <div
        id="yt-persistent-player"
        style={{ width: playerWidth, height: playerHeight, background: colors.background }}
      />
    </View>
  );
});


/** Native: react-native-youtube-iframe with onChangeState.
 *  Starts muted for autoplay, unmutes once playback begins. */
function NativeTrailerPlayer({
  trailer,
  isActive,
  playerWidth,
  playerHeight,
  onEnd,
}: {
  trailer: MovieTrailer;
  isActive: boolean;
  playerWidth: number;
  playerHeight: number;
  onEnd?: () => void;
}) {
  const [muted, setMuted] = useState(true);

  const handleStateChange = useCallback((state: string) => {
    if (state === 'playing') {
      setMuted(false);
    }
    if (state === 'ended') {
      onEnd?.();
    }
  }, [onEnd]);

  // Reset to muted when this card becomes active (new video)
  useEffect(() => {
    if (isActive) {
      setMuted(true);
    }
  }, [isActive, trailer.key]);

  return (
    <View style={{ width: playerWidth, height: playerHeight }}>
      <YoutubePlayer
        height={playerHeight}
        width={playerWidth}
        videoId={trailer.key}
        play={isActive}
        mute={muted}
        forceAndroidAutoplay={true}
        onChangeState={handleStateChange}
        webViewProps={{
          allowsInlineMediaPlayback: true,
          mediaPlaybackRequiresUserAction: false,
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        }}
        initialPlayerParams={{
          modestbranding: true,
          rel: false,
          preventFullScreen: true,
          controls: false,
          iv_load_policy: 3,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    justifyContent: 'center',
  },
  playerArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerOverlay: {
    position: 'absolute',
  },
  thumbnailContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  thumbnail: {
    ...StyleSheet.absoluteFillObject,
  },
  loadingIndicator: {
    position: 'absolute',
  },
  infoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    opacity: 0.9,
    ...(Platform.OS === 'web' ? {
      background: 'linear-gradient(transparent, rgba(19,17,28,0.9))',
    } as any : {
      backgroundColor: 'rgba(19,17,28,0.6)',
    }),
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    zIndex: 1,
  },
  infoContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  posterThumb: {
    width: 44,
    height: 66,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
  posterFallback: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 66,
  },
  textArea: {
    flex: 1,
    marginLeft: spacing.md,
  },
  movieTitle: {
    ...typography.h3,
    color: '#fff',
  },
  movieYear: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '400',
  },
  contextLine: {
    ...typography.caption,
    color: colors.accent,
    marginTop: 2,
  },
  actionButtons: {
    height: 66,
    justifyContent: 'space-between',
    marginLeft: spacing.md,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    gap: spacing.xs,
  },
  actionBtnDisabled: {
    backgroundColor: colors.accentSubtle,
  },
  actionBtnText: {
    ...typography.tiny,
    color: '#fff',
    fontWeight: '600',
  },
  actionBtnTextDisabled: {
    color: colors.textMuted,
  },
});
