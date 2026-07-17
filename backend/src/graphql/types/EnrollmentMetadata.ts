/**
 * Metadata-only view of a BiometricEnrollment row for `exportMyData` (task
 * 4.5, ADR-020) — requirements.md explicitly scopes the export to
 * "enrollments metadata," not raw biometric data. A hand-rolled `objectRef`
 * rather than `builder.prismaObject('BiometricEnrollment', ...)` on
 * purpose: a prismaObject would make the model's `embedding` column just
 * one `t.exposeString` away from being exposed by a future edit, whereas
 * this shape structurally cannot carry it — the same "never send an
 * enrolled embedding to any client" boundary ADR-006/007/018 already
 * establish, applied here too.
 */
import { builder } from '../builder';
import { DateTimeScalar } from './scalars';

export interface EnrollmentMetadataShape {
  type: string;
  createdAt: Date;
  supersededAt: Date | null;
}

export const EnrollmentMetadataRef = builder
  .objectRef<EnrollmentMetadataShape>('EnrollmentMetadata')
  .implement({
    fields: (t) => ({
      type: t.exposeString('type'),
      createdAt: t.field({ type: DateTimeScalar, resolve: (e) => e.createdAt }),
      supersededAt: t.field({
        type: DateTimeScalar,
        nullable: true,
        resolve: (e) => e.supersededAt,
      }),
    }),
  });
