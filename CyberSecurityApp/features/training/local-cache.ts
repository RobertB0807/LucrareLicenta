import AsyncStorage from '@react-native-async-storage/async-storage';

export const TRAINING_SESSION_STORAGE_KEY = 'training-session-state-v1';
export const ASSISTANT_MESSAGES_STORAGE_KEY = 'assistant-messages-v1';
export const LEARN_SCREEN_STORAGE_KEY = 'learn-screen-state-v1';
export const FEEDBACK_CONTEXT_STORAGE_KEY = 'training-feedback-context-v1';
export const CHAT_PROGRESS_STORAGE_PREFIX = 'training-chat-progress-v1';

export function buildUserStorageKey(baseKey: string, userId?: string | null): string {
  return userId ? `${baseKey}:${userId}` : baseKey;
}

export function buildUserChatProgressPrefix(userId?: string | null): string {
  return userId ? `${CHAT_PROGRESS_STORAGE_PREFIX}:${userId}` : CHAT_PROGRESS_STORAGE_PREFIX;
}

export async function clearTrainingLocalCache(userId?: string | null): Promise<void> {
  const storage = AsyncStorage as typeof AsyncStorage & {
    multiRemove?: (keys: readonly string[]) => Promise<void>;
  };

  const allKeys = await AsyncStorage.getAllKeys();
  const userChatPrefix = buildUserChatProgressPrefix(userId);
  const chatProgressKeys = allKeys.filter((key) => key.startsWith(`${userChatPrefix}:`));
  const keysToRemove = Array.from(
    new Set([
      buildUserStorageKey(TRAINING_SESSION_STORAGE_KEY, userId),
      buildUserStorageKey(ASSISTANT_MESSAGES_STORAGE_KEY, userId),
      buildUserStorageKey(LEARN_SCREEN_STORAGE_KEY, userId),
      buildUserStorageKey(FEEDBACK_CONTEXT_STORAGE_KEY, userId),
      ...chatProgressKeys,
    ])
  );

  if (!keysToRemove.length) {
    return;
  }

  if (typeof storage.multiRemove === 'function') {
    await storage.multiRemove(keysToRemove);
    return;
  }

  await Promise.all(keysToRemove.map((key) => AsyncStorage.removeItem(key)));
}
