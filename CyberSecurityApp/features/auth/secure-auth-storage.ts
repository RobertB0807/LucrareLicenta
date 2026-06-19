import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

let secureStoreAvailability: Promise<boolean> | null = null;

function isSecureStoreAvailable(): Promise<boolean> {
  if (!secureStoreAvailability) {
    secureStoreAvailability = SecureStore.isAvailableAsync().catch(() => false);
  }

  return secureStoreAvailability;
}

export async function getAuthStorageItem(key: string): Promise<string | null> {
  if (!(await isSecureStoreAvailable())) {
    return AsyncStorage.getItem(key);
  }

  const secureValue = await SecureStore.getItemAsync(key);
  if (secureValue !== null) {
    return secureValue;
  }

  const legacyValue = await AsyncStorage.getItem(key);
  if (legacyValue !== null) {
    await SecureStore.setItemAsync(key, legacyValue);
    await AsyncStorage.removeItem(key);
  }

  return legacyValue;
}

export async function setAuthStorageItem(key: string, value: string): Promise<void> {
  if (await isSecureStoreAvailable()) {
    await SecureStore.setItemAsync(key, value);
    await AsyncStorage.removeItem(key);
    return;
  }

  await AsyncStorage.setItem(key, value);
}

export async function removeAuthStorageItem(key: string): Promise<void> {
  if (await isSecureStoreAvailable()) {
    await SecureStore.deleteItemAsync(key);
  }

  await AsyncStorage.removeItem(key);
}
