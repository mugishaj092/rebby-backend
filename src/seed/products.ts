import { prisma } from '@/db/prisma';
import { Prisma } from '@/generated/prisma/client';

interface VariantSeed {
  size: string;
  color: string;
  sku: string;
  stock: number;
}

interface ProductSeed {
  name: string;
  slug: string;
  categorySlug: string;
  description: string;
  fabric: string;
  careInstructions: string;
  basePrice: string;
  compareAtPrice?: string;
  imageUrl: string;
  variants: VariantSeed[];
}

const PRODUCTS: ProductSeed[] = [
  {
    name: 'Ankara Wrap Dress',
    slug: 'ankara-wrap-dress',
    categorySlug: 'dresses',
    description:
      'A vibrant Ankara wrap dress cut from bold African print cotton, cinched at the waist for a flattering silhouette. Perfect for weddings and weekend outings.',
    fabric: '100% cotton Ankara print',
    careInstructions: 'Hand wash cold, hang dry, cool iron only',
    basePrice: '45.00',
    compareAtPrice: '55.00',
    imageUrl: 'https://placehold.co/600x800?text=Ankara+Wrap+Dress',
    variants: [
      { size: 'S', color: 'Orange', sku: 'DRS-ANK-001-S-ORG', stock: 12 },
      { size: 'M', color: 'Orange', sku: 'DRS-ANK-001-M-ORG', stock: 8 },
      { size: 'L', color: 'Blue', sku: 'DRS-ANK-001-L-BLU', stock: 0 },
    ],
  },
  {
    name: 'Classic Cotton Blouse',
    slug: 'classic-cotton-blouse',
    categorySlug: 'tops',
    description:
      'A lightweight, breathable blouse in soft cotton poplin, tailored for an easy everyday fit. Pairs well with trousers or a wrap skirt.',
    fabric: '100% cotton poplin',
    careInstructions: 'Machine wash cold, tumble dry low',
    basePrice: '28.00',
    imageUrl: 'https://placehold.co/600x800?text=Cotton+Blouse',
    variants: [
      { size: 'S', color: 'White', sku: 'TOP-CCB-001-S-WHT', stock: 15 },
      { size: 'M', color: 'White', sku: 'TOP-CCB-001-M-WHT', stock: 10 },
      { size: 'M', color: 'Black', sku: 'TOP-CCB-001-M-BLK', stock: 6 },
    ],
  },
  {
    name: 'Slim Fit Oxford Shirt',
    slug: 'slim-fit-oxford-shirt',
    categorySlug: 'shirts',
    description:
      'A crisp Oxford shirt in a slim fit, woven from durable cotton twill. A wardrobe staple for the office or a night out.',
    fabric: '100% cotton Oxford twill',
    careInstructions: 'Machine wash cold, iron on medium heat',
    basePrice: '38.00',
    compareAtPrice: '42.00',
    imageUrl: 'https://placehold.co/600x800?text=Oxford+Shirt',
    variants: [
      { size: 'M', color: 'Light Blue', sku: 'SHT-OXF-001-M-LBL', stock: 20 },
      { size: 'L', color: 'Light Blue', sku: 'SHT-OXF-001-L-LBL', stock: 14 },
      { size: 'L', color: 'White', sku: 'SHT-OXF-001-L-WHT', stock: 9 },
    ],
  },
  {
    name: 'Tailored Chino Trousers',
    slug: 'tailored-chino-trousers',
    categorySlug: 'trousers',
    description:
      'Tailored chino trousers in a mid-weight cotton twill, finished with a flat front and tapered leg for a clean, modern line.',
    fabric: '98% cotton, 2% elastane twill',
    careInstructions: 'Machine wash cold, do not bleach',
    basePrice: '42.00',
    imageUrl: 'https://placehold.co/600x800?text=Chino+Trousers',
    variants: [
      { size: '32', color: 'Khaki', sku: 'TRS-CHN-001-32-KHK', stock: 11 },
      { size: '34', color: 'Khaki', sku: 'TRS-CHN-001-34-KHK', stock: 7 },
      { size: '34', color: 'Navy', sku: 'TRS-CHN-001-34-NVY', stock: 0 },
    ],
  },
  {
    name: 'Denim Overalls for Boys',
    slug: 'denim-overalls-boys',
    categorySlug: 'boys',
    description:
      'Hard-wearing denim overalls for boys, with adjustable straps and reinforced knees built for play.',
    fabric: '100% cotton denim',
    careInstructions: 'Machine wash cold, tumble dry low',
    basePrice: '24.00',
    imageUrl: 'https://placehold.co/600x800?text=Denim+Overalls',
    variants: [
      { size: '4Y', color: 'Denim Blue', sku: 'KID-OVR-001-4Y-DBL', stock: 10 },
      { size: '6Y', color: 'Denim Blue', sku: 'KID-OVR-001-6Y-DBL', stock: 5 },
    ],
  },
  {
    name: 'Floral Party Dress for Girls',
    slug: 'floral-party-dress-girls',
    categorySlug: 'girls',
    description:
      'A twirl-ready party dress for girls in a soft floral print, with a satin sash and tiered skirt for special occasions.',
    fabric: '100% polyester crepe',
    careInstructions: 'Hand wash cold, hang dry',
    basePrice: '32.00',
    compareAtPrice: '38.00',
    imageUrl: 'https://placehold.co/600x800?text=Floral+Party+Dress',
    variants: [
      { size: '4Y', color: 'Pink', sku: 'KID-FLD-001-4Y-PNK', stock: 8 },
      { size: '6Y', color: 'Pink', sku: 'KID-FLD-001-6Y-PNK', stock: 4 },
    ],
  },
];

export async function seedProducts(): Promise<void> {
  let created = 0;
  let skipped = 0;

  for (const seed of PRODUCTS) {
    const category = await prisma.category.findUnique({ where: { slug: seed.categorySlug } });
    if (!category) {
      throw new Error(
        `seedProducts: category "${seed.categorySlug}" not found — run seedCategories first`,
      );
    }

    const existing = await prisma.product.findUnique({ where: { slug: seed.slug } });
    if (existing) {
      skipped += 1;
      continue;
    }

    await prisma.product.create({
      data: {
        name: seed.name,
        slug: seed.slug,
        categoryId: category.id,
        description: seed.description,
        fabric: seed.fabric,
        careInstructions: seed.careInstructions,
        basePrice: new Prisma.Decimal(seed.basePrice),
        compareAtPrice: seed.compareAtPrice ? new Prisma.Decimal(seed.compareAtPrice) : null,
        images: { create: [{ url: seed.imageUrl, sortOrder: 0, isPrimary: true }] },
        variants: { create: seed.variants },
      },
    });
    created += 1;
  }

  console.log(`  products: ${created} created, ${skipped} already existed`);
}
