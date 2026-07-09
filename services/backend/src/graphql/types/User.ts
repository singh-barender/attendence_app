/**
 * Pothos object type for User, generated field-by-field from the Prisma
 * model (ADR-011) — only fields the client actually needs are exposed.
 * `createdAt`/`enrollmentStatus` were added for task 4.1 (ProfileScreen);
 * further relations stay unexposed until a real screen needs them.
 */
import * as enrollmentService from '../../services/enrollmentService';
import { builder } from '../builder';
import { EnrollmentStatusRef } from './EnrollmentStatus';
import { DateTimeScalar } from './scalars';

export const UserRef = builder.prismaObject('User', {
  fields: (t) => ({
    id: t.exposeID('id'),
    fullName: t.exposeString('fullName'),
    email: t.exposeString('email'),
    age: t.exposeInt('age', { nullable: true }),
    gender: t.exposeString('gender', { nullable: true }),
    location: t.exposeString('location', { nullable: true }),
    registrationStep: t.exposeInt('registrationStep'),
    createdAt: t.field({
      type: DateTimeScalar,
      resolve: (user) => user.createdAt,
    }),
    enrollmentStatus: t.field({
      type: EnrollmentStatusRef,
      resolve: (user) => enrollmentService.getEnrollmentStatus(user.id),
    }),
  }),
});
