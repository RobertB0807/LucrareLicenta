import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { AppBackdrop } from '@/components/app-backdrop';
import { getDifficultyLabel } from '@/features/training/options';
import type { AttackType, DifficultyLevel } from '@/features/training/types';
import { TrainingColors, TrainingShadows } from '@/features/training/ui-theme';
import { useTrainingSession } from '@/features/training/useTrainingSession';

type Scenario = {
  id: string;
  type: string;
  title: string;
  description: string;
  difficulty: 'Ușor' | 'Mediu' | 'Greu';
  time: string;
  attackType: AttackType;
  backendDifficulty: DifficultyLevel;
  channel: 'Email' | 'SMS' | 'Vocal' | 'Web';
};

type DifficultyFilter = DifficultyLevel | 'all';

const filters = ['Toate', 'Email', 'SMS', 'Vocal'] as const;
const difficultyOrder: DifficultyLevel[] = ['easy', 'medium', 'hard'];
const DIFFICULTY_PRESENTATION: Record<
  DifficultyLevel,
  {
    label: string;
    subtitle: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    backgroundColor: string;
    borderColor: string;
  }
> = {
  easy: {
    label: 'Ușor',
    subtitle: 'Indicii evidente și decizii ghidate',
    icon: 'leaf-outline',
    color: '#45E0B1',
    backgroundColor: 'rgba(69, 224, 177, 0.12)',
    borderColor: 'rgba(69, 224, 177, 0.42)',
  },
  medium: {
    label: 'Mediu',
    subtitle: 'Context credibil și semnale discrete',
    icon: 'analytics-outline',
    color: '#F5A94A',
    backgroundColor: 'rgba(245, 169, 74, 0.12)',
    borderColor: 'rgba(245, 169, 74, 0.44)',
  },
  hard: {
    label: 'Greu',
    subtitle: 'Atacuri sofisticate și detalii subtile',
    icon: 'flame-outline',
    color: '#FF7D7D',
    backgroundColor: 'rgba(255, 125, 125, 0.12)',
    borderColor: 'rgba(255, 125, 125, 0.44)',
  },
};
const ATTACK_LABELS: Record<AttackType, string> = {
  phishing: 'Phishing prin email',
  smishing: 'Escrocherie SMS',
  impersonation: 'Impersonare',
};

function channelLabel(channel: string): Scenario['channel'] {
  if (channel === 'email') return 'Email';
  if (channel === 'sms') return 'SMS';
  if (channel === 'phone' || channel === 'call') return 'Vocal';
  return 'Web';
}

function estimateTimeByDifficulty(difficulty: DifficultyLevel): string {
  if (difficulty === 'hard') return '6 min';
  if (difficulty === 'medium') return '4 min';
  return '3 min';
}

function buildScenarioTitle(description: string, attackType: AttackType, difficulty: DifficultyLevel): string {
  const firstSentence = description.split('.').map((item) => item.trim()).find(Boolean);
  if (firstSentence) {
    return firstSentence.length > 58 ? `${firstSentence.slice(0, 55)}...` : firstSentence;
  }
  return `${ATTACK_LABELS[attackType]} · ${getDifficultyLabel(difficulty)}`;
}

