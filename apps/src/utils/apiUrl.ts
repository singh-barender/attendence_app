/**
 * Single place that reads and validates `EXPO_PUBLIC_API_URL` — both the
 * GraphQL client and the plain CSV export route (ADR-014) need the same
 * base URL and the same fail-fast check.
 */
export function getApiUrl(): string {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!apiUrl) {
    throw new Error(
      'EXPO_PUBLIC_API_URL is not set — copy apps/.env.example to apps/.env and fill it in.',
    );
  }
  return apiUrl;
}
