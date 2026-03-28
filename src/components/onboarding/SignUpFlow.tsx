import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, spacing, borderRadius, typography } from '../../theme/cinematic';
import { signUp } from '../../services/authService';
import { supabase } from '../../services/supabase';

type SignUpStep = 'options' | 'email' | 'name' | 'password';

interface SignUpFlowProps {
  onComplete: (skipped: boolean) => void;
  onBack?: () => void;
}

export function SignUpFlow({ onComplete, onBack }: SignUpFlowProps) {
  const [step, setStep] = useState<SignUpStep>('options');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const isValidPassword = password.length >= 8;

  const handleEmailSignUp = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await signUp(email, password);
      if (!result.success) {
        throw new Error(result.error?.message || 'Sign up failed');
      }

      // Update user metadata with name
      if (result.user) {
        await supabase.auth.updateUser({
          data: { display_name: name },
        });
      }

      onComplete(false);
    } catch (err: any) {
      setError(err.message || 'Sign up failed');
    } finally {
      setLoading(false);
    }
  };

  const handleMaybeLater = () => {
    onComplete(true);
  };

  const handleBack = () => {
    setError(null);
    if (step === 'email') setStep('options');
    else if (step === 'name') setStep('email');
    else if (step === 'password') setStep('name');
    else if (onBack) onBack();
  };

  const renderOptions = () => (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
      <Text style={styles.title}>Save your progress</Text>

      <View style={styles.buttonsContainer}>
        <Pressable
          style={[styles.socialButton, styles.emailButton]}
          onPress={() => setStep('email')}
          disabled={loading}
        >
          <Text style={styles.emailText}>Sign up with email</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <Pressable style={styles.maybeLaterButton} onPress={handleMaybeLater}>
        <Text style={styles.maybeLaterText}>Maybe later</Text>
      </Pressable>

      {loading && <ActivityIndicator style={styles.loader} color={colors.accent} />}
    </Animated.View>
  );

  const renderEmailStep = () => (
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
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
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
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
    <Animated.View style={styles.container} entering={FadeIn.duration(300)}>
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
        <Pressable
          style={styles.eyeButton}
          onPress={() => setShowPassword(!showPassword)}
        >
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

  switch (step) {
    case 'options':
      return renderOptions();
    case 'email':
      return renderEmailStep();
    case 'name':
      return renderNameStep();
    case 'password':
      return renderPasswordStep();
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
  backButton: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.lg,
  },
  backText: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xxl,
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
    borderRadius: borderRadius.lg,
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
  maybeLaterButton: {
    marginTop: spacing.xxl,
    padding: spacing.md,
  },
  maybeLaterText: {
    ...typography.body,
    color: colors.textMuted,
  },
  input: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    ...typography.body,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
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
    backgroundColor: colors.accent,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxxl,
    borderRadius: borderRadius.lg,
    marginTop: spacing.md,
    minWidth: 200,
    alignItems: 'center',
  },
  continueButtonDisabled: {
    backgroundColor: colors.surface,
  },
  continueButtonText: {
    ...typography.bodyMedium,
    color: colors.background,
    fontWeight: '700',
  },
  continueButtonTextDisabled: {
    color: colors.textMuted,
  },
  errorText: {
    ...typography.caption,
    color: '#FF6B6B',
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  loader: {
    marginTop: spacing.lg,
  },
});
