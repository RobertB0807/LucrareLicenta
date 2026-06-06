import AsyncStorage from '@react-native-async-storage/async-storage';

type SecureStoreModule = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

function loadSecureStore(): SecureStoreModule | null {
  try {
    const dynamicRequire = eval('require') as (moduleName: string) => SecureStoreModule;
    return dynamicRequire('expo-secure-store');
  } catch {
    return null;
  }
}

const SecureStore = loadSecureStore();

export async function getAuthStorageItem(key: string): Promise<string | null> {
  if (SecureStore) {
    return SecureStore.getItemAsync(key);
  }
  return AsyncStorage.getItem(key);
}

export async function setAuthStorageItem(key: string, value: string): Promise<void> {
  if (SecureStore) {
    await SecureStore.setItemAsync(key, value);
    return;
  }
  await AsyncStorage.setItem(key, value);
}

export async function removeAuthStorageItem(key: string): Promise<void> {
  if (SecureStore) {
    await SecureStore.deleteItemAsync(key);
    return;
  }
  await AsyncStorage.removeItem(key);
}
