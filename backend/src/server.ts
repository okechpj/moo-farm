import { env } from './config/env';
import { prisma } from './config/prisma';
import { createApp } from './app';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(
    `Moo Farm API listening on http://localhost:${env.PORT} (${env.NODE_ENV}, TZ=${env.APP_TIMEZONE})`,
  );
});

async function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down gracefully...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
