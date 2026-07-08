/**
 * Extracts a clean, user-displayable message from a failed generated
 * mutation/query call. `graphql-request`'s `ClientError` stringifies the
 * full request+response into `.message` (useful for logs, not UI) — the
 * actual server-thrown message lives at `.response.errors[0].message`.
 * Every screen that wires a generated hook uses this, not ad hoc parsing.
 */
import { ClientError } from 'graphql-request';

export function getErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof ClientError) {
    return error.response.errors?.[0]?.message ?? fallback;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}
