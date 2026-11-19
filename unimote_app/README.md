# Unimote App

React Native (bare, TypeScript) + NativeWind (Tailwind for RN). Package manager: **Yarn**.

- Android application id / iOS bundle id: `com.unimote.app`
- Registered component name: `unimote_app` (must match the native code; display name is "Unimote")

## Android (current focus)

```sh
yarn install
yarn start            # Metro
yarn android          # build + run on emulator/device
yarn typecheck && yarn test
```

Requires Android SDK + JDK 17 (`ANDROID_HOME` set).

## Styling (NativeWind v4)

Use Tailwind classes via `className`: `<View className="flex-1 bg-slate-900" />`.
Config: `tailwind.config.js`, `global.css` (imported in `App.tsx`), `babel.config.js`, `metro.config.js`.
Put new code under `src/`; `tailwind.config.js` already scans `./src/**/*`.

## iOS — parked until Xcode is available

The `ios/` project is generated and committed-ready, but CocoaPods were **not** installed
(no full Xcode on the dev machine yet). To enable iOS later:

1. Install Xcode from the App Store, open it once, then
   `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`.
2. `yarn ios:setup` (bundle install + `pod install`).
3. `yarn ios` (or open `ios/unimote_app.xcworkspace`).

iOS differences to handle when we get there (see the product spec):

| Area | Android | iOS |
| --- | --- | --- |
| IR blaster | `ConsumerIrManager` native module | none, use Wi-Fi IR hub (Broadlink/Tuya) |
| Bluetooth HID remote | `BluetoothHidDevice` module | not possible, hide the toggle |
| BLE (lights) | permissions in manifest | `NSBluetoothAlwaysUsageDescription` in `Info.plist` |
| Local network / mDNS | `CHANGE_WIFI_MULTICAST_STATE` | `NSLocalNetworkUsageDescription` + `NSBonjourServices` in `Info.plist` |
| Quick controls | Quick Settings tile | WidgetKit / Control Center, Watch app (Phase 4) |

Convention so iOS is a drop-in later: keep Android-only native code behind a TypeScript interface
and put platform variants in `*.android.ts` / `*.ios.ts` files (Metro picks the right one), with the
iOS variant returning "unsupported" until implemented.
