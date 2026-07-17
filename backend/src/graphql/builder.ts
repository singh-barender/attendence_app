/**
 * Pothos SchemaBuilder wired to the Prisma plugin (ADR-011) — the single
 * builder instance every GraphQL type, query, and mutation is defined
 * against. Importing this file has the side effect of connecting to Prisma
 * (via db/client.ts), since the Prisma plugin needs a live client instance.
 */
import SchemaBuilder from '@pothos/core';
import PrismaPlugin from '@pothos/plugin-prisma';
import { prisma } from '../db/client';
import type PrismaTypes from '../generated/pothos-prisma-types';
import { getDatamodel } from '../generated/pothos-prisma-types';
import type { GraphQLContext } from './context';

export const builder = new SchemaBuilder<{
  PrismaTypes: PrismaTypes;
  Context: GraphQLContext;
  Scalars: {
    DateTime: { Input: Date; Output: Date };
  };
}>({
  plugins: [PrismaPlugin],
  prisma: {
    client: prisma,
    dmmf: getDatamodel(),
  },
});
