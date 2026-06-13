import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
import { useTrainingSession } from '@/features/training/useTrainingSession';

export default function ProfileScreen() {
  const { user, updateProfile, deleteAccount, resetPassword, logout } = useAuth();
  const { stats, adaptiveProfile, learningPath } = useTrainingSession();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(user?.displayName ?? '');
  }, [user?.displayName]);

  const initials = useMemo(() => {
    const source = user?.displayName.trim() || user?.email || '?';
    return source
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }, [user?.displayName, user?.email]);

  const normalizedName = displayName.trim();
  const canSave =
    normalizedName.length >= 2 &&
    normalizedName.length <= 64 &&
    normalizedName !== user?.displayName &&
    !isSaving;
  const canDelete = deleteConfirmation.trim().toUpperCase() === 'STERGE' && !isDeleting;

  const saveProfile = async () => {
    if (!canSave) {
      return;
    }
    setError(null);
    setSuccess(null);
    setIsSaving(true);
    try {
      await updateProfile(normalizedName);
      setSuccess('Numele afișat a fost actualizat.');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Nu am putut actualiza profilul.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const sendPasswordReset = async () => {
    if (!user?.email || isResettingPassword) {
      return;
    }
    setError(null);
    setSuccess(null);
    setIsResettingPassword(true);
    try {
      await resetPassword(user.email);
      setSuccess('Am trimis instrucțiunile de resetare pe email.');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Nu am putut trimite emailul de resetare.'
      );
    } finally {
      setIsResettingPassword(false);
    }
  };

  const signOut = async () => {
    setIsLoggingOut(true);
    await logout().catch(() => undefined);
    router.replace('/login');
  };

  const removeAccount = async () => {
    if (!canDelete) {
      return;
    }
    setError(null);
    setSuccess(null);
    setIsDeleting(true);
    try {
      await deleteAccount();
      router.replace('/login');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Nu am putut șterge contul.'
      );
      setIsDeleting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Înapoi"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <Ionicons name="arrow-back" size={20} color={TrainingColors.textPrimary} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Profil și setări</Text>
          <Text style={styles.subtitle}>Contul și progresul tău</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.profileName}>{user?.displayName}</Text>
          <Text style={styles.profileEmail}>{user?.email}</Text>
          <View style={styles.levelPill}>
            <Ionicons name="shield-checkmark" size={14} color={TrainingColors.accentTeal} />
            <Text style={styles.levelPillText}>Nivel {learningPath?.level ?? 1}</Text>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <Metric value={`${learningPath?.xp ?? 0}`} label="XP" icon="flash-outline" />
          <Metric
            value={`${adaptiveProfile?.overall_mastery ?? stats.accuracy}%`}
            label="Mastery"
            icon="analytics-outline"
          />
          <Metric
            value={`${learningPath?.longest_streak ?? 0}`}
            label="Record zile"
            icon="flame-outline"
          />
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color={TrainingColors.accentDanger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        {success ? (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={18} color={TrainingColors.accentTeal} />
            <Text style={styles.successText}>{success}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Ionicons name="person-outline" size={19} color={TrainingColors.accentTeal} />
            <Text style={styles.sectionTitle}>Date profil</Text>
          </View>
          <Text style={styles.label}>Nume afișat</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="create-outline" size={18} color={TrainingColors.textMuted} />
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              style={styles.input}
              placeholder="Numele tău"
              placeholderTextColor={TrainingColors.textMuted}
              maxLength={64}
              autoCapitalize="words"
              editable={!isSaving}
            />
          </View>
          <Text style={styles.fieldHint}>Între 2 și 64 de caractere.</Text>
          <Pressable
            disabled={!canSave}
            onPress={() => void saveProfile()}
            style={({ pressed }) => [
              styles.primaryButton,
              !canSave && styles.disabledButton,
              pressed && canSave && styles.pressed,
            ]}>
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="save-outline" size={17} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>Salvează modificarea</Text>
              </>
            )}
          </Pressable>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Ionicons name="settings-outline" size={19} color={TrainingColors.accentBlue} />
            <Text style={styles.sectionTitle}>Securitatea contului</Text>
          </View>
          <SettingAction
            icon="key-outline"
            title="Resetează parola"
            detail="Primești un link securizat pe adresa de email."
            isLoading={isResettingPassword}
            onPress={() => void sendPasswordReset()}
          />
          <View style={styles.divider} />
          <SettingAction
            icon="log-out-outline"
            title="Deconectare"
            detail="Închide sesiunea curentă de pe acest dispozitiv."
            isLoading={isLoggingOut}
            onPress={() => void signOut()}
          />
        </View>

        <View style={[styles.section, styles.dangerSection]}>
          <View style={styles.sectionHeading}>
            <Ionicons name="warning-outline" size={19} color={TrainingColors.accentDanger} />
            <Text style={[styles.sectionTitle, styles.dangerTitle]}>Zonă sensibilă</Text>
          </View>
          <Text style={styles.dangerText}>
            Ștergerea contului elimină definitiv sesiunile, progresul, rezultatele și
            identitatea de autentificare.
          </Text>

          {!showDeleteConfirmation ? (
            <Pressable
              onPress={() => {
                setShowDeleteConfirmation(true);
                setError(null);
                setSuccess(null);
              }}
              style={({ pressed }) => [styles.dangerButton, pressed && styles.pressed]}>
              <Ionicons name="trash-outline" size={17} color={TrainingColors.accentDanger} />
              <Text style={styles.dangerButtonText}>Șterge contul</Text>
            </Pressable>
          ) : (
            <View style={styles.confirmationBox}>
              <Text style={styles.confirmationTitle}>Confirmare necesară</Text>
              <Text style={styles.confirmationText}>
                Scrie <Text style={styles.confirmationCode}>STERGE</Text> pentru a continua.
              </Text>
              <TextInput
                value={deleteConfirmation}
                onChangeText={setDeleteConfirmation}
                style={styles.confirmationInput}
                placeholder="STERGE"
                placeholderTextColor={TrainingColors.textMuted}
                autoCapitalize="characters"
                editable={!isDeleting}
              />
              <View style={styles.confirmationActions}>
                <Pressable
                  disabled={isDeleting}
                  onPress={() => {
                    setShowDeleteConfirmation(false);
                    setDeleteConfirmation('');
                  }}
                  style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
                  <Text style={styles.cancelButtonText}>Renunță</Text>
                </Pressable>
                <Pressable
                  disabled={!canDelete}
                  onPress={() => void removeAccount()}
                  style={({ pressed }) => [
                    styles.confirmDeleteButton,
                    !canDelete && styles.disabledButton,
                    pressed && canDelete && styles.pressed,
                  ]}>
                  {isDeleting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.confirmDeleteText}>Șterge definitiv</Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Metric({
  value,
  label,
  icon,
}: {
  value: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.metricCard}>
      <Ionicons name={icon} size={17} color={TrainingColors.accentTeal} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function SettingAction({
  icon,
  title,
  detail,
  isLoading,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  isLoading: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={isLoading}
      onPress={onPress}
      style={({ pressed }) => [styles.settingAction, pressed && styles.pressed]}>
      <View style={styles.settingIcon}>
        <Ionicons name={icon} size={19} color={TrainingColors.textPrimary} />
      </View>
      <View style={styles.settingText}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingDetail}>{detail}</Text>
      </View>
      {isLoading ? (
        <ActivityIndicator size="small" color={TrainingColors.accentTeal} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={TrainingColors.textMuted} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: TrainingColors.pageBase },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panelAlt,
  },
  headerText: { flex: 1, alignItems: 'center' },
  headerSpacer: { width: 40 },
  title: { color: TrainingColors.textPrimary, fontSize: 18, fontWeight: '800' },
  subtitle: { color: TrainingColors.textSecondary, fontSize: 11, marginTop: 2 },
  content: { padding: 20, paddingBottom: 60, gap: 14 },
  profileCard: {
    alignItems: 'center',
    padding: 22,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(69, 224, 177, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(69, 224, 177, 0.35)',
    marginBottom: 12,
  },
  avatarText: { color: TrainingColors.accentTeal, fontSize: 26, fontWeight: '900' },
  profileName: { color: TrainingColors.textPrimary, fontSize: 21, fontWeight: '800' },
  profileEmail: { color: TrainingColors.textSecondary, fontSize: 12, marginTop: 3 },
  levelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: TrainingColors.successBg,
  },
  levelPillText: { color: TrainingColors.accentTeal, fontSize: 11, fontWeight: '800' },
  metricsRow: { flexDirection: 'row', gap: 8 },
  metricCard: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 13,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
  },
  metricValue: { color: TrainingColors.textPrimary, fontSize: 17, fontWeight: '800' },
  metricLabel: { color: TrainingColors.textSecondary, fontSize: 9, textAlign: 'center' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: TrainingColors.failBg,
    borderWidth: 1,
    borderColor: 'rgba(255, 125, 125, 0.35)',
  },
  errorText: { flex: 1, color: TrainingColors.accentDanger, fontSize: 12, lineHeight: 17 },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: TrainingColors.successBg,
    borderWidth: 1,
    borderColor: 'rgba(69, 224, 177, 0.35)',
  },
  successText: { flex: 1, color: TrainingColors.accentTeal, fontSize: 12 },
  section: {
    padding: 16,
    gap: 11,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
  },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { color: TrainingColors.textPrimary, fontSize: 15, fontWeight: '800' },
  label: { color: TrainingColors.textSecondary, fontSize: 11, fontWeight: '700' },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    minHeight: 48,
    paddingHorizontal: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TrainingColors.borderStrong,
    backgroundColor: TrainingColors.panelAlt,
  },
  input: { flex: 1, color: TrainingColors.textPrimary, fontSize: 14, paddingVertical: 12 },
  fieldHint: { color: TrainingColors.textMuted, fontSize: 10 },
  primaryButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: TrainingColors.buttonPrimary,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  disabledButton: { opacity: 0.45 },
  settingAction: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 54 },
  settingIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TrainingColors.panelSoft,
  },
  settingText: { flex: 1 },
  settingTitle: { color: TrainingColors.textPrimary, fontSize: 13, fontWeight: '700' },
  settingDetail: {
    color: TrainingColors.textSecondary,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 2,
  },
  divider: { height: 1, backgroundColor: TrainingColors.border },
  dangerSection: {
    borderColor: 'rgba(255, 125, 125, 0.35)',
    backgroundColor: 'rgba(255, 125, 125, 0.05)',
  },
  dangerTitle: { color: TrainingColors.accentDanger },
  dangerText: { color: TrainingColors.textSecondary, fontSize: 11, lineHeight: 17 },
  dangerButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 125, 125, 0.45)',
    backgroundColor: TrainingColors.failBg,
  },
  dangerButtonText: { color: TrainingColors.accentDanger, fontSize: 13, fontWeight: '800' },
  confirmationBox: {
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: TrainingColors.panelAlt,
  },
  confirmationTitle: { color: TrainingColors.textPrimary, fontSize: 13, fontWeight: '800' },
  confirmationText: { color: TrainingColors.textSecondary, fontSize: 11 },
  confirmationCode: { color: TrainingColors.accentDanger, fontWeight: '900' },
  confirmationInput: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 125, 125, 0.45)',
    backgroundColor: TrainingColors.pageBase,
    color: TrainingColors.textPrimary,
    fontWeight: '800',
    letterSpacing: 1,
  },
  confirmationActions: { flexDirection: 'row', gap: 8 },
  cancelButton: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TrainingColors.border,
  },
  cancelButtonText: { color: TrainingColors.textSecondary, fontSize: 12, fontWeight: '700' },
  confirmDeleteButton: {
    flex: 1.4,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#C94444',
  },
  confirmDeleteText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  pressed: { opacity: 0.72 },
});
