import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { ATTACK_TYPE_OPTIONS, DIFFICULTY_OPTIONS } from '@/features/training/options';
import type { AttackType, DifficultyLevel } from '@/features/training/types';
import { TrainingColors } from '@/features/training/ui-theme';

type ScenarioSetupCardProps = {
  attackType: AttackType;
  difficulty: DifficultyLevel;
  onSelectAttackType: (value: AttackType) => void;
  onSelectDifficulty: (value: DifficultyLevel) => void;
  onGenerateScenario: () => void;
};

const ATTACK_ICONS: Record<AttackType, string> = {
  phishing: '✉',
  smishing: '📲',
  impersonation: '🎭',
};

export function ScenarioSetupCard({
  attackType,
  difficulty,
  onSelectAttackType,
  onSelectDifficulty,
  onGenerateScenario,
}: ScenarioSetupCardProps) {
  return (
    <View style={styles.configCard}>
      <View style={styles.scanlineTop} />

      <ThemedText type="subtitle" style={styles.blockTitle}>
        Configurare misiune
      </ThemedText>
      <ThemedText style={styles.blockSubtitle}>
        Configureaza vectorul de atac si nivelul de dificultate pentru simularea curenta.
      </ThemedText>

      <ThemedText style={styles.blockLabel}>VECTOR DE ATAC</ThemedText>
      <View style={styles.selectorRow}>
        {ATTACK_TYPE_OPTIONS.map((option) => {
          const isSelected = attackType === option.id;
          return (
            <Pressable
              key={option.id}
              style={[styles.attackChip, isSelected && styles.attackChipSelected]}
              onPress={() => onSelectAttackType(option.id)}>
              <ThemedText style={styles.attackIcon}>{ATTACK_ICONS[option.id]}</ThemedText>
              <View style={styles.attackTextWrap}>
                <ThemedText style={[styles.attackChipTitle, isSelected && styles.attackChipTitleSelected]}>
                  {option.shortLabel}
                </ThemedText>
                <ThemedText style={[styles.attackChipSubtitle, isSelected && styles.attackChipSubtitleSelected]}>
                  {option.label}
                </ThemedText>
              </View>
            </Pressable>
          );
        })}
      </View>

      <ThemedText style={styles.blockLabel}>DIFICULTATE</ThemedText>
      <View style={styles.difficultyRow}>
        {DIFFICULTY_OPTIONS.map((option, index) => {
          const isSelected = difficulty === option.id;
          return (
            <Pressable
              key={option.id}
              style={[styles.difficultyButton, isSelected && styles.difficultyButtonSelected]}
              onPress={() => onSelectDifficulty(option.id)}>
              <View style={styles.difficultyBarsRow}>
                {[0, 1, 2].map((barIndex) => {
                  const isActive = barIndex <= index;
                  return (
                    <View
                      key={`${option.id}-${barIndex}`}
                      style={[
                        styles.difficultyBar,
                        isActive && styles.difficultyBarActive,
                        isSelected && styles.difficultyBarSelected,
                      ]}
                    />
                  );
                })}
              </View>
              <ThemedText style={[styles.difficultyText, isSelected && styles.difficultyTextSelected]}>
                {option.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <Pressable style={styles.primaryButton} onPress={onGenerateScenario}>
        <ThemedText type="defaultSemiBold" style={styles.primaryButtonText}>
          Pornește scenariul
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  configCard: {
    borderRadius: 16,
    padding: 14,
    gap: 10,
    backgroundColor: TrainingColors.panel,
    borderWidth: 1,
    borderColor: TrainingColors.borderStrong,
    overflow: 'hidden',
  },
  scanlineTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 2,
    backgroundColor: TrainingColors.accentTeal,
  },
  blockTitle: {
    color: TrainingColors.textPrimary,
    fontSize: 20,
    fontFamily: Fonts.rounded,
  },
  blockSubtitle: {
    color: TrainingColors.textSecondary,
  },
  blockLabel: {
    color: TrainingColors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: Fonts.mono,
  },
  selectorRow: {
    gap: 8,
  },
  attackChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: TrainingColors.panelAlt,
  },
  attackChipSelected: {
    borderColor: TrainingColors.accentBlue,
    backgroundColor: 'rgba(88, 166, 255, 0.12)',
  },
  attackIcon: {
    fontSize: 18,
  },
  attackTextWrap: {
    flex: 1,
    gap: 1,
  },
  attackChipTitle: {
    color: TrainingColors.textPrimary,
    fontWeight: '700',
    fontFamily: Fonts.rounded,
  },
  attackChipTitleSelected: {
    color: '#CFE7FF',
  },
  attackChipSubtitle: {
    color: TrainingColors.textMuted,
    fontSize: 12,
  },
  attackChipSubtitleSelected: {
    color: '#9FC4F5',
  },
  difficultyRow: {
    flexDirection: 'row',
    gap: 8,
  },
  difficultyButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: TrainingColors.panelAlt,
    alignItems: 'center',
    gap: 7,
  },
  difficultyButtonSelected: {
    borderColor: TrainingColors.accentAmber,
    backgroundColor: 'rgba(245, 197, 107, 0.14)',
  },
  difficultyBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    minHeight: 14,
  },
  difficultyBar: {
    width: 7,
    height: 6,
    borderRadius: 2,
    backgroundColor: '#3D4C68',
  },
  difficultyBarActive: {
    backgroundColor: '#8FA9D5',
  },
  difficultyBarSelected: {
    backgroundColor: TrainingColors.accentAmber,
  },
  difficultyText: {
    color: TrainingColors.textSecondary,
    fontSize: 13,
    fontFamily: Fonts.mono,
  },
  difficultyTextSelected: {
    color: '#FFE7BA',
    fontWeight: '700',
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: TrainingColors.buttonPrimary,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
    marginTop: 2,
  },
  primaryButtonText: {
    color: '#EEF4FF',
    fontFamily: Fonts.mono,
    letterSpacing: 0.8,
  },
});
