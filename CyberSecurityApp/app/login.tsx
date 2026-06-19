import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppBackdrop } from '@/components/app-backdrop';
import { useAuth } from '@/features/auth/auth-context';
import { TrainingColors, TrainingShadows } from '@/features/training/ui-theme';

export default function LoginScreen() {
  const router = useRouter();
  const { registered } = useLocalSearchParams<{ registered?: string }>();
  const { login, resetPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length >= 8 && !isSubmitting;

  const handleLogin = async () => {
    if (!canSubmit) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const onboardingCompleted = await login(
        email.trim().toLowerCase(),
        password,
        rememberMe
      );
      router.replace(
        (onboardingCompleted ? '/(tabs)/dashboard' : '/onboarding') as never
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Eroare la autentificare.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError('Introdu emailul contului pentru resetarea parolei.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await resetPassword(normalizedEmail);
      Alert.alert('Email trimis', 'Verifică inbox-ul pentru link-ul de resetare a parolei.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nu am putut trimite emailul de resetare.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <AppBackdrop grid />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.authShell}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <View style={styles.iconInner}>
                <Ionicons name="shield-checkmark" size={42} color={TrainingColors.accentTeal} />
              </View>
            </View>
            <Text style={styles.brandEyebrow}>SECURITY AWARENESS PLATFORM</Text>
            <Text style={styles.title}>CyberCoach</Text>
            <Text style={styles.subtitle}>
              Învață să recunoști atacurile înainte să devină incidente.
            </Text>
          </View>

          {/* Form */}
          <View style={styles.card}>
            <Text style={styles.cardEyebrow}>BINE AI REVENIT</Text>
            <Text style={styles.cardTitle}>Autentificare</Text>
            <Text style={styles.cardSubtitle}>Continuă de unde ai rămas cu progresul tău.</Text>

            {error && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={18} color={TrainingColors.accentDanger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {registered === '1' && !error ? (
              <View style={styles.successBanner}>
                <Ionicons name="checkmark-circle" size={18} color={TrainingColors.accentTeal} />
                <Text style={styles.successText}>Cont creat. Autentifică-te cu emailul și parola ta.</Text>
              </View>
            ) : null}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={18} color={TrainingColors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="exemplu@email.com"
                  placeholderTextColor={TrainingColors.textMuted}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  textContentType="emailAddress"
                  editable={!isSubmitting}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.passwordLabelRow}>
                <Text style={[styles.label, styles.passwordLabel]}>Parolă</Text>
                <Pressable onPress={handlePasswordReset} disabled={isSubmitting}>
                  <Text style={styles.resetLink}>Ai uitat parola?</Text>
                </Pressable>
              </View>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={18} color={TrainingColors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Minimum 8 caractere"
                  placeholderTextColor={TrainingColors.textMuted}
                  secureTextEntry={!showPassword}
                  autoComplete="password"
                  textContentType="password"
                  editable={!isSubmitting}
                />
                <Pressable onPress={() => setShowPassword((v) => !v)} style={styles.eyeButton}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={TrainingColors.textMuted}
                  />
                </Pressable>
              </View>
            </View>

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: rememberMe }}
              disabled={isSubmitting}
              onPress={() => setRememberMe((value) => !value)}
              style={styles.rememberRow}
            >
              <Ionicons
                name={rememberMe ? 'checkbox' : 'square-outline'}
                size={22}
                color={rememberMe ? TrainingColors.accentTeal : TrainingColors.textMuted}
              />
              <View style={styles.rememberTextContainer}>
                <Text style={styles.rememberLabel}>Ține-mă minte</Text>
                <Text style={styles.rememberHint}>
                  Păstrează sesiunea securizat timp de maximum 7 zile.
                </Text>
              </View>
            </Pressable>

            <Pressable
              style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
              onPress={handleLogin}
              disabled={!canSubmit}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Text style={styles.submitButtonText}>Autentificare</Text>
                  <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                </>
              )}
            </Pressable>
          </View>

          {/* Register link */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Nu ai cont?</Text>
            <Pressable onPress={() => router.push('/register' as never)}>
              <Text style={styles.footerLink}> Creează unul</Text>
            </Pressable>
          </View>
          <View style={styles.trustRow}>
            <Ionicons name="lock-closed" size={12} color={TrainingColors.textMuted} />
            <Text style={styles.trustText}>Date protejate și progres salvat în siguranță</Text>
          </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TrainingColors.pageBase,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 44,
  },
  authShell: {
    width: '100%',
    maxWidth: 460,
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  iconContainer: {
    width: 84,
    height: 84,
    borderRadius: 27,
    backgroundColor: 'rgba(77, 228, 178, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(77, 228, 178, 0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    transform: [{ rotate: '4deg' }],
    shadowColor: TrainingColors.accentTeal,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
  iconInner: {
    width: 64,
    height: 64,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(77, 228, 178, 0.08)',
    transform: [{ rotate: '-4deg' }],
  },
  brandEyebrow: {
    color: TrainingColors.accentTeal,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.8,
    marginBottom: 5,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: TrainingColors.textPrimary,
    letterSpacing: -0.8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    color: TrainingColors.textSecondary,
    marginTop: 7,
    maxWidth: 350,
  },

  // Card
  card: {
    backgroundColor: 'rgba(13, 24, 40, 0.96)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: TrainingColors.borderStrong,
    padding: 26,
    ...TrainingShadows.floating,
  },
  cardEyebrow: {
    color: TrainingColors.accentTeal,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 5,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: TrainingColors.textPrimary,
    letterSpacing: -0.4,
  },
  cardSubtitle: {
    color: TrainingColors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 22,
  },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TrainingColors.failBg,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    color: TrainingColors.accentDanger,
    fontSize: 13,
    fontWeight: '500',
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TrainingColors.successBg,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  successText: {
    flex: 1,
    color: TrainingColors.accentTeal,
    fontSize: 13,
    fontWeight: '600',
  },

  // Inputs
  inputGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: TrainingColors.textSecondary,
    marginBottom: 8,
  },
  passwordLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  passwordLabel: {
    marginBottom: 0,
  },
  resetLink: {
    color: TrainingColors.accentBlue,
    fontSize: 12,
    fontWeight: '700',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TrainingColors.panelAlt,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    paddingHorizontal: 14,
    height: 54,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: TrainingColors.textPrimary,
    fontSize: 15,
    height: '100%',
  },
  eyeButton: {
    paddingLeft: 8,
    paddingVertical: 4,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 18,
  },
  rememberTextContainer: {
    flex: 1,
  },
  rememberLabel: {
    color: TrainingColors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  rememberHint: {
    color: TrainingColors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },

  // Submit
  submitButton: {
    backgroundColor: TrainingColors.buttonPrimary,
    borderRadius: 14,
    height: 54,
    flexDirection: 'row',
    gap: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
    shadowColor: TrainingColors.accentBlue,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 6,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  footerText: {
    color: TrainingColors.textMuted,
    fontSize: 14,
  },
  footerLink: {
    color: TrainingColors.accentTeal,
    fontSize: 14,
    fontWeight: '700',
  },
  trustRow: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  trustText: {
    color: TrainingColors.textMuted,
    fontSize: 11,
  },
});
