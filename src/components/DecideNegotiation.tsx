// ============================================
// Two-Person Decide — Negotiation Phase
// Proposer picks A or B, responder agrees/disagrees
// ============================================

import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Image,
  ActivityIndicator,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useHaptics } from '../hooks/useHaptics';
import { colors, spacing, borderRadius } from '../theme/cinematic';
import { BracketMovie } from '../utils/movieBracket';
import { NegotiationEntry } from '../services/decideSessionService';

interface DecideNegotiationProps {
  pair: { movieA: BracketMovie; movieB: BracketMovie };
  isProposer: boolean;
  pendingProposal?: NegotiationEntry; // Set when waiting for responder
  proposerName: string;
  responderName: string;
  roundLabel: string; // e.g. "ROUND 1 OF 3"
  onPropose: (movie: BracketMovie) => void;
  onRespond: (response: 'agree' | 'disagree') => void;
  loading?: boolean;
}

export function DecideNegotiation({
  pair,
  isProposer,
  pendingProposal,
  proposerName,
  responderName,
  roundLabel,
  onPropose,
  onRespond,
  loading,
}: DecideNegotiationProps) {
  const haptics = useHaptics();

  // Proposer view: pick A or B
  if (isProposer && !pendingProposal) {
    return (
      <View style={styles.container}>
        <Text style={styles.roundLabel}>{roundLabel}</Text>
        <Text style={styles.instruction}>YOUR PICK</Text>

        <View style={styles.cardsRow}>
          <Pressable
            style={styles.movieCard}
            onPress={() => { haptics.light(); onPropose(pair.movieA); }}
            disabled={loading}
          >
            <View style={styles.posterContainer}>
              {pair.movieA.posterUrl ? (
                <Image source={{ uri: pair.movieA.posterUrl }} style={styles.poster} resizeMode="cover" />
              ) : (
                <View style={[styles.poster, styles.posterPlaceholder]}>
                  <Text style={styles.placeholderText}>{pair.movieA.title.charAt(0)}</Text>
                </View>
              )}
            </View>
            <Text style={styles.movieTitle} numberOfLines={2}>{pair.movieA.title.toUpperCase()}</Text>
          </Pressable>

          <Pressable
            style={styles.movieCard}
            onPress={() => { haptics.light(); onPropose(pair.movieB); }}
            disabled={loading}
          >
            <View style={styles.posterContainer}>
              {pair.movieB.posterUrl ? (
                <Image source={{ uri: pair.movieB.posterUrl }} style={styles.poster} resizeMode="cover" />
              ) : (
                <View style={[styles.poster, styles.posterPlaceholder]}>
                  <Text style={styles.placeholderText}>{pair.movieB.title.charAt(0)}</Text>
                </View>
              )}
            </View>
            <Text style={styles.movieTitle} numberOfLines={2}>{pair.movieB.title.toUpperCase()}</Text>
          </Pressable>
        </View>

        {loading && <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />}
      </View>
    );
  }

  // Proposer waiting for response
  if (isProposer && pendingProposal) {
    return (
      <View style={styles.container}>
        <Text style={styles.roundLabel}>{roundLabel}</Text>
        <Text style={styles.instruction}>WAITING FOR {responderName.toUpperCase()}</Text>

        <Animated.View entering={FadeInDown.duration(300)} style={styles.waitingCard}>
          <Text style={styles.waitingText}>YOU PICKED</Text>
          <Text style={styles.waitingMovie}>{pendingProposal.proposedMovie.title.toUpperCase()}</Text>
          <Text style={styles.waitingSub}>{responderName.toUpperCase()} IS DECIDING...</Text>
        </Animated.View>
      </View>
    );
  }

  // Responder view: agree or disagree with proposer's pick
  if (!isProposer && pendingProposal) {
    return (
      <View style={styles.container}>
        <Text style={styles.roundLabel}>{roundLabel}</Text>
        <Text style={styles.instruction}>{proposerName.toUpperCase()} PICKED</Text>

        <Animated.View entering={FadeInDown.duration(300)} style={styles.proposalCard}>
          {pendingProposal.proposedMovie.posterUrl ? (
            <Image source={{ uri: pendingProposal.proposedMovie.posterUrl }} style={styles.proposalPoster} resizeMode="cover" />
          ) : (
            <View style={[styles.proposalPoster, styles.posterPlaceholder]}>
              <Text style={styles.placeholderText}>{pendingProposal.proposedMovie.title.charAt(0)}</Text>
            </View>
          )}
          <Text style={styles.proposalTitle}>{pendingProposal.proposedMovie.title.toUpperCase()}</Text>

          <View style={styles.responseButtons}>
            <Pressable
              style={styles.agreeButton}
              onPress={() => { haptics.success(); onRespond('agree'); }}
              disabled={loading}
            >
              <Text style={styles.agreeText}>AGREE</Text>
            </Pressable>
            <Pressable
              style={styles.disagreeButton}
              onPress={() => { haptics.light(); onRespond('disagree'); }}
              disabled={loading}
            >
              <Text style={styles.disagreeText}>DISAGREE</Text>
            </Pressable>
          </View>
        </Animated.View>

        {loading && <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />}
      </View>
    );
  }

  // Waiting state (responder, no pending proposal yet)
  return (
    <View style={styles.container}>
      <Text style={styles.roundLabel}>{roundLabel}</Text>
      <Text style={styles.instruction}>WAITING FOR {proposerName.toUpperCase()} TO PICK</Text>
      <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xxl }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  roundLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  instruction: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    flex: 1,
  },
  movieCard: {
    flex: 1,
    alignItems: 'center',
  },
  posterContainer: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  posterPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  placeholderText: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.textMuted,
  },
  movieTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.5,
    textAlign: 'center',
    paddingTop: spacing.sm,
    lineHeight: 16,
  },

  // Waiting state
  waitingCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xxl,
    padding: spacing.xxl,
    alignItems: 'center',
  },
  waitingText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 2,
    marginBottom: spacing.sm,
  },
  waitingMovie: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  waitingSub: {
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 1,
  },

  // Proposal card (responder view)
  proposalCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xxl,
    padding: spacing.xl,
    alignItems: 'center',
  },
  proposalPoster: {
    width: 160,
    height: 240,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
  },
  proposalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  responseButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  agreeButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.xxl,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  agreeText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: 2,
  },
  disagreeButton: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xxl,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  disagreeText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 2,
  },
});
