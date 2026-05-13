import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { AuthProvider } from '@/features/auth/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { TrainingSessionProvider } from '@/features/training/useTrainingSession';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <TrainingSessionProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack screenOptions={{ headerShown: false }}>
            {/* Public auth screens */}
            <Stack.Screen name="login" />
            <Stack.Screen name="register" />

            {/* Protected screens — auth gated by (tabs)/index.tsx redirect */}
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="chat/[scenarioId]" />
            <Stack.Screen name="feedback/[scenarioId]" />
            <Stack.Screen
              name="modal"
              options={{ presentation: 'modal', title: 'Fereastră modală', headerShown: true }}
            />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </TrainingSessionProvider>
    </AuthProvider>
  );
}

