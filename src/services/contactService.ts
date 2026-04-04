import { Platform, Linking } from 'react-native';
import { supabase } from './supabase';
import { getLastDisagreement } from './shareService';

// ============================================
// TYPES
// ============================================

export interface AppContact {
  name: string;
  emails: string[];
  phones: string[];
}

export interface MatchedUser {
  id: string;
  display_name: string;
  email: string;
}

// ============================================
// SERVICE
// ============================================

export const contactService = {
  /**
   * Request permission and read device contacts.
   * Returns empty array on web or if permission denied.
   */
  getContacts: async (): Promise<AppContact[]> => {
    if (Platform.OS === 'web') return [];

    try {
      const Contacts = require('expo-contacts');
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') return [];

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers],
      });

      return (data || [])
        .filter((c: any) => c.name && (c.emails?.length || c.phoneNumbers?.length))
        .map((c: any) => ({
          name: c.name,
          emails: (c.emails || []).map((e: any) => e.email?.toLowerCase()).filter(Boolean),
          phones: (c.phoneNumbers || []).map((p: any) => p.number).filter(Boolean),
        }));
    } catch {
      return [];
    }
  },

  /**
   * Find which contacts are already on Aaybee by matching emails.
   */
  findExistingUsers: async (emails: string[]): Promise<MatchedUser[]> => {
    if (emails.length === 0) return [];

    try {
      const results: MatchedUser[] = [];
      // Batch in chunks of 50 (Supabase IN clause limit)
      for (let i = 0; i < emails.length; i += 50) {
        const chunk = emails.slice(i, i + 50);
        const { data } = await supabase
          .from('user_profiles')
          .select('id, display_name, email')
          .in('email', chunk);
        if (data) {
          results.push(...data.filter((d: any) => d.email && d.display_name) as MatchedUser[]);
        }
      }
      return results;
    } catch {
      return [];
    }
  },

  /**
   * Open SMS app with pre-filled invite message.
   * Uses the user's most recent disagreement if available.
   */
  sendSmsInvite: async (phone: string, senderName: string): Promise<void> => {
    const disagreement = await getLastDisagreement();
    const text = disagreement
      ? `${senderName} on aaybee: ${disagreement} settle it here: https://aaybee.netlify.app`
      : `${senderName} wants you on aaybee — rank movies and see how your taste compares: https://aaybee.netlify.app`;
    const body = encodeURIComponent(text);
    const url = Platform.OS === 'ios'
      ? `sms:${phone}&body=${body}`
      : `sms:${phone}?body=${body}`;

    try {
      await Linking.openURL(url);
    } catch {
      // Ignore — SMS app may not be available
    }
  },
};

export default contactService;
