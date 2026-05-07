import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { AttackType, DifficultyLevel } from '@/features/training/types';
import { TrainingColors } from '@/features/training/ui-theme';
import { useTrainingSession } from '@/features/training/useTrainingSession';

type Scenario = {
  id: string;
  type: string;
  title: string;
  description: string;
  difficulty: 'Ușor' | 'Mediu' | 'Greu';
  risk: 'Mediu' | 'Ridicat' | 'Critic';
  time: string;
  attackType: AttackType;
  backendDifficulty: DifficultyLevel;
  channel: 'Email' | 'SMS' | 'Vocal' | 'Web';
};

type RiskLevel = Scenario['risk'];

const scenarios: Scenario[] = [
  {
    id: 'phishing-easy',
    type: 'Phishing prin email',
    title: 'Cont suspendat — link suspect',
    description: 'Un email urgent care îți cere să verifici contul bancar prin link extern.',
    difficulty: 'Ușor',
    risk: 'Mediu',
    time: '3 min',
    attackType: 'phishing',
    backendDifficulty: 'easy',
    channel: 'Email',
  },
  {
    id: 'phishing-medium',
    type: 'Phishing prin email',
    title: 'Factură neachitată — portal fals',
    description: 'Un email despre o factură restantă cu link de autentificare neoficial.',
    difficulty: 'Mediu',
    risk: 'Ridicat',
    time: '4 min',
    attackType: 'phishing',
    backendDifficulty: 'medium',
    channel: 'Email',
  },
  {
    id: 'phishing-hard',
    type: 'Phishing prin email',
    title: 'Thread hijacking — document fals',
    description: 'Un răspuns într-o conversație existentă cu un document SharePoint fals.',
    difficulty: 'Greu',
    risk: 'Critic',
    time: '5 min',
    attackType: 'phishing',
    backendDifficulty: 'hard',
    channel: 'Email',
  },
  {
    id: 'smishing-easy',
    type: 'Escrocherie SMS',
    title: 'Colet nelivrat — link de plată',
    description: 'Un SMS de la un curier fals care cere plata unei taxe de redirectionare.',
    difficulty: 'Ușor',
    risk: 'Mediu',
    time: '3 min',
    attackType: 'smishing',
    backendDifficulty: 'easy',
    channel: 'SMS',
  },
  {
    id: 'smishing-medium',
    type: 'Escrocherie SMS',
    title: 'Rambursare ANAF — date personale',
    description: 'Un SMS care promite o rambursare și solicită date bancare.',
    difficulty: 'Mediu',
    risk: 'Ridicat',
    time: '4 min',
    attackType: 'smishing',
    backendDifficulty: 'medium',
    channel: 'SMS',
  },
  {
    id: 'smishing-hard',
    type: 'Escrocherie SMS',
    title: 'Alertă bancară — verificare identitate',
    description: 'Un SMS urgent de la bancă despre o tranzacție blocată.',
    difficulty: 'Greu',
    risk: 'Critic',
    time: '5 min',
    attackType: 'smishing',
    backendDifficulty: 'hard',
    channel: 'SMS',
  },
  {
    id: 'impersonation-easy',
    type: 'Impersonare',
    title: 'Suport IT fals — cod MFA',
    description: 'Cineva din "IT" cere codul de verificare primit pe telefon.',
    difficulty: 'Ușor',
    risk: 'Mediu',
    time: '3 min',
    attackType: 'impersonation',
    backendDifficulty: 'easy',
    channel: 'Vocal',
  },
  {
    id: 'impersonation-medium',
    type: 'Impersonare',
    title: 'Manager fals — gift card-uri',
    description: 'Un "manager" cere urgent cumpărarea de gift card-uri.',
    difficulty: 'Mediu',
    risk: 'Ridicat',
    time: '5 min',
    attackType: 'impersonation',
    backendDifficulty: 'medium',
    channel: 'Vocal',
  },
  {
    id: 'impersonation-hard',
    type: 'Impersonare',
    title: 'CFO fals — transfer urgent',
    description: 'Un apel de la "CFO" care cere un transfer bancar urgent și discret.',
    difficulty: 'Greu',
    risk: 'Critic',
    time: '7 min',
    attackType: 'impersonation',
    backendDifficulty: 'hard',
    channel: 'Vocal',
  },
];

const filters = ['Toate', 'Email', 'SMS', 'Vocal'] as const;

function riskFromStats(
  fallbackRisk: RiskLevel,
  value?: { attempts: number; accuracy: number }
): RiskLevel {
  if (!value || value.attempts < 2) {
    return fallbackRisk;
  }
  if (value.accuracy <= 40) return 'Critic';
  if (value.accuracy <= 65) return 'Ridicat';
  return 'Mediu';
}

