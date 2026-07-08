/**
 * Single Prisma client instance for the whole backend — Prisma 7 requires an
 * explicit driver adapter (the schema.prisma `datasource` block no longer
 * carries a connection URL; see prisma.config.ts and ADR-003).
 */
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { config } from '../config';
import { PrismaClient } from '../generated/prisma/client';

const adapter = new PrismaBetterSqlite3({ url: config.databaseUrl });

export const prisma = new PrismaClient({ adapter });
