/**
 * Pothos object type for User, generated field-by-field from the Prisma
 * model (ADR-011) — only fields the client actually needs are exposed;
 * timestamps/relations are added later if a real screen needs them, not
 * speculatively now.
 */
import { builder } from '../builder';

builder.prismaObject('User', {
  fields: (t) => ({
    id: t.exposeID('id'),
    fullName: t.exposeString('fullName'),
    email: t.exposeString('email'),
    age: t.exposeInt('age', { nullable: true }),
    gender: t.exposeString('gender', { nullable: true }),
    location: t.exposeString('location', { nullable: true }),
    registrationStep: t.exposeInt('registrationStep'),
  }),
});
