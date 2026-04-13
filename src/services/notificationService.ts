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

/**
 * Send a push notification via Expo's push API.
 */
async function sendPushNotification(
  pushToken: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: pushToken,
        sound: 'default',
        title,
        body,
        data,
      }),
    });
  } catch (error) {
    console.error('[Notifications] Failed to send push notification:', error);
  }
}

/**
 * Fetch a user's push token from user_profiles.
 */
async function getUserPushToken(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('push_token')
    .eq('id', userId)
    .single();

  if (error || !data?.push_token) {
    return null;
  }

  return data.push_token;
}

export const notificationService = {
  /**
   * Register for push notifications and save the token to user_profiles.
   */
  async registerForPushNotifications(userId: string): Promise<string | null> {
    const token = await getExpoPushToken();
    if (!token) return null;

    const { error } = await supabase
      .from('user_profiles')
      .update({ push_token: token })
      .eq('id', userId);

    if (error) {
      console.error('[Notifications] Failed to save push token:', error);
    }

    return token;
  },

  /**
   * Notify a user that they've been challenged.
   */
  async notifyChallenge(
    challengedUserId: string,
    challengerName: string,
    challengeCode: string,
  ): Promise<void> {
    const pushToken = await getUserPushToken(challengedUserId);
    if (!pushToken) return;

    await sendPushNotification(
      pushToken,
      'New Challenge!',
      `${challengerName} challenged you! Tap to play.`,
      { type: 'vs', code: challengeCode },
    );
  },

  /**
   * Notify the challenger that someone joined their challenge.
   */
  async notifyChallengeJoined(
    challengerId: string,
    challengedName: string,
    challengeCode: string,
  ): Promise<void> {
    const pushToken = await getUserPushToken(challengerId);
    if (!pushToken) return;

    await sendPushNotification(
      pushToken,
      'Challenge Accepted!',
      `${challengedName} joined your challenge!`,
      { type: 'vs', code: challengeCode },
    );
  },

  /**
   * Notify the challenger that the challenged user has made their picks.
   */
  async notifyChallengerReady(
    challengerId: string,
    challengedName: string,
    challengeCode: string,
  ): Promise<void> {
    const pushToken = await getUserPushToken(challengerId);
    if (!pushToken) return;

    await sendPushNotification(
      pushToken,
      'Your Turn!',
      `${challengedName} made their picks! Your turn.`,
      { type: 'vs', code: challengeCode },
    );
  },

  /**
   * Notify a user that someone sent them a knockout challenge.
   */
  async notifyKnockoutChallenge(
    challengedUserId: string,
    challengerName: string,
    challengeCode: string,
  ): Promise<void> {
    try {
      const token = await getUserPushToken(challengedUserId);
      if (token) {
        await sendPushNotification(
          token,
          `${challengerName} challenged you!`,
          '16 movies. One standing. Tap to play.',
          { type: 'vs', code: challengeCode },
        );
      }
    } catch (err) {
      console.error('[NotificationService] notifyKnockoutChallenge error:', err);
    }
  },

  /**
   * Notify the creator that their knockout challenge was completed.
   */
  async notifyKnockoutCompleted(
    creatorId: string,
    challengerName: string,
    matchPercent: number,
    challengeCode: string,
  ): Promise<void> {
    try {
      const token = await getUserPushToken(creatorId);
      if (token) {
        await sendPushNotification(
          token,
          `${challengerName} played your challenge!`,
          `${matchPercent}% taste match — see the results`,
          { type: 'vs', code: challengeCode },
        );
      }
    } catch (err) {
      console.error('[NotificationService] notifyKnockoutCompleted error:', err);
    }
  },

  /**
   * Notify a user that they received a friend request.
   */
  async notifyFriendRequest(
    targetUserId: string,
    fromUserName: string,
  ): Promise<void> {
    try {
      const token = await getUserPushToken(targetUserId);
      if (token) {
        await sendPushNotification(
          token,
          'New friend request',
          `${fromUserName} wants to connect on Aaybee`,
          { type: 'friend_request' },
        );
      }
    } catch (err) {
      console.error('[NotificationService] notifyFriendRequest error:', err);
    }
  },

  /**
   * Notify a user it's their turn in a Decide negotiation.
   */
  async notifyDecideTurn(
    targetUserId: string,
    proposerName: string,
    movieTitle: string,
    sessionCode: string,
  ): Promise<void> {
    try {
      const token = await getUserPushToken(targetUserId);
      if (token) {
        await sendPushNotification(
          token,
          `${proposerName} picked ${movieTitle}`,
          'Agree or disagree?',
          { type: 'decide', code: sessionCode },
        );
      }
    } catch (err) {
      console.error('[NotificationService] notifyDecideTurn error:', err);
    }
  },

  /**
   * Notify circle members who haven't played today that others have.
   */
  async notifyCircleDaily(crewId: string, crewName: string, playedCount: number, totalCount: number): Promise<void> {
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
        const token = await getUserPushToken(member.user_id);
        if (token) {
          await sendPushNotification(
            token,
            crewName,
            `${playedCount}/${totalCount} have played today — don't be last`,
            { type: 'daily', crewId },
          );
        }
      }
    } catch (err) {
      console.error('[NotificationService] notifyCircleDaily error:', err);
    }
  },

  /**
   * Notify all circle members that everyone has played.
   */
  async notifyCircleResults(crewId: string, crewName: string): Promise<void> {
    try {
      const { data: members } = await supabase
        .from('crew_members')
        .select('user_id')
        .eq('crew_id', crewId);

      if (!members) return;

      for (const member of members) {
        const token = await getUserPushToken(member.user_id);
        if (token) {
          await sendPushNotification(
            token,
            crewName,
            "everyone's played — see how your circle ranked",
            { type: 'daily', crewId },
          );
        }
      }
    } catch (err) {
      console.error('[NotificationService] notifyCircleResults error:', err);
    }
  },

  /**
   * Notify a user that someone they invited just joined.
   */
  async notifyNewReferral(referrerId: string, newUserName: string): Promise<void> {
    try {
      const token = await getUserPushToken(referrerId);
      if (token) {
        await sendPushNotification(
          token,
          'Your friend joined!',
          `${newUserName} just joined Aaybee — challenge them to see who has better taste`,
          { type: 'referral' },
        );
      }
    } catch (err) {
      console.error('[NotificationService] notifyNewReferral error:', err);
    }
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
};
