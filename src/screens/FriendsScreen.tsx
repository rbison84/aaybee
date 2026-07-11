// ============================================
// Friends Screen — SameGoat-style layout
// Two tabs: Friends | Circles
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
  Share,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useAuth } from '../contexts/AuthContext';
import { friendService, FriendWithProfile, FriendRequest, UserSearchResult, FriendSlot, FriendComparison } from '../services/friendService';
import { crewService, Crew, CrewMember } from '../services/crewService';
import { knockoutService, KnockoutChallenge } from '../services/knockoutService';
import { QRCode } from '../components/QRCode';
import { ContactInvite } from '../components/ContactInvite';
import { TasteRadar } from '../components/TasteRadar';
import { computeTasteAxes } from '../utils/tasteAxes';
import { shareToWhatsApp, copyToClipboard } from '../utils/crossPlatform';
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';

// Relationship labels — what turns a % into a screenshot-worthy claim
const LABEL_OPTIONS = ['SPOUSE', 'PARTNER', 'BEST FRIEND', 'FAMILY', 'FRIEND', 'COWORKER'];

type FriendsTabType = 'friends' | 'circles';

interface FriendsScreenProps {
  onChallenge?: (friendId: string, friendName: string) => void;
  onAcceptChallenge?: (code: string) => void;
  onViewCrew?: (crewId: string) => void;
  onOpenAuth?: () => void;
}

