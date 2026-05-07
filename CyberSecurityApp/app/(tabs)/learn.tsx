import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { TrainingColors } from '@/features/training/ui-theme';

type Lesson = {
  id: string;
  category: 'Phishing' | 'Smishing' | 'Vishing' | 'Escrocherii web' | 'Siguranța contului' | 'Fundamente';
  title: string;
  summary: string;
  minutes: number;
  level: 'Începător' | 'Intermediar' | 'Avansat';
};

const lessons: Lesson[] = [
  {
    id: 'phishing-101',
    category: 'Fundamente',
    title: 'Phishing 101: cum gândesc atacatorii',
    summary: 'Înțelege psihologia din spatele phishing-ului: urgență, autoritate și curiozitate.',
    minutes: 4,
    level: 'Începător',
  },
  {
    id: 'email-red-flags',
    category: 'Phishing',
    title: 'Cum observi red flags în email',
    summary: 'Domenii asemănătoare, nume de expeditor nepotrivite, CTA-uri urgente și atașamente malițioase.',
    minutes: 5,
    level: 'Începător',
  },
  {
    id: 'smishing-deep-dive',
    category: 'Smishing',
    title: 'Escrocherii SMS și alerte false de livrare',
    summary: 'De ce mesajele par mai credibile și cum exploatează atacatorii acest bias.',
    minutes: 4,
    level: 'Începător',
  },
  {
    id: 'vishing-callbacks',
    category: 'Vishing',
    title: 'Fraude vocale și apeluri deepfake',
    summary: 'De la impostori la voci clonate cu AI, verifică înainte să ai încredere.',
    minutes: 6,
    level: 'Intermediar',
  },
  {
    id: 'fake-websites',
    category: 'Escrocherii web',
    title: 'Pagini false de login și typosquatting',
    summary: 'Analizează URL-urile ca un profesionist: homoglife, subdomenii și trucuri cu certificate.',
    minutes: 5,
    level: 'Intermediar',
  },
  {
    id: 'mfa-passwords',
    category: 'Siguranța contului',
    title: 'MFA, passkeys și igiena parolelor',
    summary: 'De ce codurile SMS nu sunt suficiente și cum passkey-urile combat phishing-ul.',
    minutes: 5,
    level: 'Intermediar',
  },
  {
    id: 'social-engineering-advanced',
    category: 'Fundamente',
    title: 'Social engineering avansat',
    summary: 'Pretexting, spear-phishing și compromiterea emailului de business (BEC).',
    minutes: 7,
    level: 'Avansat',
  },
];

const categories = ['Toate', 'Fundamente', 'Phishing', 'Smishing', 'Vishing', 'Escrocherii web', 'Siguranța contului'] as const;

export default function LearnScreen() {
  const [activeCat, setActiveCat] = useState<(typeof categories)[number]>('Toate');
  const [openLesson, setOpenLesson] = useState<Lesson | null>(null);
  const [input, setInput] = useState('');

  const filtered = useMemo(
    () => (activeCat === 'Toate' ? lessons : lessons.filter((l) => l.category === activeCat)),
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
            <Text style={styles.title}>Învață</Text>
            <Text style={styles.subtitle}>Stăpânește arta apărării cibernetice</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="sparkles" size={16} color={TrainingColors.accentTeal} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroEyebrow}>Tutor AI</Text>
            <Text style={styles.heroText}>
              Deschide orice lecție și primești instant o explicație personalizată cu red flags și metode de apărare.
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
                    Concentrează-te pe verificare, urgență suspectă și confirmare independentă. Nu
                    folosi niciodată datele de contact din mesajul suspect.
                  </Text>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalComposer}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Pune o întrebare de follow-up..."
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
