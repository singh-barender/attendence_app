/**
 * GET /export/attendance.csv — the one deliberate exception to "the API is
 * GraphQL" (ADR-014), since GraphQL doesn't model file downloads well. Uses
 * the exact same auth check as the GraphQL context (tokenService), not a
 * separately reimplemented one.
 *
 * The export is a per-day report (`buildAttendanceCsv`), optionally narrowed
 * to a date range via `?from=&to=` (the client's Today / This Week / This
 * Month presets). The download filename is derived server-side and sent via
 * Content-Disposition so the client needs no user-name lookup of its own.
 */
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/client';
import { buildAttendanceCsv, deriveExportFilename } from '../services/attendanceCsv';
import { getAttendanceHistory } from '../services/attendanceReportingService';
import { extractUserIdFromAuthHeader } from '../services/tokenService';

/** Only accept well-formed YYYY-MM-DD bounds; anything else is ignored (a
 * malformed param falls back to "no bound" rather than erroring the export). */
const DATE_PARAM = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeDateParam(value: unknown): string | undefined {
  return typeof value === 'string' && DATE_PARAM.test(value) ? value : undefined;
}

export function registerExportCsvRoute(app: FastifyInstance): void {
  app.get('/export/attendance.csv', async (request, reply) => {
    const userId = await extractUserIdFromAuthHeader(request.headers.authorization);
    if (!userId) {
      await reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true, email: true },
    });
    if (!user) {
      await reply.code(404).send({ error: 'Account not found' });
      return;
    }

    const query = request.query as { from?: unknown; to?: unknown };
    const from = sanitizeDateParam(query.from);
    const to = sanitizeDateParam(query.to);

    const days = await getAttendanceHistory(userId, { from, to });
    const csv = buildAttendanceCsv(user, days);
    const filename = deriveExportFilename(user.fullName, from, to);

    await reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(csv);
  });
}