export default function ScenariosScreen() {
  const { width } = useWindowDimensions();
  const isCompact = width < 360;
  const contentInsets = useMemo(
    () => ({
      paddingHorizontal: isCompact ? 16 : 20,
      paddingTop: isCompact ? 40 : 50,
      paddingBottom: isCompact ? 110 : 130,
      gap: isCompact ? 10 : 12,
    }),
    [isCompact]
  );
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<(typeof filters)[number]>('Toate');
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>('all');
  const { sessionId, evaluation, scenarioCatalog, isLoadingCatalog, catalogError } =
    useTrainingSession();

  const scenarios = useMemo<Scenario[]>(
    () =>
      scenarioCatalog.map((item) => {
        const description = item.attacker_message_preview;
        return {
          id: item.id,
          type: ATTACK_LABELS[item.attack_type],
          title: buildScenarioTitle(description, item.attack_type, item.difficulty),
          description,
          difficulty: getDifficultyLabel(item.difficulty) as Scenario['difficulty'],
          time: estimateTimeByDifficulty(item.difficulty),
          attackType: item.attack_type,
          backendDifficulty: item.difficulty,
          channel: channelLabel(item.channel),
        };
      }),
    [scenarioCatalog]
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const enriched = scenarios
      .filter((scenario) => {
        const matchesFilter = activeFilter === 'Toate' || scenario.channel === activeFilter;
        const matchesDifficulty =
          difficultyFilter === 'all' || scenario.backendDifficulty === difficultyFilter;
        const text = `${scenario.title} ${scenario.description} ${scenario.type}`.toLowerCase();
        return matchesFilter && matchesDifficulty && text.includes(q);
      });

    if (!evaluation?.recommendation) {
      return enriched;
    }

    const rec = evaluation.recommendation;
    return enriched.sort((a, b) => {
      const aRecommended = a.attackType === rec.attack_type && a.backendDifficulty === rec.difficulty;
      const bRecommended = b.attackType === rec.attack_type && b.backendDifficulty === rec.difficulty;
      return Number(bRecommended) - Number(aRecommended);
    });
  }, [activeFilter, difficultyFilter, evaluation?.recommendation, query, scenarios]);

  const groupedScenarios = useMemo(
    () =>
      difficultyOrder
        .map((level) => ({
          level,
          items: filtered.filter((scenario) => scenario.backendDifficulty === level),
        }))
        .filter((group) => group.items.length > 0),
    [filtered]
  );

  return (
    <View style={styles.screen}>
      <AppBackdrop grid />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, contentInsets]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="shield-checkmark-outline" size={19} color="#EFF6FF" />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>SIMULĂRI INTERACTIVE</Text>
          <Text style={[styles.title, isCompact && styles.titleCompact]}>Laborator de antrenament</Text>
          <Text style={[styles.subtitle, isCompact && styles.subtitleCompact]}>
            Exersează decizii sigure în situații realiste
          </Text>
        </View>
      </View>

      <View style={[styles.searchBox, isCompact && styles.searchBoxCompact]}>
        <Ionicons name="search" size={16} color={TrainingColors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Caută scenarii"
          placeholderTextColor={TrainingColors.textMuted}
          style={styles.searchInput}
        />
        {query ? (
          <Pressable
            accessibilityLabel="Șterge căutarea"
            onPress={() => setQuery('')}
            hitSlop={10}
            style={({ pressed }) => [styles.clearSearch, pressed && styles.cardPressed]}>
            <Ionicons name="close-circle" size={18} color={TrainingColors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {filters.map((f) => {
          const active = f === activeFilter;
          return (
            <Pressable
              key={f}
              onPress={() => setActiveFilter(f)}
              style={[styles.filter, active ? styles.filterActive : null]}>
              <Text style={[styles.filterText, active ? styles.filterTextActive : null]}>{f}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.selectorHeader}>
        <Text style={styles.selectorLabel}>Dificultate</Text>
        <Text style={styles.resultCount}>
          {filtered.length} {filtered.length === 1 ? 'scenariu' : 'scenarii'}
        </Text>
      </View>

      <View style={styles.levelSelector}>
        <Pressable
          onPress={() => setDifficultyFilter('all')}
          style={[styles.levelButton, difficultyFilter === 'all' && styles.levelButtonActive]}>
          <Text
            style={[
              styles.levelButtonText,
              difficultyFilter === 'all' && styles.levelButtonTextActive,
            ]}>
            Toate
          </Text>
        </Pressable>
        {difficultyOrder.map((level) => {
          const active = difficultyFilter === level;
          const presentation = DIFFICULTY_PRESENTATION[level];
          return (
            <Pressable
              key={level}
              onPress={() => setDifficultyFilter(level)}
              style={[
                styles.levelButton,
                active && {
                  backgroundColor: presentation.backgroundColor,
                  borderColor: presentation.borderColor,
                },
              ]}>
              <View style={[styles.levelDot, { backgroundColor: presentation.color }]} />
              <Text
                style={[
                  styles.levelButtonText,
                  active && { color: presentation.color },
                ]}>
                {presentation.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {sessionId ? (
        <View style={styles.sessionCard}>
          <View style={styles.sessionIcon}>
            <Ionicons name="sync-outline" size={14} color={TrainingColors.accentTeal} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sessionTitle}>Sesiune activă conectată</Text>
            <Text style={styles.sessionMeta}>Scenariile următoare vor continua sesiunea curentă.</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.list}>
        {catalogError ? (
          <View style={styles.sessionCard}>
            <Text style={styles.sessionMeta}>{catalogError}</Text>
          </View>
        ) : null}
        {isLoadingCatalog ? (
          <View style={styles.sessionCard}>
            <Text style={styles.sessionMeta}>Se încarcă scenariile...</Text>
          </View>
        ) : null}
        {!isLoadingCatalog && filtered.length === 0 ? (
          <View style={styles.sessionCard}>
            <Text style={styles.sessionMeta}>Nu există scenarii pentru filtrul curent.</Text>
          </View>
        ) : null}
        {groupedScenarios.map((group) => {
          const presentation = DIFFICULTY_PRESENTATION[group.level];
          return (
            <View key={group.level} style={styles.levelSection}>
              <View style={styles.levelHeader}>
                <View
                  style={[
                    styles.levelHeaderIcon,
                    {
                      backgroundColor: presentation.backgroundColor,
                      borderColor: presentation.borderColor,
                    },
                  ]}>
                  <Ionicons name={presentation.icon} size={16} color={presentation.color} />
                </View>
                <View style={styles.levelHeaderText}>
                  <Text style={[styles.levelTitle, { color: presentation.color }]}>
                    {presentation.label}
                  </Text>
                  <Text style={styles.levelSubtitle}>{presentation.subtitle}</Text>
                </View>
                <Text style={styles.levelCount}>{group.items.length}</Text>
              </View>

              {group.items.map((scenario) => {
                const recommended =
                  evaluation?.recommendation?.attack_type === scenario.attackType &&
                  evaluation.recommendation.difficulty === scenario.backendDifficulty;
                return (
                  <Link
                    key={scenario.id}
                    href={{
                      pathname: '/chat/[scenarioId]',
                      params: {
                        scenarioId: scenario.id,
                        templateId: scenario.id,
                        attackType: scenario.attackType,
                        difficulty: scenario.backendDifficulty,
                        sessionId: sessionId ?? undefined,
                      },
                    }}
                    asChild>
                    <Pressable
                      style={({ pressed }) => [
                        styles.card,
                        isCompact && styles.cardCompact,
                        recommended && styles.cardRecommended,
                        pressed && styles.cardPressed,
                      ]}>
                      <View style={styles.cardTop}>
                        <Text style={styles.cardType}>{scenario.type}</Text>
                        <View style={styles.cardTags}>
                          {recommended ? (
                            <View style={styles.recommendedPill}>
                              <Text style={styles.recommendedText}>Recomandat</Text>
                            </View>
                          ) : null}
                          <DifficultyTag level={scenario.backendDifficulty} />
                        </View>
                      </View>
                      <Text style={[styles.cardTitle, isCompact && styles.cardTitleCompact]}>
                        {scenario.title}
                      </Text>
                      <Text style={[styles.cardDescription, isCompact && styles.cardDescriptionCompact]}>
                        {scenario.description}
                      </Text>
                      <View style={styles.cardFooter}>
                        <View style={styles.cardMeta}>
                          <View style={styles.metaItem}>
                            <Ionicons name="pulse-outline" size={12} color={TrainingColors.textMuted} />
                            <Text style={styles.metaText}>{scenario.difficulty}</Text>
                          </View>
                          <Text style={styles.metaDivider}>|</Text>
                          <View style={styles.metaItem}>
                            <Ionicons name="time-outline" size={12} color={TrainingColors.textMuted} />
                            <Text style={styles.metaText}>{scenario.time}</Text>
                          </View>
                        </View>
                        <Ionicons name="arrow-forward" size={15} color={TrainingColors.accentTeal} />
                      </View>
                    </Pressable>
                  </Link>
                );
              })}
            </View>
          );
        })}
      </View>
      </ScrollView>
    </View>
  );
}

function DifficultyTag({ level }: { level: DifficultyLevel }) {
  const presentation = DIFFICULTY_PRESENTATION[level];
  return (
    <View
      style={[
        styles.difficultyPill,
        {
          borderColor: presentation.borderColor,
          backgroundColor: presentation.backgroundColor,
        },
      ]}>
      <View style={[styles.difficultyDot, { backgroundColor: presentation.color }]} />
      <Text style={[styles.difficultyTagText, { color: presentation.color }]}>
        {presentation.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: TrainingColors.pageBase },
  scroll: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 20, paddingTop: 50, paddingBottom: 130, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  headerCopy: { flex: 1 },
  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: TrainingColors.buttonPrimary,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: TrainingColors.accentBlue,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 5,
  },
  eyebrow: {
    color: TrainingColors.accentTeal,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 2,
  },
  title: { color: TrainingColors.textPrimary, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: TrainingColors.textSecondary, fontSize: 12, marginTop: 2 },
  titleCompact: { fontSize: 21 },
  subtitleCompact: { fontSize: 11 },
  searchBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TrainingColors.borderStrong,
    backgroundColor: 'rgba(13, 24, 40, 0.94)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...TrainingShadows.card,
  },
  searchBoxCompact: { paddingVertical: 8 },
  searchInput: { flex: 1, color: TrainingColors.textPrimary, fontSize: 14 },
  clearSearch: { padding: 2 },
  filters: { gap: 8, paddingTop: 4, paddingBottom: 2 },
  selectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginTop: 2,
  },
  selectorLabel: {
    color: TrainingColors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  resultCount: {
    color: TrainingColors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  filter: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: 'rgba(13, 24, 40, 0.9)',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filterActive: { backgroundColor: TrainingColors.buttonPrimary, borderColor: TrainingColors.buttonPrimaryBorder },
  filterText: { color: TrainingColors.textSecondary, fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: '#EEF6FF' },
  levelSelector: {
    flexDirection: 'row',
    gap: 6,
    padding: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: 'rgba(13, 24, 40, 0.94)',
    ...TrainingShadows.card,
  },
  levelButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  levelButtonActive: {
    backgroundColor: 'rgba(245, 197, 107, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(245, 197, 107, 0.38)',
  },
  levelButtonText: {
    color: TrainingColors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  levelButtonTextActive: { color: '#FFE7BA' },
  levelDot: { width: 6, height: 6, borderRadius: 3 },
  list: { gap: 10, marginTop: 2 },
  levelSection: { gap: 9, marginTop: 4 },
  levelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 5,
    paddingHorizontal: 2,
  },
  levelHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  levelHeaderText: { flex: 1 },
  levelTitle: { color: TrainingColors.textPrimary, fontSize: 15, fontWeight: '800' },
  levelSubtitle: { color: TrainingColors.textMuted, fontSize: 10, marginTop: 1 },
  levelCount: {
    minWidth: 25,
    textAlign: 'center',
    color: TrainingColors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 7,
    backgroundColor: TrainingColors.panelSoft,
  },
  sessionCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: 'rgba(13, 24, 40, 0.9)',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    padding: 12,
    ...TrainingShadows.card,
  },
  sessionIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(69,224,177,0.12)',
  },
  sessionTitle: { color: TrainingColors.textPrimary, fontSize: 12, fontWeight: '700' },
  sessionMeta: { color: TrainingColors.textSecondary, fontSize: 11, marginTop: 1 },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: 'rgba(13, 24, 40, 0.94)',
    padding: 16,
    gap: 9,
    ...TrainingShadows.card,
  },
  cardCompact: { padding: 12, gap: 6 },
  cardPressed: { opacity: 0.92 },
  cardRecommended: {
    borderColor: 'rgba(69, 224, 177, 0.55)',
    backgroundColor: 'rgba(18, 46, 53, 0.97)',
    shadowColor: TrainingColors.accentTeal,
    shadowOpacity: 0.16,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTags: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardType: {
    color: TrainingColors.accentTeal,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    fontSize: 10,
    fontWeight: '700',
  },
  cardTitle: { color: TrainingColors.textPrimary, fontSize: 17, fontWeight: '800' },
  cardTitleCompact: { fontSize: 15 },
  cardDescription: { color: TrainingColors.textSecondary, fontSize: 13, lineHeight: 18 },
  cardDescriptionCompact: { fontSize: 12, lineHeight: 16 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: TrainingColors.textMuted, fontSize: 11 },
  metaDivider: { color: TrainingColors.textMuted, fontSize: 11 },
  difficultyPill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  difficultyDot: { width: 5, height: 5, borderRadius: 3 },
  difficultyTagText: {
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '800',
  },
  recommendedPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(69, 224, 177, 0.45)',
    backgroundColor: 'rgba(69, 224, 177, 0.12)',
  },
  recommendedText: {
    color: TrainingColors.accentTeal,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '800',
  },
});
