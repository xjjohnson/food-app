// The real AsyncStorage needs a phone; tests use the in-memory mock it ships.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// SafeAreaProvider waits for real screen insets before drawing; the library's
// mock gives it fixed ones so the tree renders in tests.
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

// No keystore in tests: an in-memory one, emptied before each test.
jest.mock('./src/lib/secrets', () => {
  const store = new Map();
  const mem = {
    get: async (k) => (store.has(k) ? store.get(k) : null),
    set: async (k, v) => void store.set(k, v),
    remove: async (k) => void store.delete(k),
  };
  const none = { get: async () => null, set: async () => undefined, remove: async () => undefined };
  return { NO_SECRETS: none, deviceSecrets: () => mem, __store: store };
});

// Database snapshots are files on a phone; tests keep them in memory.
jest.mock('./src/lib/dbSnapshots', () => {
  const files = new Map();
  return {
    deviceSnapshots: () => ({ read: async (id) => (files.has(id) ? files.get(id) : null), write: async (id, t) => void files.set(id, t) }),
    __files: files,
  };
});
