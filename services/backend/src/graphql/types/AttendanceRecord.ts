/**
 * Pothos object type for AttendanceRecord — exposes `type`/`method` as real
 * GraphQL enums (not raw strings), per ADR-012.
 */
import type { PunchType, VerificationMethod } from '../../services/attendanceService';
import { builder } from '../builder';
import { PunchTypeEnum, VerificationMethodEnum } from './enums';
import { DateTimeScalar } from './scalars';

export const AttendanceRecordRef = builder.prismaObject('AttendanceRecord', {
  fields: (t) => ({
    id: t.exposeID('id'),
    date: t.exposeString('date'),
    type: t.field({
      type: PunchTypeEnum,
      resolve: (record) => record.type as PunchType,
    }),
    method: t.field({
      type: VerificationMethodEnum,
      resolve: (record) => record.method as VerificationMethod,
    }),
    timestamp: t.field({
      type: DateTimeScalar,
      resolve: (record) => record.timestamp,
    }),
    matchScore: t.exposeFloat('matchScore', { nullable: true }),
    latitude: t.exposeFloat('latitude', { nullable: true }),
    longitude: t.exposeFloat('longitude', { nullable: true }),
  }),
});
