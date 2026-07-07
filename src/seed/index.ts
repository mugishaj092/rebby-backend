import { prisma } from '@/db/prisma';

import { seedAdmin } from './admin';
import { seedBanners } from './banners';
import { seedCategories } from './categories';
import { seedCollections } from './collections';
import { seedCustomer } from './customer';
import { assertNotProduction } from './guard';
import { seedProducts } from './products';

async function main(): Promise<void> {
  assertNotProduction();

  console.log('Seeding admin...');
  await seedAdmin();

  console.log('Seeding customer...');
  await seedCustomer();

  console.log('Seeding categories...');
  await seedCategories();

  console.log('Seeding products...');
  await seedProducts();

  console.log('Seeding collections...');
  await seedCollections();

  console.log('Seeding banners...');
  await seedBanners();

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
