import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { TrainingColors, TrainingShadows } from '@/features/training/ui-theme';

type StateTone = 'neutral' | 'info' | 'warning' | 'danger';

type StateCardProps = {
  icon?: keyof typeof Ionicons.glyphMap;
  title?: string;
  message: string;
  loading?: boolean;
  tone?: StateTone;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
};

function toneColor(tone: StateTone): string {
  if (tone === 'danger') return TrainingColors.accentDanger;
  if (tone === 'warning') return TrainingColors.accentAmber;
  if (tone === 'info') return TrainingColors.accentTeal;
  return TrainingColors.textMuted;
}

export function StateCard({
  icon,
  title,
  message,
  loading,
  tone = 'neutral',
  actionLabel,
  onAction,
  compact,
}: StateCardProps) {
  const accent = toneColor(tone);

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={[styles.iconShell, { borderColor: `${accent}4D`, backgroundColor: `${accent}1A` }]}>
        {loading ? (
          <ActivityIndicator color={accent} size="small" />
        ) : (
          <Ionicons name={icon ?? 'information-circle-outline'} size={compact ? 17 : 20} color={accent} />
        )}
      </View>
      <View style={styles.copy}>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        <Text style={styles.message}>{message}</Text>
      </View>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: 'rgba(13, 24, 40, 0.92)',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...TrainingShadows.card,
  },
  cardCompact: {
    padding: 10,
    gap: 8,
  },
  iconShell: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0 },
  title: {
    color: TrainingColors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  message: {
    color: TrainingColors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  action: {
    minHeight: 34,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(77, 228, 178, 0.32)',
    backgroundColor: 'rgba(77, 228, 178, 0.08)',
    paddingHorizontal: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    color: TrainingColors.accentTeal,
    fontSize: 11,
    fontWeight: '800',
  },
  pressed: { opacity: 0.82 },
});
