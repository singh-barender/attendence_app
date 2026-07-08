/**
 * GET /export/attendance.csv — the one deliberate exception to "the API is
 * GraphQL" (ADR-014), since GraphQL doesn't model file downloads well. Uses
 * the exact same auth check as the GraphQL context (tokenService), not a
 * separately reimplemented one.
 */
import type { FastifyInstance } from 'fastify';
import { getAllAttendanceRecords } from '../services/attendanceReportingService';
import { extractUserIdFromAuthHeader } from '../services/tokenService';

const CSV_HEADER = ['date', 'timestamp', 'type', 'method', 'matchScore', 'latitude', 'longitude'];

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toCsvRow(values: readonly (string | number | null)[]): string {
  return values.map((value) => csvEscape(value === null ? '' : String(value))).join(',');
}

export function registerExportCsvRoute(app: FastifyInstance): void {
  app.get('/export/attendance.csv', async (request, reply) => {
    const userId = await extractUserIdFromAuthHeader(request.headers.authorization);
    if (!userId) {
      await reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    const records = await getAllAttendanceRecords(userId);
    const rows = [
      toCsvRow(CSV_HEADER),
      ...records.map((record) =>
        toCsvRow([
          record.date,
          record.timestamp.toISOString(),
          record.type,
          record.method,
          record.matchScore,
          record.latitude,
          record.longitude,
        ]),
      ),
    ];

    await reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="attendance.csv"')
      .send(rows.join('\n'));
  });
}
