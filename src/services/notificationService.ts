import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { getDailyNumber } from '../data/dailyCategories';

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Push delivery goes through the send-push Netlify function: the server
// verifies the caller's JWT, builds the message from a template allowlist,
// and reads the target's token with the service role. Clients cannot read
// other users' tokens or send arbitrary content.
const SEND_PUSH_URL =
  Platform.OS === 'web'
    ? '/.netlify/functions/send-push'
    : 'https://aaybee.netlify.app/.netlify/functions/send-push';

type PushTemplate =
  | 'knockout_challenge'
  | 'knockout_completed'
  | 'friend_request'
  | 'decide_turn'
  | 'circle_daily'
  | 'circle_results'
  | 'referral';

interface PushParams {
  code?: string;
  matchPercent?: number;
  movieTitle?: string;
  crewId?: string;
  playedCount?: number;
  totalCount?: number;
}

/**
 * Ask the server to deliver a push to another user.
 * Silently no-ops when there is no session (guests can't send pushes).
 */
async function requestPush(
  targetUserId: string,
  template: PushTemplate,
  params: PushParams = {},
): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    await fetch(SEND_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ targetUserId, template, params }),
    });
  } catch (error) {
    console.error('[Notifications] Failed to request push:', error);
  }
}

/**
 * Get the Expo push token for this device.
 */
async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn('[Notifications] Push notifications only work on physical devices');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('[Notifications] Permission not granted');
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId,
  });

  return tokenData.data;
}

export const notificationService = {
  /**
   * Register for push notifications and save the token (owner-only table).
   */
  async registerForPushNotifications(userId: string): Promise<string | null> {
    const token = await getExpoPushToken();
    if (!token) return null;

    const { error } = await supabase
      .from('user_push_tokens')
      .upsert(
        { user_id: userId, token, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );

    if (error) {
      console.error('[Notifications] Failed to save push token:', error);
    }

    return token;
  },

  /**
   * Notify a user that someone sent them a knockout challenge.
   */
  async notifyKnockoutChallenge(
    challengedUserId: string,
    _challengerName: string,
    challengeCode: string,
  ): Promise<void> {
    await requestPush(challengedUserId, 'knockout_challenge', { code: challengeCode });
  },

  /**
   * Notify the creator that their knockout challenge was completed.
   */
  async notifyKnockoutCompleted(
    creatorId: string,
    _challengerName: string,
    matchPercent: number,
    challengeCode: string,
  ): Promise<void> {
    await requestPush(creatorId, 'knockout_completed', {
      code: challengeCode,
      matchPercent,
    });
  },

  /**
   * Notify a user that they received a friend request.
   */
  async notifyFriendRequest(
    targetUserId: string,
    _fromUserName: string,
  ): Promise<void> {
    await requestPush(targetUserId, 'friend_request');
  },

  /**
   * Notify a user it's their turn in a Decide negotiation.
   */
  async notifyDecideTurn(
    targetUserId: string,
    _proposerName: string,
    movieTitle: string,
    sessionCode: string,
  ): Promise<void> {
    await requestPush(targetUserId, 'decide_turn', {
      code: sessionCode,
      movieTitle,
    });
  },

  /**
   * Notify circle members who haven't played today that others have.
   */
  async notifyCircleDaily(crewId: string, _crewName: string, playedCount: number, totalCount: number): Promise<void> {
    try {
      // Fetch crew members who haven't played today
      const { data: members } = await supabase
        .from('crew_members')
        .select('user_id')
        .eq('crew_id', crewId);

      if (!members) return;

      // Get today's daily number to check who played
      const dailyNumber = getDailyNumber();
      const { data: picks } = await supabase
        .from('crew_daily_picks')
        .select('user_id')
        .eq('crew_id', crewId)
        .eq('daily_number', dailyNumber);

      const playedUserIds = new Set(picks?.map(p => p.user_id) || []);
      const unplayedMembers = members.filter(m => !playedUserIds.has(m.user_id));

      for (const member of unplayedMembers) {
        await requestPush(member.user_id, 'circle_daily', {
          crewId,
          playedCount,
          totalCount,
        });
      }
    } catch (err) {
      console.error('[NotificationService] notifyCircleDaily error:', err);
    }
  },

  /**
   * Notify all circle members that everyone has played.
   */
  async notifyCircleResults(crewId: string, _crewName: string): Promise<void> {
    try {
      const { data: members } = await supabase
        .from('crew_members')
        .select('user_id')
        .eq('crew_id', crewId);

      if (!members) return;

      for (const member of members) {
        await requestPush(member.user_id, 'circle_results', { crewId });
      }
    } catch (err) {
      console.error('[NotificationService] notifyCircleResults error:', err);
    }
  },

  /**
   * Notify a user that someone they invited just joined.
   */
  async notifyNewReferral(referrerId: string, _newUserName: string): Promise<void> {
    await requestPush(referrerId, 'referral');
  },

  /**
   * Listen for notification taps. Returns a cleanup function.
   */
  addNotificationResponseListener(
    callback: (data: Record<string, unknown>) => void,
  ): () => void {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        if (data) {
          callback(data as Record<string, unknown>);
        }
      },
    );

    return () => subscription.remove();
  },

  /**
   * Schedule (or reschedule) the local evening reminder for the daily.
   * Local notification only — no server involved. No-op on web.
   */
  async scheduleDailyReminder(hour: number = 19): Promise<void> {
    if (Platform.OS === 'web' || !Device.isDevice) return;
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') return;

      await Notifications.cancelScheduledNotificationAsync('daily-reminder').catch(() => {});
      await Notifications.scheduleNotificationAsync({
        identifier: 'daily-reminder',
        content: {
          title: "Today's Aaybee Daily is up",
          body: 'Keep your streak alive — rank today\'s 9 movies',
          data: { type: 'daily' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute: 0,
        },
      });
    } catch (err) {
      console.error('[NotificationService] scheduleDailyReminder error:', err);
    }
  },
};
