import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

type ScenarioOption = {
  id: string;
  text: string;
};

type Scenario = {
  scenario_id: string;
  attack_type: string;
  difficulty: string;
  channel: string;
  attacker_message: string;
  options: ScenarioOption[];
  red_flags: string[];
};

type Evaluation = {
  is_correct: boolean;
  score_delta: number;
  explanation: string;
};

// For physical devices, set EXPO_PUBLIC_API_BASE_URL in .env.local
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  Platform.select({
    android: 'http://10.0.2.2:8000',
    default: 'http://127.0.0.1:8000',
  });

export default function HomeScreen() {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startSimulation = async () => {
    setIsLoading(true);
    setError(null);
    setEvaluation(null);
    setSelectedOptionId(null);

    try {
      const response = await fetch(`${API_BASE_URL}/scenario/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attack_type: 'phishing', difficulty: 'easy' }),
      });

      if (!response.ok) {
        throw new Error('Nu am putut genera scenariul.');
      }

      const data = (await response.json()) as Scenario;
      setScenario(data);
    } catch {
      setError(
        'Conexiune esuata cu backend-ul. Verifica daca FastAPI ruleaza pe portul 8000 si endpoint-ul este accesibil.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const evaluateAnswer = async () => {
    if (!scenario || !selectedOptionId) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/scenario/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario_id: scenario.scenario_id,
          selected_option_id: selectedOptionId,
        }),
      });

      if (!response.ok) {
        throw new Error('Nu am putut evalua raspunsul.');
      }

      const data = (await response.json()) as Evaluation;
      setEvaluation(data);
    } catch {
      setError('Eroare la evaluare. Incearca din nou.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#E7F0EA', dark: '#1F2E27' }}
      headerImage={<View style={styles.headerAccent} />}>
      <ThemedView style={styles.container}>
        <ThemedText type="title">MVP: Simulare phishing</ThemedText>
        <ThemedText>
          Flux minimal: generezi un scenariu, alegi o actiune, primesti feedback si scor.
        </ThemedText>

        {!scenario ? (
          <Pressable style={styles.primaryButton} onPress={startSimulation}>
            <ThemedText type="defaultSemiBold">Start simulare</ThemedText>
          </Pressable>
        ) : (
          <View style={styles.scenarioCard}>
            <ThemedText type="subtitle">Mesaj suspect</ThemedText>
            <ThemedText>{scenario.attacker_message}</ThemedText>

            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Ce faci?
            </ThemedText>
            {scenario.options.map((option) => {
              const isSelected = selectedOptionId === option.id;
              return (
                <Pressable
                  key={option.id}
                  style={[styles.optionButton, isSelected && styles.optionButtonSelected]}
                  onPress={() => setSelectedOptionId(option.id)}>
                  <ThemedText>{option.text}</ThemedText>
                </Pressable>
              );
            })}

            <Pressable
              style={[styles.primaryButton, !selectedOptionId && styles.buttonDisabled]}
              onPress={evaluateAnswer}
              disabled={!selectedOptionId || isLoading}>
              <ThemedText type="defaultSemiBold">Trimite raspunsul</ThemedText>
            </Pressable>
          </View>
        )}

        {isLoading ? <ActivityIndicator size="small" /> : null}

        {evaluation ? (
          <View style={styles.feedbackCard}>
            <ThemedText type="subtitle">Rezultat</ThemedText>
            <ThemedText>{evaluation.is_correct ? 'Raspuns corect.' : 'Raspuns gresit.'}</ThemedText>
            <ThemedText>Scor obtinut: {evaluation.score_delta}</ThemedText>
            <ThemedText>{evaluation.explanation}</ThemedText>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Red flags
            </ThemedText>
            {scenario?.red_flags.map((flag) => (
              <ThemedText key={flag}>• {flag}</ThemedText>
            ))}

            <Pressable style={styles.secondaryButton} onPress={startSimulation}>
              <ThemedText type="defaultSemiBold">Ruleaza alt scenariu</ThemedText>
            </Pressable>
          </View>
        ) : null}

        {error ? <ThemedText style={styles.errorText}>{error}</ThemedText> : null}
      </ThemedView>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingBottom: 24,
  },
  scenarioCard: {
    gap: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(117, 167, 128, 0.14)',
  },
  feedbackCard: {
    gap: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(80, 112, 171, 0.16)',
  },
  sectionTitle: {
    marginTop: 6,
  },
  optionButton: {
    borderWidth: 1,
    borderColor: 'rgba(120, 120, 120, 0.35)',
    borderRadius: 10,
    padding: 10,
  },
  optionButtonSelected: {
    borderColor: '#2D7D46',
    backgroundColor: 'rgba(45, 125, 70, 0.15)',
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(45, 125, 70, 0.25)',
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(80, 112, 171, 0.22)',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  errorText: {
    color: '#B32727',
  },
  headerAccent: {
    flex: 1,
    margin: 24,
    borderRadius: 16,
    backgroundColor: 'rgba(45, 125, 70, 0.35)',
  },
});