export function FriendsScreen({ onChallenge, onAcceptChallenge, onViewCrew, onOpenAuth }: FriendsScreenProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<FriendsTabType>('friends');

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

  // Your People: labels, ghost slots, narrative comparisons
  const [labels, setLabels] = useState<Map<string, string>>(new Map());
  const [slots, setSlots] = useState<FriendSlot[]>([]);
  const [newSlotName, setNewSlotName] = useState('');
  const [addSlotMode, setAddSlotMode] = useState(false);
  const [comparisons, setComparisons] = useState<Map<string, FriendComparison>>(new Map());
  const [loadingComparison, setLoadingComparison] = useState<string | null>(null);
  const [familyCopied, setFamilyCopied] = useState(false);

  // Knockout challenges state
  const [pendingKnockouts, setPendingKnockouts] = useState<KnockoutChallenge[]>([]);

  // Crews state
  const [crews, setCrews] = useState<Crew[]>([]);
  const [crewsLoading, setCrewsLoading] = useState(false);
  const [showCreateCrew, setShowCreateCrew] = useState(false);
  const [showJoinCrew, setShowJoinCrew] = useState(false);
  const [newCrewName, setNewCrewName] = useState('');
  const [joinCrewCode, setJoinCrewCode] = useState('');
  const [crewError, setCrewError] = useState('');
  const [creatingCrew, setCreatingCrew] = useState(false);

  // Load friends + pending knockout challenges + labels + invite slots
  useEffect(() => {
    if (!user?.id) return;
    setLoading(true);
    Promise.all([
      friendService.getFriends(user.id),
      friendService.getPendingRequests(user.id),
      knockoutService.getPendingChallengesForUser(user.id),
      friendService.getFriendLabels(user.id),
      friendService.getFriendSlots(user.id),
    ]).then(([friendsData, requestsData, knockoutsData, labelsData, slotsData]) => {
      setFriends(friendsData);
      setFriendRequests(requestsData);
      setPendingKnockouts(knockoutsData);
      setLabels(labelsData);
      setSlots(slotsData);
      setLoading(false);
    });
  }, [user?.id]);

  // Lazy-load the narrative comparison when a friend row expands
  useEffect(() => {
    if (!expandedFriendId || !user?.id || comparisons.has(expandedFriendId)) return;
    setLoadingComparison(expandedFriendId);
    friendService.getFriendComparison(user.id, expandedFriendId).then((comparison) => {
      if (comparison) {
        setComparisons(prev => new Map(prev).set(expandedFriendId, comparison));
      }
      setLoadingComparison(null);
    });
  }, [expandedFriendId, user?.id]);

  const handleSetLabel = useCallback(async (friendId: string, label: string | null) => {
    if (!user?.id) return;
    setLabels(prev => {
      const next = new Map(prev);
      if (label) next.set(friendId, label);
      else next.delete(friendId);
      return next;
    });
    await friendService.setFriendLabel(user.id, friendId, label);
  }, [user?.id]);

  // Ghost-slot invite: personal ask + ref link (auto-friends on signup)
  const buildSlotInviteText = useCallback((name: string) => {
    const displayName = user?.user_metadata?.display_name || 'A friend';
    return `hey ${name} — it's ${displayName}. i need 2 minutes of your movie takes to finish my taste map on aaybee. where do you land? https://aaybee.netlify.app/?ref=${user?.id}`;
  }, [user?.id, user?.user_metadata?.display_name]);

  const handleAddSlot = useCallback(async () => {
    const name = newSlotName.trim();
    if (!user?.id || !name) return;
    const slot = await friendService.addFriendSlot(user.id, name);
    if (slot) {
      setSlots(prev => [...prev, slot]);
      setNewSlotName('');
      setAddSlotMode(false);
    }
  }, [user?.id, newSlotName]);

  const handleInviteSlot = useCallback(async (slot: FriendSlot) => {
    await shareToWhatsApp(buildSlotInviteText(slot.name));
    friendService.markSlotInvited(slot.id).catch(() => {});
    setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, invited_at: new Date().toISOString() } : s));
  }, [buildSlotInviteText]);

  const handleRemoveSlot = useCallback(async (slotId: string) => {
    setSlots(prev => prev.filter(s => s.id !== slotId));
    friendService.removeFriendSlot(slotId).catch(() => {});
  }, []);

  // Podium share card — the screenshot-to-group-chat artifact
  const buildFamilyShareText = useCallback(() => {
    const ranked = friends.filter(f => f.taste_match);
    if (ranked.length < 2) return null;
    const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
    const top = ranked.slice(0, 3);
    const lines = top.map((f, i) => {
      const label = labels.get(f.friend_id);
      const labelPart = label ? ` (${label.toLowerCase()})` : '';
      const wince = i === top.length - 1 && (f.taste_match || 0) < 70 ? ' \u{1F62C}' : '';
      return `${medals[i]} ${f.friend.display_name}${labelPart} — ${f.taste_match}%${wince}`;
    });
    return `my taste family on aaybee:\n${lines.join('\n')}\nwhere do you land? https://aaybee.netlify.app/?ref=${user?.id}`;
  }, [friends, labels, user?.id]);

  const handleShareFamily = useCallback(async (channel: 'whatsapp' | 'copy') => {
    const text = buildFamilyShareText();
    if (!text) return;
    if (channel === 'whatsapp') {
      await shareToWhatsApp(text);
    } else {
      const ok = await copyToClipboard(text);
      if (ok) {
        setFamilyCopied(true);
        setTimeout(() => setFamilyCopied(false), 2000);
      }
    }
  }, [buildFamilyShareText]);

  // Load crews
  useEffect(() => {
    if (!user?.id || activeTab !== 'circles') return;
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

  if (!user?.id) {
    return (
      <View style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.textPrimary, letterSpacing: 2, marginBottom: spacing.md, textTransform: 'uppercase' as const }}>FRIENDS</Text>
          <Text style={{ fontSize: 12, color: colors.textMuted, letterSpacing: 0.5, textAlign: 'center' as const, marginBottom: spacing.xxl, textTransform: 'uppercase' as const }}>SIGN IN TO CHALLENGE FRIENDS, JOIN CIRCLES, AND TRACK YOUR TASTE MATCH</Text>
          <Pressable
            style={{ backgroundColor: colors.accent, borderRadius: borderRadius.xxl, paddingVertical: spacing.lg, paddingHorizontal: spacing.xxxl }}
            onPress={onOpenAuth}
          >
            <Text style={{ fontSize: 14, fontWeight: '800', color: colors.background, letterSpacing: 2 }}>SIGN IN</Text>
          </Pressable>
        </View>
      </View>
    );
  }

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
            value={`https://aaybee.netlify.app/?ref=${user.id}`}
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

      {/* Incoming knockout challenges */}
      {pendingKnockouts.length > 0 && (
        <View style={styles.requestsSection}>
          <Text style={styles.sectionLabel}>INCOMING CHALLENGES</Text>
          {pendingKnockouts.map(kc => (
            <View key={kc.id} style={styles.requestRow}>
              <View>
                <Text style={styles.requestName}>{kc.creator_name}</Text>
                <Text style={styles.challengeSubtext}>CHALLENGED YOU</Text>
              </View>
              <Pressable
                style={styles.acceptButton}
                onPress={() => onAcceptChallenge?.(kc.code)}
              >
                <Text style={styles.acceptText}>PLAY</Text>
              </Pressable>
            </View>
          ))}
        </View>
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

      {/* Taste-family share — the podium screenshot for group chats */}
      {friends.filter(f => f.taste_match).length >= 2 && (
        <View style={styles.familyShareRow}>
          <Pressable
            style={[styles.familyShareButton, { backgroundColor: '#25D366' }]}
            onPress={() => handleShareFamily('whatsapp')}
          >
            <Text style={[styles.familyShareText, { color: '#000' }]}>SHARE MY TASTE FAMILY</Text>
          </Pressable>
          <Pressable
            style={[styles.familyShareButton, styles.familyCopyButton]}
            onPress={() => handleShareFamily('copy')}
          >
            <Text style={[styles.familyShareText, familyCopied && { color: colors.accent }]}>
              {familyCopied ? 'COPIED!' : 'COPY'}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Friends list */}
      {loading ? (
        <ActivityIndicator size="small" color={colors.textMuted} style={{ marginTop: spacing.xxl }} />
      ) : friends.length === 0 ? (
        <View style={styles.emptySection}>
          <Text style={styles.emptyTitle}>NO FRIENDS YET</Text>
          <Text style={styles.emptySubtitle}>TAP + ADD TO FIND PEOPLE — OR ADD SOMEONE TO YOUR MAP BELOW</Text>
        </View>
      ) : (
        friends.map((friend, idx) => {
          const isTop = idx === 0;
          const isExpanded = expandedFriendId === friend.friend_id;
          const label = labels.get(friend.friend_id);
          const comparison = comparisons.get(friend.friend_id);
          const hasMatch = !!friend.taste_match;
          return (
            <Pressable
              key={friend.friend_id}
              style={[styles.friendCard, isTop && styles.friendCardTop]}
              onPress={() => setExpandedFriendId(isExpanded ? null : friend.friend_id)}
            >
              <View style={styles.friendRow}>
                <View style={styles.friendLeft}>
                  <Text style={[styles.friendRank, isTop && styles.friendRankTop]}>#{idx + 1}</Text>
                  <View style={{ flexShrink: 1 }}>
                    <Text style={[styles.friendName, isTop && styles.friendNameTop]} numberOfLines={1}>
                      {friend.friend.display_name}
                    </Text>
                    {!!label && (
                      <Text style={[styles.friendLabel, isTop && { color: 'rgba(0,0,0,0.55)' }]}>{label}</Text>
                    )}
                  </View>
                </View>
                <View style={styles.friendRight}>
                  <Text style={[styles.friendPercent, isTop && styles.friendPercentTop, !hasMatch && styles.friendPercentLocked]}>
                    {hasMatch ? `${friend.taste_match}%` : 'PLAY TO UNLOCK'}
                  </Text>
                  {(friend as any).games_played > 0 && (
                    <Text style={[styles.friendGames, isTop && { color: colors.background }]}>
                      {(friend as any).games_played} GAMES
                    </Text>
                  )}
                </View>
              </View>

              {/* Expanded: narrative + label picker + actions */}
              {isExpanded && (
                <View>
                  {/* Narrative comparison */}
                  {loadingComparison === friend.friend_id ? (
                    <ActivityIndicator size="small" color={colors.textMuted} style={{ marginVertical: spacing.sm }} />
                  ) : comparison ? (
                    <View style={styles.narrativeSection}>
                      {comparison.total_common_movies > 0 && (
                        <Text style={[styles.narrativeConfidence, isTop && { color: 'rgba(0,0,0,0.5)' }]}>
                          BASED ON {comparison.total_common_movies} SHARED MOVIES
                        </Text>
                      )}
                      {comparison.biggest_agreement && (
                        <Text style={[styles.narrativeLine, isTop && { color: 'rgba(0,0,0,0.75)' }]}>
                          YOU BOTH LOVE: {comparison.biggest_agreement.title.toUpperCase()}
                        </Text>
                      )}
                      {comparison.biggest_disagreement && (
                        <Text style={[styles.narrativeLine, isTop && { color: 'rgba(0,0,0,0.75)' }]}>
                          BIGGEST FIGHT: {comparison.biggest_disagreement.title.toUpperCase()} — YOU #{comparison.biggest_disagreement.your_rank}, THEM #{comparison.biggest_disagreement.friend_rank}
                        </Text>
                      )}
                    </View>
                  ) : null}

                  {/* Relationship label picker */}
                  <View style={styles.labelRow}>
                    {LABEL_OPTIONS.map(option => (
                      <Pressable
                        key={option}
                        style={[styles.labelChip, label === option && styles.labelChipActive]}
                        onPress={() => handleSetLabel(friend.friend_id, label === option ? null : option)}
                      >
                        <Text style={[styles.labelChipText, label === option && styles.labelChipTextActive]}>
                          {option}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <View style={styles.friendActions}>
                    {onChallenge && (
                      <Pressable
                        style={[styles.challengeButton, isTop && styles.challengeButtonTop]}
                        onPress={() => onChallenge(friend.friend_id, friend.friend.display_name)}
                      >
                        <Text style={[styles.challengeText, isTop && styles.challengeTextTop]}>
                          {hasMatch ? 'CHALLENGE' : 'PLAY A BRACKET TO UNLOCK'}
                        </Text>
                      </Pressable>
                    )}
                    <Pressable onPress={() => handleRemoveFriend(friend.friend_id)}>
                      <Text style={styles.removeText}>
                        {removing === friend.friend_id ? '...' :
                         confirmRemove === friend.friend_id ? 'REMOVE?' : 'x'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </Pressable>
          );
        })
      )}

      {/* Ghost rows — people who should be on your map but aren't here yet */}
      <View style={styles.slotsSection}>
        <Text style={styles.sectionLabel}>NOT ON YOUR MAP YET</Text>
        {slots.map(slot => (
          <View key={slot.id} style={styles.slotRow}>
            <View style={styles.slotLeft}>
              <Text style={styles.slotRank}>#?</Text>
              <Text style={styles.slotName} numberOfLines={1}>{slot.name}</Text>
            </View>
            <View style={styles.slotActions}>
              <Pressable style={styles.slotInviteButton} onPress={() => handleInviteSlot(slot)}>
                <Text style={styles.slotInviteText}>{slot.invited_at ? 'INVITE AGAIN' : 'INVITE'}</Text>
              </Pressable>
              <Pressable onPress={() => handleRemoveSlot(slot.id)} hitSlop={8}>
                <Text style={styles.removeText}>x</Text>
              </Pressable>
            </View>
          </View>
        ))}

        {addSlotMode ? (
          <View style={styles.slotAddRow}>
            <TextInput
              style={styles.slotInput}
              placeholder="THEIR NAME..."
              placeholderTextColor={colors.textMuted}
              value={newSlotName}
              onChangeText={setNewSlotName}
              autoFocus
              maxLength={40}
              onSubmitEditing={handleAddSlot}
            />
            <Pressable style={styles.slotInviteButton} onPress={handleAddSlot}>
              <Text style={styles.slotInviteText}>ADD</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.slotAddButton} onPress={() => setAddSlotMode(true)}>
            <Text style={styles.slotAddText}>+ WHERE DOES YOUR PERSON LAND?</Text>
          </Pressable>
        )}
      </View>
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
            placeholder="CIRCLE NAME (E.G. ROOMMATES)"
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
            <Text style={styles.crewSubmitText}>{creatingCrew ? '...' : 'CREATE CIRCLE'}</Text>
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
            <Text style={styles.crewSubmitText}>{creatingCrew ? '...' : 'JOIN CIRCLE'}</Text>
          </Pressable>
          {!!crewError && <Text style={styles.crewErrorText}>{crewError}</Text>}
        </Animated.View>
      )}

      {/* Crews list */}
      {crewsLoading ? (
        <ActivityIndicator size="small" color={colors.textMuted} style={{ marginTop: spacing.xxl }} />
      ) : crews.length === 0 ? (
        <View style={styles.emptySection}>
          <Text style={styles.emptyTitle}>NO CIRCLES YET</Text>
          <Text style={styles.emptySubtitle}>CREATE A CIRCLE AND SHARE THE CODE WITH YOUR GROUP CHAT</Text>
        </View>
      ) : (
        crews.map((crew) => (
          <View key={crew.id} style={styles.crewCard}>
            <Pressable onPress={() => onViewCrew?.(crew.id)}>
              <Text style={styles.crewName}>{crew.name.toUpperCase()}</Text>
              <Text style={styles.crewCode}>CODE: {crew.code}</Text>
            </Pressable>
            <View style={styles.crewShareRow}>
              <Pressable
                style={[styles.crewShareButton, styles.crewWhatsAppButton]}
                onPress={() => {
                  const url = user?.id
                    ? `https://aaybee.netlify.app/crew/${crew.code}?ref=${user.id}`
                    : `https://aaybee.netlify.app/crew/${crew.code}`;
                  // Aimed at the whole group chat, not one person — crews work
                  // when they arrive pre-dense
                  shareToWhatsApp(
                    `our group chat needs a movie circle. join "${crew.name}" on aaybee — play the daily ranking, see who has the worst taste:\n\n${url}`
                  );
                }}
              >
                <Text style={[styles.crewShareText, { color: '#000' }]}>INVITE GROUP CHAT</Text>
              </Pressable>
              <Pressable
                style={styles.crewShareButton}
                onPress={async () => {
                  const url = user?.id
                    ? `https://aaybee.netlify.app/crew/${crew.code}?ref=${user.id}`
                    : `https://aaybee.netlify.app/crew/${crew.code}`;
                  const msg = `JOIN MY CIRCLE "${crew.name}" ON AAYBEE\n\n${url}`;
                  try {
                    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) {
                      await navigator.share({ text: msg });
                    } else if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
                      await navigator.clipboard.writeText(msg);
                    } else {
                      await Share.share({ message: msg });
                    }
                  } catch {}
                }}
              >
                <Text style={styles.crewShareText}>INVITE</Text>
              </Pressable>
            </View>
          </View>
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
        <Pressable style={[styles.tab, activeTab === 'circles' && styles.tabActive]} onPress={() => setActiveTab('circles')}>
          <Text style={[styles.tabText, activeTab === 'circles' && styles.tabTextActive]}>CIRCLES</Text>
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
  challengeSubtext: {
    fontSize: 8,
    fontWeight: '400',
    color: colors.textMuted,
    letterSpacing: 1,
    marginTop: 2,
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
  friendGames: {
    fontSize: 8,
    fontWeight: '400',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginTop: 2,
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

  // Your People: locked rows, labels, narrative
  friendPercentLocked: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 1,
  },
  friendLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 1,
    marginTop: 2,
  },
  narrativeSection: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 4,
  },
  narrativeConfidence: {
    fontSize: 8,
    fontWeight: '500',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  narrativeLine: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    lineHeight: 15,
  },
  labelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  labelChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.round,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
  },
  labelChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  labelChipText: {
    fontSize: 8,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  labelChipTextActive: {
    color: colors.background,
  },

  // Taste-family share
  familyShareRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  familyShareButton: {
    flex: 1,
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  familyCopyButton: {
    flex: 0.5,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  familyShareText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 1,
  },

  // Ghost slots
  slotsSection: {
    marginTop: spacing.xl,
  },
  slotRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  slotLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  slotRank: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 1,
  },
  slotName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  slotActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  slotInviteButton: {
    backgroundColor: '#25D366',
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  slotInviteText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#000',
    letterSpacing: 1,
  },
  slotAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  slotInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    fontSize: 11,
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  slotAddButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  slotAddText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1,
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
  crewShareRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  crewShareButton: {
    backgroundColor: colors.textPrimary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  crewWhatsAppButton: {
    backgroundColor: '#25D366',
  },
  crewShareText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.background,
    letterSpacing: 1,
  },
});
