import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, View } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { useAuth } from '@/features/auth/auth-context';
import { TrainingColors } from '@/features/training/ui-theme';

export default function TabLayout() {
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

  return (
    <Tabs
      initialRouteName="dashboard"
      screenOptions={{
        tabBarActiveTintColor: TrainingColors.accentTeal,
        tabBarInactiveTintColor: TrainingColors.textMuted,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        tabBarStyle: {
          position: 'absolute',
          left: 14,
          right: 14,
          bottom: 14,
          height: 68,
          borderRadius: 18,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: TrainingColors.border,
          backgroundColor: TrainingColors.panel,
          paddingTop: 6,
          paddingBottom: 6,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Acasă',
          tabBarIcon: ({ color, size }) => <Ionicons size={size} name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="scenarios"
        options={{
          title: 'Antrenează',
          tabBarIcon: ({ color, size }) => <Ionicons size={size} name="shield-checkmark" color={color} />,
        }}
      />
      <Tabs.Screen
        name="learn"
        options={{
          title: 'Învață',
          tabBarIcon: ({ color, size }) => <Ionicons size={size} name="book" color={color} />,
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: 'Asistent',
          tabBarIcon: ({ color, size }) => <Ionicons size={size} name="sparkles" color={color} />,
        }}
      />
      <Tabs.Screen
        name="training"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Statistici',
          tabBarIcon: ({ color, size }) => <Ionicons size={size} name="stats-chart" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          href: null,
        }}
      />
      </Tabs>
  );
}

const styles = {
  loader: {
    flex: 1,
    backgroundColor: TrainingColors.pageBase,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
};
