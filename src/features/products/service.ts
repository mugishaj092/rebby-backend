import * as categoriesService from '@/features/categories/service';
import { ConflictError, NotFoundError } from '@/core/errors/AppError';
import { conflictFieldsFromError } from '@/core/errors/prismaConflict';
import { withNotFoundOnP2025 } from '@/core/errors/prismaRaceGuard';
import type { CursorPage } from '@/core/validation/pagination';
import { slugify } from '@/core/utils/slugify';
import { toProductFilters } from '@/features/discovery/queryBuilder';
import { Prisma } from '@/generated/prisma/client';
import type { Category, Product, ProductImage, ProductVariant } from '@/generated/prisma/client';

import type { ProductListItem } from './repository';
import { productsRepository } from './repository';
import type { CreateProductInput, ListProductsQuery, UpdateProductInput } from './schema';

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

  return withNotFoundOnP2025(
    () =>
      runWithConflictGuard(() =>
        productsRepository.updateProduct(id, {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.fabric !== undefined ? { fabric: input.fabric } : {}),
          ...(input.careInstructions !== undefined
            ? { careInstructions: input.careInstructions }
            : {}),
          ...(input.basePrice !== undefined
            ? { basePrice: new Prisma.Decimal(input.basePrice) }
            : {}),
          ...(input.compareAtPrice !== undefined
            ? { compareAtPrice: new Prisma.Decimal(input.compareAtPrice) }
            : {}),
        }),
      ),
    'Product not found',
  );
}

export async function deleteProduct(_staffId: string, id: string): Promise<void> {
  const product = await productsRepository.findProductById(id);
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  await withNotFoundOnP2025(() => productsRepository.softDeleteProduct(id), 'Product not found');
}

// ---- Cross-feature reads (variants, collections, banners) ------

export async function productExists(id: string): Promise<boolean> {
  const product = await productsRepository.findProductById(id);
  return product !== null;
}

export function findActiveProductIds(productIds: string[]): Promise<string[]> {
  return productsRepository.findActiveProductIds(productIds);
}

// ---- Public read endpoints (spec 09) ------

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function listProducts(query: ListProductsQuery): Promise<CursorPage<ProductListItem>> {
  const { items, hasMore } = await productsRepository.listProducts({
    collectionId: query.collectionId,
    filters: toProductFilters(query),
    sort: query.sort,
    cursor: query.cursor,
    limit: query.limit,
  });
  return {
    items,
    nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
  };
}

export interface ProductDetail extends Product {
  category: Category | null;
  images: ProductImage[];
  variants: ProductVariant[];
}

// relatedProducts is intentionally out of scope for this spec (belongs to a later
// discovery/nice-to-have spec) — per spec 09 §2's explicit instruction to leave this marker
// rather than build it now.
// TODO(spec: discovery/related-products): compute and attach relatedProducts here.
export async function getProductDetail(idOrSlug: string): Promise<ProductDetail> {
  const product = UUID_PATTERN.test(idOrSlug)
    ? await productsRepository.findPublicProductDetailById(idOrSlug)
    : await productsRepository.findPublicProductDetailBySlug(idOrSlug);

  if (!product) {
    throw new NotFoundError('Product not found');
  }

  return product;
}
