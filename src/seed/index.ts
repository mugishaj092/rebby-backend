import { prisma } from '@/db/prisma';

import { seedAdmin } from './admin';
import { seedCategories } from './categories';
import { seedCustomer } from './customer';

async function main(): Promise<void> {
  console.log('Seeding admin...');
  await seedAdmin();

  console.log('Seeding customer...');
  await seedCustomer();

  console.log('Seeding categories...');
  await seedCategories();

  console.log('Seed complete.');
}

main()
  .catch((err: unknown) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
