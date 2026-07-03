import { prisma } from '@/db/prisma';

interface CategorySeed {
  name: string;
  slug: string;
  sortOrder: number;
  children?: CategorySeed[];
}

const CATEGORY_TREE: CategorySeed[] = [
  {
    name: 'Women',
    slug: 'women',
    sortOrder: 0,
    children: [
      { name: 'Dresses', slug: 'dresses', sortOrder: 0 },
      { name: 'Tops', slug: 'tops', sortOrder: 1 },
    ],
  },
  {
    name: 'Men',
    slug: 'men',
    sortOrder: 1,
    children: [
      { name: 'Shirts', slug: 'shirts', sortOrder: 0 },
      { name: 'Trousers', slug: 'trousers', sortOrder: 1 },
    ],
  },
  {
    name: 'Kids',
    slug: 'kids',
    sortOrder: 2,
    children: [
      { name: 'Boys', slug: 'boys', sortOrder: 0 },
      { name: 'Girls', slug: 'girls', sortOrder: 1 },
    ],
  },
];

async function upsertCategory(seed: CategorySeed, parentId: string | null): Promise<void> {
  const category = await prisma.category.upsert({
    where: { slug: seed.slug },
    create: {
      name: seed.name,
      slug: seed.slug,
      sortOrder: seed.sortOrder,
      parentId,
    },
    update: {
      name: seed.name,
      sortOrder: seed.sortOrder,
      parentId,
      isActive: true,
    },
  });

  for (const child of seed.children ?? []) {
    await upsertCategory(child, category.id);
  }
}

export async function seedCategories(): Promise<void> {
  for (const category of CATEGORY_TREE) {
    await upsertCategory(category, null);
  }

  const childCount = CATEGORY_TREE.reduce(
    (sum, category) => sum + (category.children?.length ?? 0),
    0,
  );
  console.log(`  categories: ${CATEGORY_TREE.length} top-level, ${childCount} nested`);
}