export default function ScenariosScreen() {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<(typeof filters)[number]>('Toate');
  const { sessionId, perAttackStats, evaluation } = useTrainingSession();

  const perAttackMap = useMemo(
    () =>
      Object.fromEntries(
        perAttackStats.map((entry) => [entry.id, entry.value] as const)
      ) as Partial<Record<AttackType, (typeof perAttackStats)[number]['value']>>,
    [perAttackStats]
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const enriched = scenarios
      .map((scenario) => ({
        ...scenario,
        risk: riskFromStats(scenario.risk, perAttackMap[scenario.attackType]),
      }))
      .filter((scenario) => {
        const matchesFilter = activeFilter === 'Toate' || scenario.channel === activeFilter;
        const text = `${scenario.title} ${scenario.description} ${scenario.type}`.toLowerCase();
        return matchesFilter && text.includes(q);
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
  }, [activeFilter, evaluation?.recommendation, perAttackMap, query]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="shield-checkmark-outline" size={19} color="#EFF6FF" />
        </View>
        <View>
          <Text style={styles.title}>Laborator de antrenament</Text>
          <Text style={styles.subtitle}>Alege un scenariu și îți ascuți apărarea</Text>
        </View>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={TrainingColors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Caută scenarii"
          placeholderTextColor={TrainingColors.textMuted}
          style={styles.searchInput}
        />
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
        {filtered.map((scenario) => (
          <Link
            key={scenario.id}
            href={{
              pathname: '/chat/[scenarioId]',
              params: {
                scenarioId: scenario.id,
                attackType: scenario.attackType,
                difficulty: scenario.backendDifficulty,
                sessionId: sessionId ?? undefined,
              },
            }}
            asChild>
            <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
              <View style={styles.cardTop}>
                <Text style={styles.cardType}>{scenario.type}</Text>
                <RiskTag level={scenario.risk} />
              </View>
              <Text style={styles.cardTitle}>{scenario.title}</Text>
              <Text style={styles.cardDescription}>{scenario.description}</Text>
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
            </Pressable>
          </Link>
        ))}
      </View>
    </ScrollView>
  );
}

function RiskTag({ level }: { level: Scenario['risk'] }) {
  const tone = level === 'Critic' ? styles.riskCritical : level === 'Ridicat' ? styles.riskHigh : styles.riskMedium;
  const textTone = level === 'Critic' ? styles.riskTextCritical : level === 'Ridicat' ? styles.riskTextHigh : styles.riskTextMedium;
  return (
    <View style={[styles.riskPill, tone]}>
      <Text style={[styles.riskText, textTone]}>{level}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: TrainingColors.pageBase },
  content: { paddingHorizontal: 20, paddingTop: 50, paddingBottom: 130, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: TrainingColors.buttonPrimary,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: TrainingColors.textPrimary, fontSize: 24, fontWeight: '800' },
  subtitle: { color: TrainingColors.textSecondary, fontSize: 12 },
  searchBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: { flex: 1, color: TrainingColors.textPrimary, fontSize: 14 },
  filters: { gap: 8, paddingTop: 4, paddingBottom: 2 },
  filter: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  filterActive: { backgroundColor: TrainingColors.buttonPrimary, borderColor: TrainingColors.buttonPrimaryBorder },
  filterText: { color: TrainingColors.textSecondary, fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: '#EEF6FF' },
  list: { gap: 10, marginTop: 2 },
  sessionCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    padding: 10,
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
    backgroundColor: TrainingColors.panel,
    padding: 14,
    gap: 8,
  },
  cardPressed: { opacity: 0.92 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardType: {
    color: TrainingColors.accentTeal,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    fontSize: 10,
    fontWeight: '700',
  },
  cardTitle: { color: TrainingColors.textPrimary, fontSize: 17, fontWeight: '800' },
  cardDescription: { color: TrainingColors.textSecondary, fontSize: 13, lineHeight: 18 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: TrainingColors.textMuted, fontSize: 11 },
  metaDivider: { color: TrainingColors.textMuted, fontSize: 11 },
  riskPill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1 },
  riskText: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '800' },
  riskTextMedium: { color: TrainingColors.accentAmber },
  riskTextHigh: { color: TrainingColors.accentDanger },
  riskTextCritical: { color: TrainingColors.accentDanger },
  riskMedium: { borderColor: 'rgba(245,197,107,0.4)', backgroundColor: 'rgba(245,197,107,0.12)' },
  riskHigh: { borderColor: 'rgba(255,125,125,0.38)', backgroundColor: 'rgba(255,125,125,0.1)' },
  riskCritical: { borderColor: 'rgba(255,125,125,0.6)', backgroundColor: 'rgba(255,125,125,0.16)' },
});
