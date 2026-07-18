/**
 * Shared Prisma error-code checks — kept in one place rather than duplicated
 * per service, since more than one write path needs to distinguish a unique-
 * constraint violation from any other failure (`attendanceService.recordPunch`'s
 * `@@unique([userId, date, type])` race guard, `tokenService.tryConsumeToken`'s
 * atomic single-use enforcement).
 */
export function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}
