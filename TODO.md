# Unimote — build plan

Source: the Gemini planning chat (OmniControl spec). **Out of scope:** payments/subscriptions, wearables (Apple Watch / Wear OS).
Legend: `[x]` done · `[~]` built but not yet verified on real hardware · `[ ]` todo
Tests (last run): backend 86 specs, app 88 jest tests, Android 42 JVM tests, all passing.

## Open now
**Needs your decision**
- [ ] G5 Licensing review before shipping converted / LIRC / SmartIR data, and the IR encoders written from LGPL/GPL sources (IRremoteESP8266, Flipper firmware). Then `INCLUDE_SOURCES=... rake catalog:export`. Briefing: RUNBOOK "Licensing". Until then none of that data is in the committed snapshot.

**Needs real hardware (code is done and unit/emulator tested)**
- [~] IR sending from a phone with a blaster (E4, and the notification buttons in E10). The Galaxy S10 (SM-G973F) has no blaster: use a Broadlink RM hub or another phone
- [~] Roku / Samsung Tizen / LG webOS drivers (E5) against a real TV on the same Wi-Fi
- [~] Android TV / Google TV (E12) against a real TV, including mDNS discovery in the scan list (the emulator cannot see mDNS)
- [~] Broadlink hub send + learn (E7)
- [~] Bluetooth HID remote and BLE lights (E6)
- [~] AC panel driving a real AC (G3)
- [~] The scan-first "Add a remote" screen (E11) with real devices around

**Small or optional**
- [ ] E13 Fire TV: not possible with the Android TV protocol (Amazon uses its own). Stays on the Bluetooth route. Later option: ADB over Wi-Fi (needs ADB debugging enabled on the TV)
- [ ] Apple TV profile; Tuya hubs; publish the BLE RGB profile (still `draft`, never tried on a real light)
- [ ] 13 SmartIR AC tables over 1,500 states and 13 Xiaomi-format ones are skipped
- [ ] G4c more AC encoders: the Daikin 35-byte frame is built and checked on 3,654 real frames but is not wired to any model (no model-to-protocol map; SmartIR already covers those models). Not worth continuing until a concrete model list needs it
- [ ] Before production: password-reset email needs a queue worker (`SOLID_QUEUE_IN_PUMA=1`) and `APP_LINK_BASE`; change the ActiveAdmin dev login (`admin@example.com` / `password`)

