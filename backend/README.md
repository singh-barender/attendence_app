# Backend (Attendance App)

The API layer for the Biometric Attendance system. Built with **Fastify**, **Mercurius (GraphQL)**, **Pothos**, and **Prisma ORM**.

## Tech Stack
- **Server:** Node.js, Fastify
- **GraphQL API:** Mercurius, Pothos (Code-first schema design)
- **Database:** SQLite (via Better-SQLite3)
- **Auth/Security:** JWT (jose) and BCrypt for dashboard password hashing.

## Local Setup

### 1. Database Initialization
Ensure you have run `pnpm install` from the project root. Then, in the `backend/` directory:

```bash
pnpm prisma:generate
pnpm prisma:migrate
```
This generates the Prisma client and applies the schema to a local `dev.db` SQLite file.

### 2. Environment Variables
An `.env.example` file is provided. You generally do not need to alter it for local development, as it defaults to:
- `PORT=4000`
- `DATABASE_URL="file:./dev.db"`
- `JWT_SECRET="replace-with-a-real-32-byte-hex-secret"`
- `SHIFT_START_HOUR=9`

### 3. Start the Server
```bash
pnpm run dev
```
The server will start at `http://localhost:4000/graphql`. You can access the GraphiQL playground by navigating to that URL in your browser.

## Key Services
- **AttendanceService (`src/services/attendanceService.ts`)**: Handles the core punch-in logic, liveness verification, offline-sync timestamp bucketing, and the strict check-in/check-out alternation state machine (including 16-hour shift expiration).
- **TokenService (`src/services/tokenService.ts`)**: Issues and validates 30-day JWTs (to support long offline stints).
- **AuthService (`src/services/authService.ts`)**: Implements constant-time password hashing and verification to guard against timing attacks (protects the dashboard, but biometrics are the source of truth for punches).
