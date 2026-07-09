/**
 * Assembles the final GraphQL schema. Each query/mutation module registers
 * its fields on the shared builder as a side effect when imported — this
 * file's only job is to import all of them (so that side effect runs)
 * before calling builder.toSchema().
 */
import { builder } from './builder';
import './queries/health';
import './queries/identify';
import './queries/attendanceHistory';
import './queries/me';
import './queries/myVerificationAttempts';
import './queries/exportMyData';
import './types/User';
import './types/AttendanceRecord';
import './types/AttendanceDaySummary';
import './types/VerificationAttempt';
import './types/EnrollmentMetadata';
import './types/MyDataExport';
import './mutations/register';
import './mutations/punchIn';
import './mutations/reEnroll';

export const schema = builder.toSchema();
