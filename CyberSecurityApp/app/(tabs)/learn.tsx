import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { TrainingColors } from '@/features/training/ui-theme';

type Lesson = {
  id: string;
  category: 'Phishing' | 'Smishing' | 'Vishing' | 'Web Scams' | 'Account Safety' | 'Fundamentals';
  title: string;
  summary: string;
  minutes: number;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
};

const lessons: Lesson[] = [
  {
    id: 'phishing-101',
    category: 'Fundamentals',
    title: 'Phishing 101: How attackers think',
    summary: 'Understand the psychology behind phishing: urgency, authority, and curiosity.',
    minutes: 4,
    level: 'Beginner',
  },
  {
    id: 'email-red-flags',
    category: 'Phishing',
    title: 'Spotting email red flags',
    summary: 'Look-alike domains, mismatched sender names, urgent CTAs, and weaponized attachments.',
    minutes: 5,
    level: 'Beginner',
  },
  {
    id: 'smishing-deep-dive',
    category: 'Smishing',
    title: 'SMS scams & fake delivery alerts',
    summary: 'Why texts feel more trustworthy and how scammers exploit that bias.',
    minutes: 4,
    level: 'Beginner',
  },
  {
    id: 'vishing-callbacks',
    category: 'Vishing',
    title: 'Voice scams & deepfake callers',
    summary: 'From impersonators to AI-cloned voices, verify before you trust.',
    minutes: 6,
    level: 'Intermediate',
  },
  {
    id: 'fake-websites',
    category: 'Web Scams',
    title: 'Fake login pages & typosquatting',
    summary: 'Inspect URLs like a pro: homoglyphs, subdomains, and certificate tricks.',
    minutes: 5,
    level: 'Intermediate',
  },
  {
    id: 'mfa-passwords',
    category: 'Account Safety',
    title: 'MFA, passkeys & password hygiene',
    summary: 'Why SMS codes are not enough and how passkeys defeat phishing.',
    minutes: 5,
    level: 'Intermediate',
  },
  {
    id: 'social-engineering-advanced',
    category: 'Fundamentals',
    title: 'Advanced social engineering',
    summary: 'Pretexting, spear-phishing, and business email compromise (BEC).',
    minutes: 7,
    level: 'Advanced',
  },
];

const categories = ['All', 'Fundamentals', 'Phishing', 'Smishing', 'Vishing', 'Web Scams', 'Account Safety'] as const;

export default function LearnScreen() {
  const [activeCat, setActiveCat] = useState<(typeof categories)[number]>('All');
  const [openLesson, setOpenLesson] = useState<Lesson | null>(null);
  const [input, setInput] = useState('');

  const filtered = useMemo(
    () => (activeCat === 'All' ? lessons : lessons.filter((l) => l.category === activeCat)),
    [activeCat]
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="book-outline" size={18} color="#EFF6FF" />
          </View>
          <View>
            <Text style={styles.title}>Learn</Text>
            <Text style={styles.subtitle}>Master the art of cyber defense</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="sparkles" size={16} color={TrainingColors.accentTeal} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroEyebrow}>AI tutor</Text>
            <Text style={styles.heroText}>
              Tap any lesson and get an instant personalized explanation with red flags and defenses.
            </Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {categories.map((cat) => {
            const active = cat === activeCat;
            return (
              <Pressable key={cat} onPress={() => setActiveCat(cat)} style={[styles.filter, active && styles.filterActive]}>
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{cat}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.lessonList}>
          {filtered.map((lesson) => (
            <Pressable key={lesson.id} onPress={() => setOpenLesson(lesson)} style={styles.lessonCard}>
              <View style={styles.lessonIcon}>
                <Ionicons name="school-outline" size={18} color={TrainingColors.accentTeal} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.lessonHead}>
                  <Text style={styles.lessonCategory}>{lesson.category}</Text>
                  <Text style={styles.lessonMeta}>
                    {lesson.minutes} min · {lesson.level}
                  </Text>
                </View>
                <Text style={styles.lessonTitle}>{lesson.title}</Text>
                <Text style={styles.lessonSummary}>{lesson.summary}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={TrainingColors.textMuted} />
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Modal visible={openLesson !== null} transparent animationType="slide" onRequestClose={() => setOpenLesson(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalCategory}>
                  {openLesson?.category} · {openLesson?.level}
                </Text>
                <Text style={styles.modalTitle}>{openLesson?.title}</Text>
              </View>
              <Pressable onPress={() => setOpenLesson(null)} style={styles.modalClose}>
                <Ionicons name="close" size={18} color={TrainingColors.textPrimary} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.botRow}>
                <View style={styles.botIcon}>
                  <Ionicons name="sparkles" size={13} color={TrainingColors.accentTeal} />
                </View>
                <View style={styles.botBubble}>
                  <Text style={styles.botText}>
                    Focus on verification, suspicious urgency, and independent confirmation. Never
                    use contact details from the suspicious message itself.
                  </Text>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalComposer}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Ask a follow-up..."
                placeholderTextColor={TrainingColors.textMuted}
                style={styles.modalInput}
              />
              <Pressable style={[styles.modalSend, !input.trim() && styles.modalSendDisabled]} disabled={!input.trim()}>
                <Ionicons name="send" size={14} color="#EFF6FF" />
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  hero: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    padding: 14,
    flexDirection: 'row',
    gap: 10,
  },
  heroIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(69,224,177,0.12)',
  },
  heroEyebrow: {
    color: TrainingColors.accentTeal,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  heroText: { color: TrainingColors.textPrimary, fontSize: 13, lineHeight: 18, marginTop: 2 },
  filters: { gap: 8, paddingTop: 4, paddingBottom: 2 },
  filter: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  filterActive: { backgroundColor: TrainingColors.buttonPrimary, borderColor: TrainingColors.buttonPrimaryBorder },
  filterText: { color: TrainingColors.textSecondary, fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: '#EEF6FF' },
  lessonList: { gap: 10 },
  lessonCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  lessonIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panelAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lessonHead: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  lessonCategory: { color: TrainingColors.textMuted, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.9 },
  lessonMeta: { color: TrainingColors.textMuted, fontSize: 10 },
  lessonTitle: { color: TrainingColors.textPrimary, fontSize: 14, fontWeight: '700', marginTop: 2 },
  lessonSummary: { color: TrainingColors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(7,13,24,0.75)', justifyContent: 'flex-end' },
  modalCard: {
    height: '86%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    paddingTop: 16,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  modalCategory: { color: TrainingColors.accentTeal, fontSize: 9, textTransform: 'uppercase', letterSpacing: 1 },
  modalTitle: { color: TrainingColors.textPrimary, fontSize: 18, fontWeight: '800', marginTop: 2 },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panelAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: { flex: 1, paddingHorizontal: 16, paddingVertical: 8 },
  botRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  botIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(69,224,177,0.12)',
  },
  botBubble: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panelAlt,
    padding: 11,
  },
  botText: { color: TrainingColors.textPrimary, fontSize: 13, lineHeight: 18 },
  modalComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: TrainingColors.border,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 22,
  },
  modalInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    borderRadius: 12,
    backgroundColor: TrainingColors.panelAlt,
    color: TrainingColors.textPrimary,
    paddingHorizontal: 11,
    paddingVertical: 10,
    fontSize: 13,
  },
  modalSend: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TrainingColors.buttonPrimary,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
  },
  modalSendDisabled: { opacity: 0.5 },
});
