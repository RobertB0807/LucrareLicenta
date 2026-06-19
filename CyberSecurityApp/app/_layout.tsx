import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';

import { AppBackdrop } from '@/components/app-backdrop';
import { AuthProvider, useAuth } from '@/features/auth/auth-context';
import { TrainingSessionProvider } from '@/features/training/useTrainingSession';
import { TrainingColors } from '@/features/training/ui-theme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  return (
    <AuthProvider>
      <TrainingSessionProvider>
        <RootNavigator />
      </TrainingSessionProvider>
    </AuthProvider>
  );
}

function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loader}>
        <AppBackdrop />
        <ActivityIndicator size="large" color={TrainingColors.accentTeal} />
      </View>
    );
  }

  return (
    <ThemeProvider
      value={{
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          primary: TrainingColors.accentTeal,
          background: TrainingColors.pageBase,
          card: TrainingColors.panel,
          text: TrainingColors.textPrimary,
          border: TrainingColors.border,
          notification: TrainingColors.accentDanger,
        },
      }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />

        <Stack.Protected guard={isAuthenticated}>
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="sessions" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="learning-path" />
          <Stack.Screen name="chat/[scenarioId]" />
          <Stack.Screen name="feedback/[scenarioId]" />
          <Stack.Screen
            name="modal"
            options={{ presentation: 'modal', title: 'Fereastră modală', headerShown: true }}
          />
        </Stack.Protected>
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TrainingColors.pageBase,
  },
});
