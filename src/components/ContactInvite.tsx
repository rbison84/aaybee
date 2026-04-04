import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  FlatList,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useAuth } from '../contexts/AuthContext';
import { contactService, AppContact, MatchedUser } from '../services/contactService';
import { friendService } from '../services/friendService';
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';

interface ContactInviteProps {
  onClose: () => void;
}

interface ContactRow {
  type: 'matched' | 'invite';
  name: string;
  matchedUser?: MatchedUser;
  phone?: string;
}

export function ContactInvite({ onClose }: ContactInviteProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<AppContact[]>([]);
  const [matchedUsers, setMatchedUsers] = useState<MatchedUser[]>([]);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [sentPhones, setSentPhones] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    setLoading(true);
    const contactList = await contactService.getContacts();

    if (contactList.length === 0) {
      setPermissionDenied(true);
      setLoading(false);
      return;
    }

    setContacts(contactList);

    // Collect all emails for matching
    const allEmails = contactList.flatMap(c => c.emails);
    const matched = await contactService.findExistingUsers(allEmails);
    setMatchedUsers(matched);
    setLoading(false);
  };

  const rows = useMemo((): ContactRow[] => {
    const matchedEmails = new Set(matchedUsers.map(u => u.email));
    const result: ContactRow[] = [];

    // Matched users first
    for (const contact of contacts) {
      const matchedEmail = contact.emails.find(e => matchedEmails.has(e));
      if (matchedEmail) {
        const matchedUser = matchedUsers.find(u => u.email === matchedEmail);
        if (matchedUser && matchedUser.id !== user?.id) {
          result.push({ type: 'matched', name: contact.name, matchedUser });
        }
      }
    }

    // Then invitable contacts (not matched)
    for (const contact of contacts) {
      const isMatched = contact.emails.some(e => matchedEmails.has(e));
      if (!isMatched && contact.phones.length > 0) {
        result.push({ type: 'invite', name: contact.name, phone: contact.phones[0] });
      }
    }

    return result;
  }, [contacts, matchedUsers, user?.id]);

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r => r.name.toLowerCase().includes(q));
  }, [rows, search]);

  const handleAddFriend = async (userId: string) => {
    const result = await friendService.sendFriendRequest(userId);
    if (result.success) {
      setSentIds(prev => new Set(prev).add(userId));
    }
  };

  const handleInvite = async (phone: string) => {
    const displayName = user?.user_metadata?.display_name || 'A friend';
    await contactService.sendSmsInvite(phone, displayName);
    setSentPhones(prev => new Set(prev).add(phone));
  };

  const renderRow = ({ item }: { item: ContactRow }) => (
    <Animated.View entering={FadeIn.duration(200)} style={styles.row}>
      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
        {item.type === 'matched' && (
          <Text style={styles.rowBadge}>on aaybee</Text>
        )}
      </View>

      {item.type === 'matched' && item.matchedUser && (
        <Pressable
          style={[styles.rowButton, sentIds.has(item.matchedUser.id) && styles.rowButtonSent]}
          onPress={() => handleAddFriend(item.matchedUser!.id)}
          disabled={sentIds.has(item.matchedUser.id)}
        >
          <Text style={[styles.rowButtonText, sentIds.has(item.matchedUser.id) && styles.rowButtonTextSent]}>
            {sentIds.has(item.matchedUser.id) ? 'sent' : 'add friend'}
          </Text>
        </Pressable>
      )}

      {item.type === 'invite' && item.phone && (
        <Pressable
          style={[styles.rowButton, styles.rowButtonInvite, sentPhones.has(item.phone) && styles.rowButtonSent]}
          onPress={() => handleInvite(item.phone!)}
          disabled={sentPhones.has(item.phone)}
        >
          <Text style={[styles.rowButtonText, sentPhones.has(item.phone) && styles.rowButtonTextSent]}>
            {sentPhones.has(item.phone) ? 'invited' : 'invite'}
          </Text>
        </Pressable>
      )}
    </Animated.View>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>contact invite is available on mobile</Text>
        <Pressable style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>close</Text>
        </Pressable>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={[styles.emptyText, { marginTop: spacing.md }]}>reading contacts...</Text>
      </View>
    );
  }

  if (permissionDenied) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>allow contacts access to find friends on aaybee</Text>
        <Pressable style={styles.retryButton} onPress={loadContacts}>
          <Text style={styles.retryButtonText}>allow contacts</Text>
        </Pressable>
        <Pressable style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>not now</Text>
        </Pressable>
      </View>
    );
  }

  const matchedCount = rows.filter(r => r.type === 'matched').length;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>find friends</Text>

      <TextInput
        style={styles.searchInput}
        placeholder="search contacts..."
        placeholderTextColor={colors.textMuted}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {matchedCount > 0 && (
        <Text style={styles.sectionLabel}>
          {matchedCount} {matchedCount === 1 ? 'friend' : 'friends'} already on aaybee
        </Text>
      )}

      <FlatList
        data={filteredRows}
        keyExtractor={(item, i) => `${item.name}-${i}`}
        renderItem={renderRow}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      <Pressable style={styles.closeButton} onPress={onClose}>
        <Text style={styles.closeButtonText}>done</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.accent,
    marginBottom: spacing.sm,
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowName: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  rowBadge: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: '600',
  },
  rowButton: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
  },
  rowButtonInvite: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowButtonSent: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowButtonText: {
    ...typography.caption,
    color: colors.background,
    fontWeight: '600',
  },
  rowButtonTextSent: {
    color: colors.textMuted,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
  retryButton: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    alignSelf: 'center',
    marginTop: spacing.lg,
  },
  retryButtonText: {
    ...typography.bodyMedium,
    color: colors.background,
    fontWeight: '700',
  },
  closeButton: {
    paddingVertical: spacing.md,
    alignSelf: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  closeButtonText: {
    ...typography.body,
    color: colors.textMuted,
  },
});
