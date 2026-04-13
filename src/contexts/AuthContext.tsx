import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../services/supabase';
import * as authService from '../services/authService';
import { friendService } from '../services/friendService';
import { notificationService } from '../services/notificationService';
import { activityService } from '../services/activityService';
import { getStoredRefParam, clearStoredRefParam } from '../utils/deepLink';
import type { User, Session } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isGuest: boolean; // True if user hasn't signed up yet
}

interface AuthContextType extends AuthState {
  signUp: (email: string, password: string, referredBy?: string) => Promise<authService.AuthResult>;
  signIn: (email: string, password: string) => Promise<authService.AuthResult>;
  signOut: () => Promise<authService.AuthResult>;
  signInWithGoogle: () => Promise<authService.AuthResult>;
  resetPassword: (email: string) => Promise<authService.AuthResult>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    isLoading: true,
    isGuest: true,
  });

  // Initialize auth state on mount
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState({
        user: session?.user ?? null,
        session,
        isLoading: false,
        isGuest: !session,
      });
    });

    // Listen for auth changes (including OAuth redirects)
    const referralProcessed = new Set<string>();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setState(prev => ({
          ...prev,
          user: session?.user ?? null,
          session,
          isGuest: !session,
        }));

        // Handle referral loop for OAuth signups (Google, etc.)
        if (event === 'SIGNED_IN' && session?.user?.id && !referralProcessed.has(session.user.id)) {
          referralProcessed.add(session.user.id);
          try {
            const ref = await getStoredRefParam();
            if (ref && ref !== session.user.id) {
              // Update profile with referral
              const email = session.user.email || '';
              await supabase.from('user_profiles').update({
                referred_by: ref,
                email,
              }).eq('id', session.user.id);

              // Auto-connect with referrer
              await friendService.sendFriendRequest(ref).catch(() => {});

              // Notify referrer
              const displayName = session.user.user_metadata?.display_name || email.split('@')[0] || 'Someone';
              await notificationService.notifyNewReferral(ref, displayName).catch(() => {});

              // Log joined activity
              await activityService.logJoined(session.user.id).catch(() => {});

              clearStoredRefParam();
            }
          } catch {}
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string, referredBy?: string) => {
    const result = await authService.signUp(email, password, referredBy);
    return result;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await authService.signIn(email, password);
    return result;
  }, []);

  const signOut = useCallback(async () => {
    const result = await authService.signOut();
    if (result.success) {
      setState(prev => ({
        ...prev,
        user: null,
        session: null,
        isGuest: true,
      }));
    }
    return result;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    return authService.signInWithGoogle();
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    return authService.resetPassword(email);
  }, []);

  const value: AuthContextType = {
    ...state,
    signUp,
    signIn,
    signOut,
    signInWithGoogle,
    resetPassword,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
