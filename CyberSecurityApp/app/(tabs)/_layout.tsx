import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { AppBackdrop } from '@/components/app-backdrop';
import { HapticTab } from '@/components/haptic-tab';
import { useAuth } from '@/features/auth/auth-context';
import { TrainingColors, TrainingShadows } from '@/features/training/ui-theme';

export default function TabLayout() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loader}>
        <AppBackdrop />
        <ActivityIndicator size="large" color={TrainingColors.accentTeal} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  if (!user?.onboardingCompleted) {
    return <Redirect href={'/onboarding' as never} />;
  }

  return (
    <Tabs
      initialRouteName="dashboard"
      screenOptions={{
        tabBarActiveTintColor: TrainingColors.accentTeal,
        tabBarInactiveTintColor: TrainingColors.textMuted,
        tabBarActiveBackgroundColor: 'rgba(77, 228, 178, 0.1)',
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 0.1,
          marginTop: 1,
        },
        tabBarItemStyle: {
          borderRadius: 14,
          marginHorizontal: 2,
          marginVertical: 6,
        },
        tabBarIconStyle: {
          marginTop: 1,
        },
        tabBarStyle: {
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: Platform.OS === 'ios' ? 10 : 12,
          height: Platform.OS === 'ios' ? 76 : 70,
          borderRadius: 22,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: TrainingColors.borderStrong,
          backgroundColor: 'rgba(13, 24, 40, 0.98)',
          paddingHorizontal: 5,
          paddingTop: 2,
          paddingBottom: Platform.OS === 'ios' ? 8 : 2,
          ...TrainingShadows.floating,
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
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons size={size} name={focused ? 'home' : 'home-outline'} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="scenarios"
        options={{
          title: 'Antrenează',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              size={size}
              name={focused ? 'shield-checkmark' : 'shield-checkmark-outline'}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="learn"
        options={{
          title: 'Învață',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons size={size} name={focused ? 'book' : 'book-outline'} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: 'Asistent',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons size={size} name={focused ? 'sparkles' : 'sparkles-outline'} color={color} />
          ),
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
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              size={size}
              name={focused ? 'stats-chart' : 'stats-chart-outline'}
              color={color}
            />
          ),
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

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    backgroundColor: TrainingColors.pageBase,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
