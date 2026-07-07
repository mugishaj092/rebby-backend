import { prisma } from '@/db/prisma';

interface CollectionSeed {
  name: string;
  slug: string;
  description: string;
  startsAt?: Date;
  endsAt?: Date;
  productSlugs: string[];
}

const COLLECTIONS: CollectionSeed[] = [
  {
    name: 'New Arrivals',
    slug: 'new-arrivals',
    description: 'The latest additions to the REBY catalog.',
    productSlugs: [
      'ankara-wrap-dress',
      'classic-cotton-blouse',
      'slim-fit-oxford-shirt',
      'tailored-chino-trousers',
    ],
  },
  {
    name: 'Summer Sale',
    slug: 'summer-sale',
    description: 'Discounted favorites for the season.',
    startsAt: new Date('2026-01-01T00:00:00Z'),
    endsAt: new Date('2026-12-31T23:59:59Z'),
    productSlugs: ['ankara-wrap-dress', 'slim-fit-oxford-shirt', 'floral-party-dress-girls'],
  },
];

export async function seedCollections(): Promise<void> {
  let created = 0;
  let skipped = 0;

  for (const seed of COLLECTIONS) {
    const existing = await prisma.collection.findUnique({ where: { slug: seed.slug } });
    if (existing) {
      skipped += 1;
      continue;
    }

    const products = await prisma.product.findMany({
      where: { slug: { in: seed.productSlugs } },
      select: { id: true, slug: true },
    });
    const productIdBySlug = new Map(products.map((p) => [p.slug, p.id]));
    const missing = seed.productSlugs.filter((slug) => !productIdBySlug.has(slug));
    if (missing.length > 0) {
      throw new Error(
        `seedCollections: product(s) not found for collection "${seed.slug}": ${missing.join(', ')} — run seedProducts first`,
      );
    }

    await prisma.collection.create({
      data: {
        name: seed.name,
        slug: seed.slug,
        description: seed.description,
        startsAt: seed.startsAt ?? null,
        endsAt: seed.endsAt ?? null,
        products: {
          create: seed.productSlugs.map((slug, index) => ({
            productId: productIdBySlug.get(slug)!,
            sortOrder: index,
          })),
        },
      },
    });
    created += 1;
  }

  console.log(`  collections: ${created} created, ${skipped} already existed`);
}
