import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

/**
 * Ensures database-level partial unique constraints that Prisma's declarative
 * schema syntax cannot express directly (such as preventing duplicate active
 * milking sessions while still allowing superseded historical records).
 */
async function applyConstraints() {
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
  });

  try {
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_active_milk_session
      ON milk_productions (farm_id, animal_id, record_date, session)
      WHERE is_superseded = false;
    `);
    console.log('Verified partial unique index: uq_active_milk_session');
  } finally {
    await prisma.$disconnect();
  }
}

applyConstraints().catch((err) => {
  console.error('Failed to apply SQL constraints:', err);
  process.exit(1);
});
