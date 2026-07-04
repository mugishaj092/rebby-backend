import * as categoriesService from '@/features/categories/service';
import { ConflictError, NotFoundError } from '@/core/errors/AppError';
import { conflictFieldsFromError } from '@/core/errors/prismaConflict';
import { slugify } from '@/core/utils/slugify';
import { Prisma } from '@/generated/prisma/client';
import type { Product, ProductVariant } from '@/generated/prisma/client';

import { productsRepository } from './repository';
import type { CreateProductInput, UpdateProductInput } from './schema';

const SLUG_COLLISION_MAX_ATTEMPTS = 20;

async function generateUniqueProductSlug(name: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 1;

  while (await productsRepository.findProductBySlug(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
    if (suffix > SLUG_COLLISION_MAX_ATTEMPTS) {
      throw new ConflictError('Unable to generate a unique slug for this product');
    }
  }

  return candidate;
}

async function assertProductSlugAvailable(slug: string): Promise<void> {
  const existing = await productsRepository.findProductBySlug(slug);
  if (existing) {
    throw new ConflictError('A product with this slug already exists');
  }
}

async function assertCategoryUsable(categoryId: string): Promise<void> {
  if (!(await categoriesService.categoryExists(categoryId))) {
    throw new NotFoundError('Category not found');
  }
}

function conflictMessageForFields(fields: string[]): string {
  if (fields.includes('slug')) {
    return 'A product with this slug already exists';
  }
  if (fields.includes('sku')) {
    return 'A variant with this SKU already exists';
  }
  if (fields.includes('size') || fields.includes('color') || fields.includes('product_id')) {
    return 'This product already has a variant with this size and color combination';
  }
  return 'A conflicting record already exists';
}

// The pre-checks above (slug/SKU/size+color lookups) are check-then-act, not atomic — two
// concurrent staff requests can both pass them before either write commits. This catches the
// resulting DB-level unique constraint violation so it still surfaces as a clean ConflictError,
// mirroring the same guard already applied to category slugs.
async function runWithConflictGuard<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError(conflictMessageForFields(conflictFieldsFromError(err)));
    }
    throw err;
  }
}

export interface ProductWithRelations extends Product {
  images: { id: string; url: string; sortOrder: number; isPrimary: boolean }[];
  variants: ProductVariant[];
}

export async function createProduct(
  _staffId: string,
  input: CreateProductInput,
): Promise<ProductWithRelations> {
  if (input.categoryId) {
    await assertCategoryUsable(input.categoryId);
  }

  const skusInPayload = input.variants.map((variant) => variant.sku);
  const duplicateSku = skusInPayload.find((sku, index) => skusInPayload.indexOf(sku) !== index);
  if (duplicateSku) {
    throw new ConflictError(`Duplicate SKU in request: ${duplicateSku}`);
  }

  for (const sku of skusInPayload) {
    const existing = await productsRepository.findVariantBySku(sku);
    if (existing) {
      throw new ConflictError(`SKU already exists: ${sku}`);
    }
  }

  const slug = input.slug ?? (await generateUniqueProductSlug(input.name));
  if (input.slug) {
    await assertProductSlugAvailable(input.slug);
  }

  return runWithConflictGuard(() =>
    productsRepository.createProductWithVariants({
      name: input.name,
      slug,
      categoryId: input.categoryId ?? null,
      description: input.description ?? null,
      fabric: input.fabric ?? null,
      careInstructions: input.careInstructions ?? null,
      basePrice: new Prisma.Decimal(input.basePrice),
      compareAtPrice: input.compareAtPrice ? new Prisma.Decimal(input.compareAtPrice) : null,
      images: (input.images ?? []).map((image) => ({
        url: image.url,
        sortOrder: image.sortOrder,
        isPrimary: image.isPrimary,
      })),
      variants: input.variants.map((variant) => ({
        size: variant.size,
        color: variant.color,
        sku: variant.sku,
        priceOverride: variant.priceOverride ? new Prisma.Decimal(variant.priceOverride) : null,
        stock: variant.stock,
      })),
    }),
  );
}

export async function updateProduct(
  _staffId: string,
  id: string,
  input: UpdateProductInput,
): Promise<Product> {
  const product = await productsRepository.findProductById(id);
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  if (input.categoryId) {
    await assertCategoryUsable(input.categoryId);
  }

  if (input.slug && input.slug !== product.slug) {
    await assertProductSlugAvailable(input.slug);
  }

  return runWithConflictGuard(() =>
    productsRepository.updateProduct(id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.fabric !== undefined ? { fabric: input.fabric } : {}),
      ...(input.careInstructions !== undefined ? { careInstructions: input.careInstructions } : {}),
      ...(input.basePrice !== undefined ? { basePrice: new Prisma.Decimal(input.basePrice) } : {}),
      ...(input.compareAtPrice !== undefined
        ? { compareAtPrice: new Prisma.Decimal(input.compareAtPrice) }
        : {}),
    }),
  );
}

export async function deleteProduct(_staffId: string, id: string): Promise<void> {
  const product = await productsRepository.findProductById(id);
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  await productsRepository.softDeleteProduct(id);
}

// ---- Cross-feature reads (variants, collections, banners) ------

export async function productExists(id: string): Promise<boolean> {
  const product = await productsRepository.findProductById(id);
  return product !== null;
}

export function findActiveProductIds(productIds: string[]): Promise<string[]> {
  return productsRepository.findActiveProductIds(productIds);
}
