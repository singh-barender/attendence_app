/**
 * Exports the Pothos-built schema as static SDL so app's codegen
 * (ADR-012) can read it without a running dev server — codegen needs a
 * schema source, and Pothos is code-first so no .graphql schema file exists
 * otherwise. Output is gitignored, regenerated via `pnpm print-schema`.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lexicographicSortSchema, printSchema } from 'graphql';
import { schema } from '../graphql/schema';

const outputPath = join(__dirname, '../../schema.graphql');
const sdl = printSchema(lexicographicSortSchema(schema));

writeFileSync(outputPath, `${sdl}\n`, 'utf-8');

console.log(`Schema written to ${outputPath}`);
