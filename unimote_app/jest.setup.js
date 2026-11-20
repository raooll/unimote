jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

// In-memory AsyncStorage for the persisted zustand stores.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map();
  const api = {
    getItem: jest.fn(async k => (store.has(k) ? store.get(k) : null)),
    setItem: jest.fn(async (k, v) => void store.set(k, v)),
    removeItem: jest.fn(async k => void store.delete(k)),
    clear: jest.fn(async () => store.clear()),
  };
  return { __esModule: true, default: api, ...api };
});

// Icons are irrelevant to logic tests (and the package ships .mjs ESM that jest does not transform).
jest.mock('lucide-react-native', () => {
  const Icon = () => null;
  return new Proxy({ __esModule: true }, { get: (t, k) => (k in t ? t[k] : Icon) });
});

// Native BLE cannot run under Jest.
jest.mock('react-native-ble-plx', () => ({ BleManager: jest.fn() }));
