import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/features/auth/auth-context';
import { TrainingColors } from '@/features/training/ui-theme';

export default function IndexRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={TrainingColors.accentTeal} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  return <Redirect href="/(tabs)/dashboard" />;
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    backgroundColor: TrainingColors.pageBase,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
