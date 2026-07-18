# Frontend Mobile App (Attendance App)

The mobile and web client for the Biometric Attendance system, built using **React Native**, **Expo**, and **Tamagui**.

## Tech Stack
- **Framework:** React Native & Expo (supports Android & Web)
- **Styling:** Tamagui
- **State & Data Fetching:** TanStack Query (React Query)
- **GraphQL Client:** `graphql-request` with a custom offline-tolerant fetcher adapter
- **Biometrics:** Vision Camera for Face Tracking (`react-native-vision-camera`), Local Authentication for Fingerprints (`expo-local-authentication`).

## Local Setup

### Prerequisites
Make sure you have run `pnpm install` in the root directory.

### Running on Android
If you have an Android Emulator running or an Android device connected via ADB:
```bash
pnpm run android
```
*(This command is available both in the `app/` folder and via `turbo run dev` at the root).*

### Running on Web
To run the app in the browser (Note: Camera hardware features will be mocked or omitted on web depending on the environment):
```bash
pnpm run web
```

## Key Architectural Decisions
- **Offline-First:** All GraphQL mutations (like `punchIn`) are designed to be offline-tolerant. TanStack Query uses `@tanstack/query-async-storage-persister` to queue requests when `NetInfo` reports the device is offline.
- **Client-Side Biometric Enrollment:** Face verification uses on-device TensorFlow models to verify liveness (via nodding) and capture vector embeddings. These are sent to the server for authoritative matching.
- **Strict UI Rendering:** Authenticated states are managed safely to prevent jagged UI loading screens. The app waits for token hydration and GraphQL verification before replacing the navigation stack.
