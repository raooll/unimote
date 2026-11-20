import { Platform } from 'react-native';

// Android emulator reaches the host machine at 10.0.2.2. Override in Settings > Developer for a real device.
const DEV_API =
  Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

export const DEFAULT_API_URL = __DEV__ ? DEV_API : 'https://api.unimote.app';
export const API_PREFIX = '/api/v1';
