import { createApp } from '@/app';
import { env } from '@/config/env';
import { prisma } from '@/db/prisma';

async function main(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
  console.log('Database connection established successfully');

  const app = createApp();

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(env.PORT, () => {
      server.off('error', reject);
      console.log(`REBY backend listening on port ${env.PORT} [${env.NODE_ENV}]`);
      resolve();
    });

    server.once('error', reject);
  });
}

main().catch((err: unknown) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
