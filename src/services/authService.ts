import { supabase } from './supabase';
import type { User, Session } from '@supabase/supabase-js';
import { activityService } from './activityService';

export interface AuthError {
  message: string;
  code?: string;
}

export interface AuthResult {
  success: boolean;
  user?: User | null;
  session?: Session | null;
  error?: AuthError;
}

/**
 * Sign up with email and password
 */
export async function signUp(email: string, password: string, referredBy?: string): Promise<AuthResult> {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      return {
        success: false,
        error: { message: error.message, code: error.code },
      };
    }

    // Log joined activity + set referral and email on profile
    if (data.user?.id) {
      activityService.logJoined(data.user.id).catch(console.error);

      const profileUpdate: Record<string, string> = { email };
      if (referredBy) profileUpdate.referred_by = referredBy;
      supabase.from('user_profiles').update(profileUpdate).eq('id', data.user.id).then();
    }

    return {
      success: true,
      user: data.user,
      session: data.session,
    };
  } catch (err) {
    return {
      success: false,
      error: { message: 'An unexpected error occurred' },
    };
  }
}

/**
 * Sign in with email and password
 */
export async function signIn(email: string, password: string): Promise<AuthResult> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return {
        success: false,
        error: { message: error.message, code: error.code },
      };
    }

    return {
      success: true,
      user: data.user,
      session: data.session,
    };
  } catch (err) {
    return {
      success: false,
      error: { message: 'An unexpected error occurred' },
    };
  }
}

/**
 * Sign in with Google OAuth
 */
export async function signInWithGoogle(): Promise<AuthResult> {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: typeof window !== 'undefined' ? window.location.origin : 'https://aaybee.netlify.app',
      },
    });

    if (error) {
      return {
        success: false,
        error: { message: error.message, code: error.code },
      };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: { message: 'An unexpected error occurred' },
    };
  }
}

/**
 * Sign out the current user
 */
export async function signOut(): Promise<AuthResult> {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      return {
        success: false,
        error: { message: error.message, code: error.code },
      };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: { message: 'An unexpected error occurred' },
    };
  }
}

/**
 * Get the current session
 */
export async function getSession(): Promise<Session | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session;
  } catch {
    return null;
  }
}

/**
 * Get the current user
 */
export async function getUser(): Promise<User | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user;
  } catch {
    return null;
  }
}

/**
 * Send password reset email
 */
export async function resetPassword(email: string): Promise<AuthResult> {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email);

    if (error) {
      return {
        success: false,
        error: { message: error.message, code: error.code },
      };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: { message: 'An unexpected error occurred' },
    };
  }
}

/**
 * Update user password (when logged in)
 */
export async function updatePassword(newPassword: string): Promise<AuthResult> {
  try {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      return {
        success: false,
        error: { message: error.message, code: error.code },
      };
    }

    return {
      success: true,
      user: data.user,
    };
  } catch (err) {
    return {
      success: false,
      error: { message: 'An unexpected error occurred' },
    };
  }
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return session !== null;
}
