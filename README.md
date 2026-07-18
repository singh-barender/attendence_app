# Biometric Attendance App

A Proof of Concept (POC) for a facial recognition and fingerprint-based attendance system, designed for field workers and standard office environments. It features an offline-first mobile app (React Native/Expo) and a robust backend API (Fastify/GraphQL).

## Architecture & Tech Stack

This project is structured as a monorepo using `pnpm` workspaces and `turbo` for task orchestration.

- **Frontend (App):** React Native / Expo, Tamagui for styling, TanStack Query for offline mutation queuing, and Vision Camera for facial liveness challenges.
- **Backend (API):** Node.js, Fastify, GraphQL (Mercurius / Pothos), Prisma ORM (SQLite).
- **Packages:** Shared biometric liveness logic, face matching using `@vladmandic/human` / TensorFlow, and shared types.

## Installation & Setup

### Prerequisites
- Node.js (v24.0.0 or higher)
- pnpm (v11.10.0 or higher)

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Configure Backend Database
The backend uses `better-sqlite3`, so no external database service is required.

```bash
cd backend
pnpm prisma:generate
pnpm prisma:migrate
```
*(This will create a `dev.db` file in the backend directory based on the Prisma schema).*

### 3. Start Development Servers
From the root of the project, you can start both the frontend and backend simultaneously using Turbo:

```bash
pnpm run dev
```

Alternatively, you can run them separately:
- **Backend:** `cd backend && pnpm run dev` (Runs on `localhost:4000`)
- **Frontend (Web):** `cd app && pnpm run web`
- **Frontend (Android):** `cd app && pnpm run android`

## Testing & Linting
Run type checks and unit tests across all workspaces:
```bash
pnpm run typecheck
pnpm run test
```
To run the Biome linter:
```bash
pnpm run lint
```

## Security & Architecture Notes
- **Liveness & Match Separation:** Biometric vectors are generated on-device, but matches are performed exclusively on the server to prevent spoofing. Liveness challenges (e.g., nod tests) are also re-verified server-side.
- **Offline Tolerance:** Field workers can punch in without internet. Punches are queued locally using TanStack Query's persistent offline persister and automatically sync once connectivity returns. Sessions last 30 days to protect against extended offline stints.
- **Strict Alternation:** The system enforces a strict Check-In / Check-Out alternation. An abandoned shift (> 16 hours without check-out) will be automatically flagged as "Missed", and the next punch will safely start a new Check-In.

See individual package READMEs for more detailed instructions.
