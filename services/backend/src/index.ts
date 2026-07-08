/** Backend entry point — builds the app (app.ts) and starts listening. */
import { buildApp } from './app';
import { config } from './config';

async function main(): Promise<void> {
  const app = await buildApp();
  await app.listen({ port: config.port, host: '0.0.0.0' });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