## Decisions (change any of these if you disagree)
- **Login is optional.** Everything (search, download, control) works as a guest. An account only adds cloud sync of rooms / remotes / scenes across devices. Email + password, JWT for the mobile API.
- **IR data:** import [Flipper-IRDB](https://github.com/Lucaslhm/Flipper-IRDB). Wi-Fi (Roku, LG webOS, Samsung Tizen, Android TV) and BLE profiles are hand-written.
- **Data ships to prod** via idempotent `rake catalog:import` / `rake catalog:export` (gzipped snapshot in `dashboard/db/data/catalog.ndjson.gz`, ~1 MB), not one-off seeds. Converted / SmartIR / LIRC data is excluded from the snapshot by default.
- **AC state:** the app remembers the last state it sent. No temperature-sensor inference (unreliable; was flagged in review of the Gemini spec). Revisit later.
- **Android first.** iOS parked until Xcode is available (see `unimote_app/README.md`).
- **Local ports:** if another project already uses port 3000, run Unimote's API on 3010 (see RUNBOOK).

## A. Backend data model (dashboard/)
- [x] A1 Users (Devise, optional login, JWT) + AdminUser unchanged
- [x] A2 Catalog: device_categories, brands, remote_models, remote_configs (jsonb signal data, protocol, layout, popularity)
- [x] A3 Per-user data: rooms, saved_remotes, scenes (macros), config_submissions (crowd-sourced), match_reports (feedback)
- [x] A4 Indexes + pg_search on brand / model

## B. Data
- [x] B1 Importer for Flipper-IRDB (.ir -> brands/models/configs), idempotent. 1,605 curated remotes; Kaseikyo, NEC42 and Pioneer now supported (G6)
- [x] B2 Hand-written Wi-Fi + BLE protocol profiles (Roku, Samsung, LG, Android TV, Bluetooth HID; BLE RGB is a draft)
- [x] B3 Layout templates (tv grid, ac panel, soundbar, fan, projector, light, AC state panel)
- [x] B4 `catalog:export` / `catalog:import` / `catalog:seed` for prod (documented in the RUNBOOK)

## C. API v1 (JSON)
- [x] C1 Auth: sign up / sign in / sign out / me (optional)
- [x] C2 Catalog: categories, brands, models, search, config download (ETag/versioned)
- [x] C3 Match wizard: code sets ranked (Wi-Fi/BLE first, typed model, categorised, popularity), identical codes collapsed, works without a brand
- [x] C4 Synced: rooms, saved remotes, scenes (auth required)
- [x] C5 Crowd-sourced config submissions + model requests
- [x] C6 Request specs for all endpoints + Swagger docs at `/api-docs` (`dashboard/swagger/v1/openapi.yaml`, drift-checked by a spec)

## D. ActiveAdmin
- [x] D1 Users (list, filters, detail, activity counts)
- [x] D2 Categories, Brands, Models, Configs (with JSON view, publish/unpublish)
- [x] D3 Submissions moderation (approve -> publishes a config)
- [x] D4 Dashboard widgets (users, remotes by category, top brands, match success rate)
- [x] D5 Model requests page ranked by demand

## G. Catalog coverage
- [x] G1 Missing-model fallbacks: request this model/brand, common-codes wizard without a brand, duplicate code sets collapsed, readable names for generic models
- [x] G2 Flipper `_Converted_` imported (+6,681 remotes, dev DB only)
- [~] G3 AC coverage: SmartIR climate (393 state tables, MIT) + Broadlink codec + AC state panel. Emulator-verified UI; real AC untested
- [x] G4a LIRC remotes DB (2,580 remotes; RC5/RC6 skipped). 67% overlap with existing codes
- [x] G4b Uncategorised remotes: classifier tried and rejected (<80% precision); instead listed after categorised ones and flagged
- [x] G6 Kaseikyo / NEC42 / Pioneer encoders (+1,865 signals). Checked against 12,102 of 12,103 real Kaseikyo and 2,567 of 2,567 NEC42 signals from other databases (Pioneer timings come from Flipper's firmware constants)
- Dev DB now: ~11,200 published remotes, ~1,900 brands

## E. Mobile app (unimote_app/, Android first)
- [x] E1 App shell: navigation, theme (dark/light/system), zustand stores persisted offline, API client
- [x] E2 Add-remote flow: category -> brand -> model search -> test wizard -> save
- [x] E3 Remote screen renderer (layout templates, hold-to-repeat, haptics)
- [~] E4 Android IR native module (Kotlin `UnimoteIrModule`, JVM-tested). Not run on a phone with an IR blaster
- [~] E5 Wi-Fi drivers: Roku ECP, Samsung Tizen, LG webOS + SSDP discovery + Connect screen. Roku verified against a fake device only
- [~] E6 BLE lights (react-native-ble-plx) + Bluetooth HID remote (Kotlin BluetoothHidDevice)
- [~] E7 Wi-Fi IR hub: Broadlink RM send + learn. Packet code unit-tested, not against a real hub (Tuya not built)
- [x] E8 Rooms (manage + switcher chips), scenes engine + tab + editor, custom mixed-device remotes
- [x] E9 Optional login (sign in/up/reset/delete) + two-way sync with tombstones, record a remote via hub + submit to community
- [~] E10 Quick Settings tile + scene shortcuts + unimote:// links + pin-a-remote notification (Power / Vol / Mute, IR remotes only). Emulator-verified that it posts and removes; sending from it untested (no blaster)
- [~] E11 "Add a remote" starts with a scan (like Mi Remote): Wi-Fi (Roku / Samsung / LG via SSDP, Android TV via mDNS, Broadlink hubs) and paired Bluetooth devices; anything not found falls through to choose-by-device-type and Record
- [~] E12 Android TV / Google TV over Wi-Fi (Remote v2: TLS client certificate + 6-digit code pairing). Messages byte-identical to the open-source androidtvremote2 client; the real app paired with `unimote_app/tools/fake_android_tv.py` on the emulator (wrong-code retry, keys, reconnect after restart). Not a real TV

## F. Wrap-up
- [x] F1 Docs: `docs/RUNBOOK.md` (+ Swagger at /api-docs)
- [x] F2 End-to-end check on an Android emulator (IR flow, scenes, Roku against a fake device, request flow, Android TV against a fake TV)
