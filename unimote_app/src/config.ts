// The shared development server. Change it in Settings > Developer > API server (Reset brings this back).
// For a local Rails server: the Android emulator reaches your computer at http://10.0.2.2:<port>; a USB phone can use
// `adb reverse tcp:<port> tcp:<port>` and http://localhost:<port>.
export const DEFAULT_API_URL = 'https://unimote.bluemangolabs.com';
export const API_PREFIX = '/api/v1';
