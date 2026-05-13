import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
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

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const passwordsMatch = password === confirmPassword;
  const canSubmit =
    displayName.trim().length >= 2 &&
    email.trim().length > 0 &&
    password.length >= 8 &&
    passwordsMatch &&
    !isSubmitting;

  const handleRegister = async () => {
    if (!canSubmit) {
      return;
    }

    if (!passwordsMatch) {
      setError('Parolele nu coincid.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await register(email.trim().toLowerCase(), password, displayName.trim());
      router.replace('/(tabs)/dashboard' as const);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Eroare la crearea contului.');
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
              <Ionicons name="person-add" size={44} color={TrainingColors.accentBlue} />
            </View>
            <Text style={styles.title}>Cont nou</Text>
            <Text style={styles.subtitle}>Începe antrenamentul tău cyber</Text>
          </View>

          {/* Form */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Înregistrare</Text>

            {error && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={18} color={TrainingColors.accentDanger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Nume afișat</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={18} color={TrainingColors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Cum vrei să te cheme?"
                  placeholderTextColor={TrainingColors.textMuted}
                  autoCapitalize="words"
                  autoComplete="name"
                  textContentType="name"
                  editable={!isSubmitting}
                />
              </View>
            </View>

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
              <Text style={styles.label}>Parolă</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={18} color={TrainingColors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Minimum 8 caractere"
                  placeholderTextColor={TrainingColors.textMuted}
                  secureTextEntry={!showPassword}
                  autoComplete="new-password"
                  textContentType="newPassword"
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

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirmă parola</Text>
              <View
                style={[
                  styles.inputWrapper,
                  confirmPassword.length > 0 && !passwordsMatch && styles.inputError,
                ]}
              >
                <Ionicons name="lock-open-outline" size={18} color={TrainingColors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Repetă parola"
                  placeholderTextColor={TrainingColors.textMuted}
                  secureTextEntry={!showPassword}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  editable={!isSubmitting}
                />
              </View>
              {confirmPassword.length > 0 && !passwordsMatch && (
                <Text style={styles.fieldError}>Parolele nu coincid</Text>
              )}
            </View>

            <Pressable
              style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
              onPress={handleRegister}
              disabled={!canSubmit}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.submitButtonText}>Creează cont</Text>
              )}
            </Pressable>
          </View>

          {/* Login link */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Ai deja cont?</Text>
            <Pressable onPress={() => router.back()}>
              <Text style={styles.footerLink}> Autentifică-te</Text>
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
    marginBottom: 32,
  },
  iconContainer: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: 'rgba(88, 166, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(88, 166, 255, 0.25)',
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

  // Inputs
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: TrainingColors.textSecondary,
    marginBottom: 8,
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
  inputError: {
    borderColor: TrainingColors.accentDanger,
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
  fieldError: {
    color: TrainingColors.accentDanger,
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
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
