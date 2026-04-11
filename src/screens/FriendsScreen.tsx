// ============================================
// Friends Screen — SameGoat-style layout
// Two tabs: Friends | Crews
// Requires sign-in (parent gates access)
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useAuth } from '../contexts/AuthContext';
import { friendService, FriendWithProfile, FriendRequest, UserSearchResult } from '../services/friendService';
import { crewService, Crew, CrewMember } from '../services/crewService';
import { challengeService } from '../services/challengeService';
import { QRCode } from '../components/QRCode';
import { ContactInvite } from '../components/ContactInvite';
import { TasteRadar } from '../components/TasteRadar';
import { computeTasteAxes } from '../utils/tasteAxes';
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';

type TabType = 'friends' | 'crews';

interface FriendsScreenProps {
  onChallenge?: (friendId: string, friendName: string) => void;
  onViewCrew?: (crewId: string) => void;
}

export function FriendsScreen({ onChallenge, onViewCrew }: FriendsScreenProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('friends');

  // Friends state
  const [friends, setFriends] = useState<FriendWithProfile[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const [expandedFriendId, setExpandedFriendId] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  // Crews state
  const [crews, setCrews] = useState<Crew[]>([]);
  const [crewsLoading, setCrewsLoading] = useState(false);
  const [showCreateCrew, setShowCreateCrew] = useState(false);
  const [showJoinCrew, setShowJoinCrew] = useState(false);
  const [newCrewName, setNewCrewName] = useState('');
  const [joinCrewCode, setJoinCrewCode] = useState('');
  const [crewError, setCrewError] = useState('');
  const [creatingCrew, setCreatingCrew] = useState(false);

  // Load friends
  useEffect(() => {
    if (!user?.id) return;
    setLoading(true);
    Promise.all([
      friendService.getFriends(user.id),
      friendService.getPendingRequests(user.id),
    ]).then(([friendsData, requestsData]) => {
      setFriends(friendsData);
      setFriendRequests(requestsData);
      setLoading(false);
    });
  }, [user?.id]);

  // Load crews
  useEffect(() => {
    if (!user?.id || activeTab !== 'crews') return;
    setCrewsLoading(true);
    crewService.getMyCrews(user.id).then((data) => {
      setCrews(data);
      setCrewsLoading(false);
    });
  }, [user?.id, activeTab]);

  // Search
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (!user?.id || query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const results = await friendService.searchUsers(query, user.id);
    setSearchResults(results);
    setSearching(false);
  }, [user?.id]);

  const handleAddFriend = useCallback(async (targetId: string) => {
    setAdding(targetId);
    await friendService.sendFriendRequest(targetId);
    handleSearch(searchQuery);
    setAdding(null);
  }, [searchQuery, handleSearch]);

  const handleAcceptRequest = useCallback(async (requestId: string) => {
    await friendService.acceptFriendRequest(requestId);
    if (user?.id) {
      const [f, r] = await Promise.all([
        friendService.getFriends(user.id),
        friendService.getPendingRequests(user.id),
      ]);
      setFriends(f);
      setFriendRequests(r);
    }
  }, [user?.id]);

  const handleRejectRequest = useCallback(async (requestId: string) => {
    await friendService.rejectFriendRequest(requestId);
    setFriendRequests(prev => prev.filter(r => r.id !== requestId));
  }, []);

  const handleRemoveFriend = useCallback(async (friendId: string) => {
    if (confirmRemove !== friendId) {
      setConfirmRemove(friendId);
      return;
    }
    setRemoving(friendId);
    await friendService.removeFriend(friendId);
    setFriends(prev => prev.filter(f => f.friend_id !== friendId));
    setRemoving(null);
    setConfirmRemove(null);
  }, [confirmRemove]);

  // Crews
  const handleCreateCrew = useCallback(async () => {
    if (!user?.id || !newCrewName.trim()) return;
    setCreatingCrew(true);
    setCrewError('');
    const { crew, error } = await crewService.createCrew(user.id, newCrewName.trim());
    if (error) {
      setCrewError(error);
    } else if (crew) {
      setCrews(prev => [...prev, crew]);
      setNewCrewName('');
      setShowCreateCrew(false);
    }
    setCreatingCrew(false);
  }, [user?.id, newCrewName]);

  const handleJoinCrew = useCallback(async () => {
    if (!user?.id || !joinCrewCode.trim()) return;
    setCreatingCrew(true);
    setCrewError('');
    const { crew, error } = await crewService.joinCrew(user.id, joinCrewCode.trim());
    if (error) {
      setCrewError(error);
    } else if (crew) {
      setCrews(prev => [...prev, crew]);
      setJoinCrewCode('');
      setShowJoinCrew(false);
    }
    setCreatingCrew(false);
  }, [user?.id, joinCrewCode]);

  if (!user?.id) return null;

  const renderFriendsTab = () => (
    <View style={styles.tabContent}>
      {/* Controls row */}
      <View style={styles.controlsRow}>
        <Pressable onPress={() => setShowQr(!showQr)}>
          <Text style={[styles.controlText, showQr && styles.controlTextActive]}>QR</Text>
        </Pressable>
        {Platform.OS !== 'web' && (
          <Pressable onPress={() => setShowContacts(!showContacts)}>
            <Text style={styles.controlText}>CONTACTS</Text>
          </Pressable>
        )}
        <Pressable onPress={() => {
          setSearchMode(!searchMode);
          if (searchMode) { setSearchQuery(''); setSearchResults([]); }
        }}>
          <Text style={[styles.controlText, searchMode && styles.controlTextActive]}>
            {searchMode ? 'DONE' : '+ ADD'}
          </Text>
        </Pressable>
      </View>

      {/* QR Code */}
      {showQr && (
        <Animated.View entering={FadeIn.duration(200)} style={styles.qrSection}>
          <QRCode
            value={`https://aaybee.netlify.app/connect/${user.id}`}
            size={140}
            backgroundColor="transparent"
            color="#FFFFFF"
          />
          <Text style={styles.qrHint}>FRIENDS SCAN THIS TO CONNECT WITH YOU</Text>
        </Animated.View>
      )}

      {/* Contact invite */}
      {showContacts && (
        <Animated.View entering={FadeIn.duration(200)} style={{ maxHeight: 320 }}>
          <ContactInvite onClose={() => setShowContacts(false)} />
        </Animated.View>
      )}

      {/* Search */}
      {searchMode && (
        <Animated.View entering={FadeIn.duration(200)}>
          <TextInput
            style={styles.searchInput}
            placeholder="ENTER EXACT USERNAME..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={handleSearch}
            autoFocus
            autoCapitalize="none"
          />
          {searching && <Text style={styles.searchingText}>SEARCHING...</Text>}
          {searchResults.map(result => (
            <View key={result.id} style={styles.searchResultRow}>
              <Text style={styles.searchResultName}>{result.display_name}</Text>
              {result.is_friend ? (
                <Text style={styles.searchResultStatus}>FRIENDS</Text>
              ) : result.request_pending ? (
                <Text style={styles.searchResultStatus}>PENDING</Text>
              ) : (
                <Pressable
                  onPress={() => handleAddFriend(result.id)}
                  disabled={adding === result.id}
                >
                  <Text style={styles.addButtonText}>
                    {adding === result.id ? '...' : '+ ADD'}
                  </Text>
                </Pressable>
              )}
            </View>
          ))}
          {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
            <Text style={styles.emptyText}>NO USERS FOUND</Text>
          )}
        </Animated.View>
      )}

      {/* Pending requests */}
      {friendRequests.length > 0 && (
        <View style={styles.requestsSection}>
          <Text style={styles.sectionLabel}>INCOMING REQUESTS</Text>
          {friendRequests.map(req => (
            <View key={req.id} style={styles.requestRow}>
              <Text style={styles.requestName}>{req.from_user.display_name}</Text>
              <View style={styles.requestActions}>
                <Pressable style={styles.acceptButton} onPress={() => handleAcceptRequest(req.id)}>
                  <Text style={styles.acceptText}>ACCEPT</Text>
                </Pressable>
                <Pressable onPress={() => handleRejectRequest(req.id)}>
                  <Text style={styles.rejectText}>DECLINE</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Friends list */}
      {loading ? (
        <ActivityIndicator size="small" color={colors.textMuted} style={{ marginTop: spacing.xxl }} />
      ) : friends.length === 0 ? (
        <View style={styles.emptySection}>
          <Text style={styles.emptyTitle}>NO FRIENDS YET</Text>
          <Text style={styles.emptySubtitle}>TAP + ADD TO FIND PEOPLE</Text>
        </View>
      ) : (
        friends.map((friend, idx) => {
          const isTop = idx === 0;
          const isExpanded = expandedFriendId === friend.friend_id;
          return (
            <Pressable
              key={friend.friend_id}
              style={[styles.friendCard, isTop && styles.friendCardTop]}
              onPress={() => setExpandedFriendId(isExpanded ? null : friend.friend_id)}
            >
              <View style={styles.friendRow}>
                <View style={styles.friendLeft}>
                  <Text style={[styles.friendRank, isTop && styles.friendRankTop]}>#{idx + 1}</Text>
                  <Text style={[styles.friendName, isTop && styles.friendNameTop]} numberOfLines={1}>
                    {friend.friend.display_name}
                  </Text>
                </View>
                <View style={styles.friendRight}>
                  <Text style={[styles.friendPercent, isTop && styles.friendPercentTop]}>
                    {friend.taste_match ?? '--'}%
                  </Text>
                </View>
              </View>

              {/* Expanded actions */}
              {isExpanded && (
                <View style={styles.friendActions}>
                  {onChallenge && (
                    <Pressable
                      style={[styles.challengeButton, isTop && styles.challengeButtonTop]}
                      onPress={() => onChallenge(friend.friend_id, friend.friend.display_name)}
                    >
                      <Text style={[styles.challengeText, isTop && styles.challengeTextTop]}>CHALLENGE</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => handleRemoveFriend(friend.friend_id)}>
                    <Text style={styles.removeText}>
                      {removing === friend.friend_id ? '...' :
                       confirmRemove === friend.friend_id ? 'REMOVE?' : 'x'}
                    </Text>
                  </Pressable>
                </View>
              )}
            </Pressable>
          );
        })
      )}
    </View>
  );

  const renderCrewsTab = () => (
    <View style={styles.tabContent}>
      {/* Create / Join buttons */}
      <View style={styles.crewButtonsRow}>
        <Pressable
          style={styles.crewActionButton}
          onPress={() => { setShowCreateCrew(!showCreateCrew); setShowJoinCrew(false); setCrewError(''); }}
        >
          <Text style={styles.crewActionText}>{showCreateCrew ? 'CANCEL' : '+ CREATE'}</Text>
        </Pressable>
        <Pressable
          style={styles.crewActionButton}
          onPress={() => { setShowJoinCrew(!showJoinCrew); setShowCreateCrew(false); setCrewError(''); }}
        >
          <Text style={styles.crewActionText}>{showJoinCrew ? 'CANCEL' : 'JOIN'}</Text>
        </Pressable>
      </View>

      {/* Create form */}
      {showCreateCrew && (
        <Animated.View entering={FadeIn.duration(200)} style={styles.crewForm}>
          <TextInput
            style={styles.crewInput}
            placeholder="CREW NAME (E.G. ROOMMATES)"
            placeholderTextColor={colors.textMuted}
            value={newCrewName}
            onChangeText={setNewCrewName}
            maxLength={30}
            autoFocus
            onSubmitEditing={handleCreateCrew}
          />
          <Pressable
            style={[styles.crewSubmitButton, (!newCrewName.trim() || creatingCrew) && styles.crewSubmitDisabled]}
            onPress={handleCreateCrew}
            disabled={!newCrewName.trim() || creatingCrew}
          >
            <Text style={styles.crewSubmitText}>{creatingCrew ? '...' : 'CREATE CREW'}</Text>
          </Pressable>
          {!!crewError && <Text style={styles.crewErrorText}>{crewError}</Text>}
        </Animated.View>
      )}

      {/* Join form */}
      {showJoinCrew && (
        <Animated.View entering={FadeIn.duration(200)} style={styles.crewForm}>
          <TextInput
            style={[styles.crewInput, { textAlign: 'center', letterSpacing: 4 }]}
            placeholder="ENTER JOIN CODE"
            placeholderTextColor={colors.textMuted}
            value={joinCrewCode}
            onChangeText={(t) => setJoinCrewCode(t.toUpperCase())}
            maxLength={10}
            autoFocus
            autoCapitalize="characters"
            onSubmitEditing={handleJoinCrew}
          />
          <Pressable
            style={[styles.crewSubmitButton, (!joinCrewCode.trim() || creatingCrew) && styles.crewSubmitDisabled]}
            onPress={handleJoinCrew}
            disabled={!joinCrewCode.trim() || creatingCrew}
          >
            <Text style={styles.crewSubmitText}>{creatingCrew ? '...' : 'JOIN CREW'}</Text>
          </Pressable>
          {!!crewError && <Text style={styles.crewErrorText}>{crewError}</Text>}
        </Animated.View>
      )}

      {/* Crews list */}
      {crewsLoading ? (
        <ActivityIndicator size="small" color={colors.textMuted} style={{ marginTop: spacing.xxl }} />
      ) : crews.length === 0 ? (
        <View style={styles.emptySection}>
          <Text style={styles.emptyTitle}>NO CREWS YET</Text>
          <Text style={styles.emptySubtitle}>CREATE A CREW AND SHARE THE CODE WITH YOUR GROUP CHAT</Text>
        </View>
      ) : (
        crews.map((crew) => (
          <Pressable
            key={crew.id}
            style={styles.crewCard}
            onPress={() => onViewCrew?.(crew.id)}
          >
            <Text style={styles.crewName}>{crew.name.toUpperCase()}</Text>
            <Text style={styles.crewCode}>CODE: {crew.code}</Text>
          </Pressable>
        ))
      )}
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {/* Tabs */}
      <View style={styles.tabBar}>
        <Pressable style={[styles.tab, activeTab === 'friends' && styles.tabActive]} onPress={() => setActiveTab('friends')}>
          <Text style={[styles.tabText, activeTab === 'friends' && styles.tabTextActive]}>FRIENDS</Text>
        </Pressable>
        <Pressable style={[styles.tab, activeTab === 'crews' && styles.tabActive]} onPress={() => setActiveTab('crews')}>
          <Text style={[styles.tabText, activeTab === 'crews' && styles.tabTextActive]}>CREWS</Text>
        </Pressable>
      </View>

      {activeTab === 'friends' ? renderFriendsTab() : renderCrewsTab()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    marginBottom: spacing.xl,
    gap: 0,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    alignItems: 'center',
  },
  tabActive: {
    borderBottomColor: colors.accent,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  tabTextActive: {
    color: colors.textPrimary,
  },

  tabContent: {
    gap: spacing.md,
  },

  // Controls
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  controlText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  controlTextActive: {
    color: colors.textPrimary,
  },

  // QR
  qrSection: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
  },
  qrHint: {
    fontSize: 10,
    fontWeight: '400',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginTop: spacing.md,
    textTransform: 'uppercase',
  },

  // Search
  searchInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    fontSize: 12,
    color: colors.textPrimary,
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  searchingText: {
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  searchResultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  searchResultName: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  searchResultStatus: {
    fontSize: 10,
    fontWeight: '400',
    color: colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  addButtonText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Requests
  requestsSection: {
    marginTop: spacing.sm,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  requestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  requestName: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  requestActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  acceptButton: {
    backgroundColor: colors.textPrimary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  acceptText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.background,
    letterSpacing: 0.5,
  },
  rejectText: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textMuted,
    letterSpacing: 0.5,
    paddingVertical: spacing.xs,
  },

  // Empty
  emptySection: {
    alignItems: 'center',
    paddingTop: spacing.xxxl,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 0.5,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },

  // Friend card
  friendCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  friendCardTop: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  friendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  friendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  friendRank: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
    minWidth: 28,
  },
  friendRankTop: {
    color: colors.background,
  },
  friendName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    letterSpacing: 0.5,
    flex: 1,
  },
  friendNameTop: {
    color: colors.background,
  },
  friendRight: {
    alignItems: 'flex-end',
  },
  friendPercent: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  friendPercentTop: {
    color: colors.background,
  },
  friendActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  challengeButton: {
    backgroundColor: colors.textPrimary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  challengeButtonTop: {
    backgroundColor: colors.background,
  },
  challengeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.background,
    letterSpacing: 1,
  },
  challengeTextTop: {
    color: colors.accent,
  },
  removeText: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.error,
    letterSpacing: 0.5,
  },

  // Crews
  crewButtonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  crewActionButton: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  crewActionText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  crewForm: {
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  crewInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    fontSize: 12,
    color: colors.textPrimary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  crewSubmitButton: {
    backgroundColor: colors.textPrimary,
    borderRadius: borderRadius.xxl,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  crewSubmitDisabled: {
    opacity: 0.3,
  },
  crewSubmitText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.background,
    letterSpacing: 1,
  },
  crewErrorText: {
    fontSize: 10,
    color: colors.error,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  crewCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  crewName: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 1,
  },
  crewCode: {
    fontSize: 10,
    fontWeight: '400',
    color: colors.textMuted,
    letterSpacing: 1,
    marginTop: spacing.xs,
  },
});
