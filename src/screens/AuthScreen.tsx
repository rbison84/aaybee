import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';
import { CinematicBackground } from '../components/cinematic';
import { getStoredRefParam, clearStoredRefParam } from '../utils/deepLink';

type AuthStep = 'options' | 'email' | 'name' | 'password' | 'signin';

interface AuthScreenProps {
  onClose: () => void;
  onSuccess?: () => void;
  initialMode?: 'signin' | 'signup';
}

export function AuthScreen({ onClose, onSuccess, initialMode = 'signup' }: AuthScreenProps) {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const [step, setStep] = useState<AuthStep>(initialMode === 'signin' ? 'signin' : 'options');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const isValidPassword = password.length >= 8;

  const handleSuccess = () => {
    onSuccess?.();
    onClose();
  };

  const handleEmailSignUp = async () => {
    setLoading(true);
    setError(null);
    try {
      const ref = await getStoredRefParam();
      const result = await signUp(email, password, ref || undefined);
      if (!result.success) {
        throw new Error(result.error?.message || 'Sign up failed');
      }
      // Update user metadata and profile with name
      if (result.user) {
        await supabase.auth.updateUser({ data: { display_name: name } });
        await supabase.from('user_profiles').update({ display_name: name, email }).eq('id', result.user.id);
      }
      clearStoredRefParam();
      handleSuccess();
    } catch (err: any) {
      setError(err.message || 'Sign up failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await signIn(email, password);
      if (!result.success) {
        throw new Error(result.error?.message || 'Sign in failed');
      }
      handleSuccess();
    } catch (err: any) {
      setError(err.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setError(null);
    if (step === 'email') setStep('options');
    else if (step === 'name') setStep('email');
    else if (step === 'password') setStep('name');
    else if (step === 'signin') setStep('options');
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    const result = await signInWithGoogle();
    if (!result.success && result.error) {
      setError(result.error.message);
    }
    setLoading(false);
  };

  const renderOptions = () => (
    <Animated.View style={styles.stepContainer} entering={FadeIn.duration(300)}>
      <Text style={styles.title}>SAVE YOUR PROGRESS</Text>

      <View style={styles.buttonsContainer}>
        <Pressable
          style={[styles.socialButton, styles.googleButton]}
          onPress={handleGoogleSignIn}
          disabled={loading}
        >
          <Text style={styles.googleIcon}>G</Text>
          <Text style={styles.googleText}>CONTINUE WITH GOOGLE</Text>
        </Pressable>

        <Pressable
          style={[styles.socialButton, styles.emailButton]}
          onPress={() => setStep('email')}
          disabled={loading}
        >
          <Text style={styles.emailText}>SIGN UP WITH EMAIL</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <Pressable style={styles.toggleButton} onPress={() => setStep('signin')}>
        <Text style={styles.toggleText}>Already have an account? Sign in</Text>
      </Pressable>

      {loading && <ActivityIndicator style={styles.loader} color={colors.accent} />}
    </Animated.View>
  );

  const renderSignIn = () => (
    <Animated.View style={styles.stepContainer} entering={FadeIn.duration(300)}>
      <Text style={styles.title}>Welcome back</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={colors.textMuted}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={styles.passwordContainer}>
        <TextInput
          style={styles.passwordInput}
          placeholder="Password"
          placeholderTextColor={colors.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
        />
        <Pressable style={styles.eyeButton} onPress={() => setShowPassword(!showPassword)}>
          <Text style={styles.eyeIcon}>{showPassword ? '👁' : '👁‍🗨'}</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <Pressable
        style={[styles.continueButton, (!isValidEmail(email) || !password) && styles.continueButtonDisabled]}
        onPress={handleSignIn}
        disabled={!isValidEmail(email) || !password || loading}
      >
        {loading ? (
          <ActivityIndicator color={colors.background} />
        ) : (
          <Text style={styles.continueButtonText}>Sign in</Text>
        )}
      </Pressable>

      <Pressable style={styles.toggleButton} onPress={() => setStep('options')}>
        <Text style={styles.toggleText}>Don't have an account? Sign up</Text>
      </Pressable>
    </Animated.View>
  );

  const renderEmailStep = () => (
    <Animated.View style={styles.stepContainer} entering={FadeIn.duration(300)}>
      <Pressable style={styles.backButton} onPress={handleBack}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      <Text style={styles.title}>What's your email?</Text>

      <TextInput
        style={styles.input}
        placeholder="email@example.com"
        placeholderTextColor={colors.textMuted}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
      />

      {error && <Text style={styles.errorText}>{error}</Text>}

      <Pressable
        style={[styles.continueButton, !isValidEmail(email) && styles.continueButtonDisabled]}
        onPress={() => { setError(null); setStep('name'); }}
        disabled={!isValidEmail(email)}
      >
        <Text style={[styles.continueButtonText, !isValidEmail(email) && styles.continueButtonTextDisabled]}>
          Continue
        </Text>
      </Pressable>
    </Animated.View>
  );

  const renderNameStep = () => (
    <Animated.View style={styles.stepContainer} entering={FadeIn.duration(300)}>
      <Pressable style={styles.backButton} onPress={handleBack}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      <Text style={styles.title}>What's your name?</Text>

      <TextInput
        style={styles.input}
        placeholder="Your name"
        placeholderTextColor={colors.textMuted}
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        autoCorrect={false}
        autoFocus
      />

      {error && <Text style={styles.errorText}>{error}</Text>}

      <Pressable
        style={[styles.continueButton, !name.trim() && styles.continueButtonDisabled]}
        onPress={() => { setError(null); setStep('password'); }}
        disabled={!name.trim()}
      >
        <Text style={[styles.continueButtonText, !name.trim() && styles.continueButtonTextDisabled]}>
          Continue
        </Text>
      </Pressable>
    </Animated.View>
  );

  const renderPasswordStep = () => (
    <Animated.View style={styles.stepContainer} entering={FadeIn.duration(300)}>
      <Pressable style={styles.backButton} onPress={handleBack}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      <Text style={styles.title}>Create a password</Text>

      <View style={styles.passwordContainer}>
        <TextInput
          style={styles.passwordInput}
          placeholder="Password"
          placeholderTextColor={colors.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />
        <Pressable style={styles.eyeButton} onPress={() => setShowPassword(!showPassword)}>
          <Text style={styles.eyeIcon}>{showPassword ? '👁' : '👁‍🗨'}</Text>
        </Pressable>
      </View>

      <Text style={styles.passwordHint}>At least 8 characters</Text>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <Pressable
        style={[styles.continueButton, !isValidPassword && styles.continueButtonDisabled]}
        onPress={handleEmailSignUp}
        disabled={!isValidPassword || loading}
      >
        {loading ? (
          <ActivityIndicator color={colors.background} />
        ) : (
          <Text style={[styles.continueButtonText, !isValidPassword && styles.continueButtonTextDisabled]}>
            Create account
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );

  return (
    <CinematicBackground>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          {/* Close button */}
          <View style={styles.header}>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </Pressable>
          </View>

          {/* Content */}
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {step === 'options' && renderOptions()}
            {step === 'signin' && renderSignIn()}
            {step === 'email' && renderEmailStep()}
            {step === 'name' && renderNameStep()}
            {step === 'password' && renderPasswordStep()}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </CinematicBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  closeButton: {
    backgroundColor: colors.surface,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  stepContainer: {
    alignItems: 'center',
  },
  backButton: {
    position: 'absolute',
    top: -60,
    left: 0,
  },
  backText: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xxl,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  buttonsContainer: {
    width: '100%',
    gap: spacing.md,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.xxl,
    width: '100%',
  },
  googleButton: {
    backgroundColor: '#FFFFFF',
  },
  googleIcon: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4285F4',
    marginRight: spacing.md,
  },
  googleText: {
    ...typography.bodyMedium,
    color: '#1F1F1F',
  },
  appleButton: {
    backgroundColor: '#000000',
  },
  appleIcon: {
    fontSize: 20,
    color: '#FFFFFF',
    marginRight: spacing.md,
  },
  appleText: {
    ...typography.bodyMedium,
    color: '#FFFFFF',
  },
  facebookButton: {
    backgroundColor: '#1877F2',
  },
  facebookIcon: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginRight: spacing.md,
  },
  facebookText: {
    ...typography.bodyMedium,
    color: '#FFFFFF',
  },
  emailButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.accent,
  },
  emailText: {
    ...typography.bodyMedium,
    color: colors.accent,
  },
  toggleButton: {
    marginTop: spacing.xxl,
    padding: spacing.md,
  },
  toggleText: {
    ...typography.body,
    color: colors.textMuted,
  },
  input: {
    width: '100%',
    backgroundColor: colors.background,
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    fontSize: 14,
    letterSpacing: 0.5,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  passwordContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    ...typography.body,
    color: colors.textPrimary,
  },
  eyeButton: {
    padding: spacing.md,
  },
  eyeIcon: {
    fontSize: 20,
  },
  passwordHint: {
    ...typography.caption,
    color: colors.textMuted,
    alignSelf: 'flex-start',
    marginBottom: spacing.lg,
  },
  continueButton: {
    backgroundColor: colors.textPrimary,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxxl,
    borderRadius: borderRadius.xxl,
    marginTop: spacing.md,
    minWidth: 200,
    alignItems: 'center',
  },
  continueButtonDisabled: {
    backgroundColor: colors.surface,
  },
  continueButtonText: {
    fontSize: 14,
    color: colors.background,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  continueButtonTextDisabled: {
    color: colors.textMuted,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    textAlign: 'center',
    marginVertical: spacing.md,
  },
  loader: {
    marginTop: spacing.lg,
  },
});
