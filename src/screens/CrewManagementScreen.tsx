import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet, Text, View, Pressable, ScrollView, TextInput, Share, Platform, ActivityIndicator,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { crewService, Crew, CrewMember } from '../services/crewService';
import { getDailyNumber } from '../data/dailyCategories';
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';

interface CrewManagementScreenProps {
  onClose: () => void;
}

export function CrewManagementScreen({ onClose }: CrewManagementScreenProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [crews, setCrews] = useState<Crew[]>([]);
  const [crewMembers, setCrewMembers] = useState<Map<string, CrewMember[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [crewName, setCrewName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null); // crew id that was copied
  const [confirmLeave, setConfirmLeave] = useState<string | null>(null); // crew id to confirm leave

  const dailyNumber = getDailyNumber();

  // Load crews and members
  const loadCrews = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const myCrews = await crewService.getMyCrews(user.id);
    setCrews(myCrews);

    const membersMap = new Map<string, CrewMember[]>();
    for (const crew of myCrews) {
      const members = await crewService.getCrewMembers(crew.id, dailyNumber);
      membersMap.set(crew.id, members);
    }
    setCrewMembers(membersMap);
    setLoading(false);
  }, [user?.id, dailyNumber]);

  useEffect(() => { loadCrews(); }, [loadCrews]);

  const handleCreate = async () => {
    if (!user?.id || !crewName.trim()) return;
    setCreating(true);
    setError(null);
    const { crew, error: err } = await crewService.createCrew(user.id, crewName.trim());
    if (crew) {
      setCrewName('');
      await loadCrews();
    }
    if (err) setError(err);
    setCreating(false);
  };

  const handleJoin = async () => {
    if (!user?.id || joinCode.length < 6) return;
    setJoining(true);
    setError(null);
    const { crew, error: err } = await crewService.joinCrew(user.id, joinCode);
    if (crew) {
      setJoinCode('');
      await loadCrews();
    }
    if (err) setError(err);
    setJoining(false);
  };

  const handleLeave = async (crewId: string) => {
    if (!user?.id) return;
    await crewService.leaveCrew(user.id, crewId);
    setConfirmLeave(null);
    await loadCrews();
  };

  const handleShareCode = async (crew: Crew) => {
    const message = `join my crew "${crew.name}" on aaybee! code: ${crew.code}\n\nhttps://aaybee.netlify.app/crew/${crew.code}`;
    try {
      if (Platform.OS === 'web' && navigator?.clipboard) {
        await navigator.clipboard.writeText(message);
        setCopied(crew.id);
        setTimeout(() => setCopied(null), 2000);
      } else {
        await Share.share({ message });
      }
    } catch {}
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, spacing.md) }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeText}>{'\u2715'}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>crews</Text>
        <View style={styles.closeButton} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Create Section */}
        <Animated.View entering={FadeInDown.delay(50)} style={styles.section}>
          <Text style={styles.sectionTitle}>create a crew</Text>
          <TextInput
            style={styles.input}
            placeholder="crew name"
            placeholderTextColor={colors.textMuted}
            value={crewName}
            onChangeText={setCrewName}
            maxLength={30}
          />
          <Pressable
            style={[styles.primaryButton, (!crewName.trim() || creating) && styles.buttonDisabled]}
            onPress={handleCreate}
            disabled={!crewName.trim() || creating}
          >
            <Text style={styles.primaryButtonText}>
              {creating ? '...' : 'create crew'}
            </Text>
          </Pressable>
        </Animated.View>

        {/* Join Section */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.section}>
          <Text style={styles.sectionTitle}>join a crew</Text>
          <TextInput
            style={styles.input}
            placeholder="enter code"
            placeholderTextColor={colors.textMuted}
            value={joinCode}
            onChangeText={t => setJoinCode(t.toUpperCase())}
            maxLength={6}
            autoCapitalize="characters"
          />
          <Pressable
            style={[styles.primaryButton, (joinCode.length < 6 || joining) && styles.buttonDisabled]}
            onPress={handleJoin}
            disabled={joinCode.length < 6 || joining}
          >
            <Text style={styles.primaryButtonText}>
              {joining ? '...' : 'join crew'}
            </Text>
          </Pressable>
        </Animated.View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        {/* Your Crews */}
        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
        ) : crews.length === 0 ? (
          <Animated.View entering={FadeIn} style={styles.emptyState}>
            <Text style={styles.emptyText}>no crews yet</Text>
            <Text style={styles.emptySubtext}>create one and invite friends to play daily together</Text>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeInDown.delay(150)}>
            <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>your crews</Text>
            {crews.map((crew) => {
              const members = crewMembers.get(crew.id) || [];
              const playedCount = members.filter(m => m.played_today).length;
              const isConfirming = confirmLeave === crew.id;
              const isCopied = copied === crew.id;

              return (
                <View key={crew.id} style={styles.crewCard}>
                  <View style={styles.crewCardHeader}>
                    <Text style={styles.crewName}>{crew.name}</Text>
                    <Text style={styles.crewStats}>{playedCount}/{members.length} played today</Text>
                  </View>

                  {/* Code */}
                  <View style={styles.codeRow}>
                    <Text style={styles.codeLabel}>code:</Text>
                    <Text style={styles.codeValue}>{crew.code}</Text>
                    <Pressable style={styles.shareCodeButton} onPress={() => handleShareCode(crew)}>
                      <Text style={styles.shareCodeText}>
                        {isCopied ? 'copied!' : 'share'}
                      </Text>
                    </Pressable>
                  </View>

                  {/* Members */}
                  <View style={styles.memberList}>
                    {members.map((member) => (
                      <View key={member.id} style={styles.memberRow}>
                        <Text style={styles.memberName}>{member.display_name}</Text>
                        <Text style={[styles.memberStatus, member.played_today && styles.memberPlayed]}>
                          {member.played_today ? 'played' : '\u2014'}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Leave */}
                  {isConfirming ? (
                    <View style={styles.confirmRow}>
                      <Text style={styles.confirmText}>leave {crew.name}?</Text>
                      <Pressable style={styles.confirmYes} onPress={() => handleLeave(crew.id)}>
                        <Text style={styles.confirmYesText}>leave</Text>
                      </Pressable>
                      <Pressable style={styles.confirmNo} onPress={() => setConfirmLeave(null)}>
                        <Text style={styles.confirmNoText}>cancel</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable style={styles.leaveButton} onPress={() => setConfirmLeave(crew.id)}>
                      <Text style={styles.leaveText}>leave crew</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

// STYLES - use the cinematic theme consistently
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingBottom: spacing.sm,
  },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  closeText: { ...typography.body, color: colors.textSecondary },
  headerTitle: { ...typography.captionMedium, color: colors.textMuted, textTransform: 'uppercase' as const, letterSpacing: 2 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  section: { marginTop: spacing.lg },
  sectionTitle: { ...typography.captionMedium, color: colors.textMuted, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: spacing.sm },
  input: {
    ...typography.body, color: colors.textPrimary, backgroundColor: colors.surface,
    borderRadius: borderRadius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm,
  },
  primaryButton: {
    backgroundColor: colors.accent, paddingVertical: spacing.md, borderRadius: borderRadius.lg, alignItems: 'center' as const,
  },
  primaryButtonText: { ...typography.bodyMedium, color: colors.background, fontWeight: '700' as const },
  buttonDisabled: { opacity: 0.4 },
  errorText: { ...typography.caption, color: colors.error, marginTop: spacing.sm, textAlign: 'center' as const },
  emptyState: { alignItems: 'center' as const, marginTop: spacing.xxxl },
  emptyText: { ...typography.bodyMedium, color: colors.textSecondary },
  emptySubtext: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs, textAlign: 'center' as const },
  crewCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  crewCardHeader: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, marginBottom: spacing.sm },
  crewName: { ...typography.bodyMedium, color: colors.textPrimary, fontWeight: '700' as const },
  crewStats: { ...typography.caption, color: colors.textMuted },
  codeRow: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: spacing.md },
  codeLabel: { ...typography.caption, color: colors.textMuted, marginRight: spacing.xs },
  codeValue: { ...typography.bodyMedium, color: colors.accent, letterSpacing: 2, marginRight: spacing.sm },
  shareCodeButton: { paddingVertical: 4, paddingHorizontal: spacing.sm, backgroundColor: colors.accentSubtle, borderRadius: borderRadius.sm },
  shareCodeText: { ...typography.caption, color: colors.accent, fontWeight: '600' as const },
  memberList: { marginBottom: spacing.md },
  memberRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, paddingVertical: spacing.xs },
  memberName: { ...typography.caption, color: colors.textPrimary },
  memberStatus: { ...typography.caption, color: colors.textMuted },
  memberPlayed: { color: colors.success },
  confirmRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  confirmText: { ...typography.caption, color: colors.error, flex: 1 },
  confirmYes: { paddingVertical: 4, paddingHorizontal: spacing.md, backgroundColor: colors.error, borderRadius: borderRadius.sm },
  confirmYesText: { ...typography.caption, color: '#fff', fontWeight: '600' as const },
  confirmNo: { paddingVertical: 4, paddingHorizontal: spacing.md },
  confirmNoText: { ...typography.caption, color: colors.textMuted },
  leaveButton: { alignSelf: 'flex-start' as const },
  leaveText: { ...typography.caption, color: colors.textMuted },
});
