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

import { useAuth } from '@/features/auth/auth-context';
import { TrainingColors } from '@/features/training/ui-theme';

export default function LoginScreen() {
  const router = useRouter();
  const { registered } = useLocalSearchParams<{ registered?: string }>();
  const { login, resetPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      await login(email.trim().toLowerCase(), password);
      router.replace('/(tabs)/dashboard' as const);
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="shield-checkmark" size={48} color={TrainingColors.accentTeal} />
            </View>
            <Text style={styles.title}>CyberGuard</Text>
            <Text style={styles.subtitle}>Antrenament în securitate cibernetică</Text>
          </View>

          {/* Form */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Autentificare</Text>

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
              style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
              onPress={handleLogin}
              disabled={!canSubmit}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.submitButtonText}>Autentificare</Text>
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
    paddingHorizontal: 24,
    paddingVertical: 48,
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: 36,
  },
  iconContainer: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: 'rgba(69, 224, 177, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(69, 224, 177, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: TrainingColors.textPrimary,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 14,
    color: TrainingColors.textMuted,
    marginTop: 6,
  },

  // Card
  card: {
    backgroundColor: TrainingColors.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    padding: 24,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: TrainingColors.textPrimary,
    marginBottom: 20,
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    paddingHorizontal: 14,
    height: 50,
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

  // Submit
  submitButton: {
    backgroundColor: TrainingColors.buttonPrimary,
    borderRadius: 12,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
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
    color: TrainingColors.accentBlue,
    fontSize: 14,
    fontWeight: '600',
  },
});
