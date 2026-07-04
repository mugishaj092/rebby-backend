import { ConflictError, NotFoundError } from '@/core/errors/AppError';
import { slugify } from '@/core/utils/slugify';
import { Prisma } from '@/generated/prisma/client';
import type { Category, Product, ProductVariant } from '@/generated/prisma/client';

import { catalogRepository } from './repository';
import type {
  AddVariantInput,
  CreateCategoryInput,
  CreateProductInput,
  ListCategoriesQuery,
  UpdateCategoryInput,
  UpdateProductInput,
  UpdateVariantInput,
} from './schema';

const SLUG_COLLISION_MAX_ATTEMPTS = 20;

export interface CategoryTreeNode extends Category {
  children: CategoryTreeNode[];
}

async function generateUniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 1;

  while (await catalogRepository.findCategoryBySlug(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
    if (suffix > SLUG_COLLISION_MAX_ATTEMPTS) {
      throw new ConflictError('Unable to generate a unique slug for this category');
    }
  }

  return candidate;
}

async function assertSlugAvailable(slug: string): Promise<void> {
  const existing = await catalogRepository.findCategoryBySlug(slug);
  if (existing) {
    throw new ConflictError('A category with this slug already exists');
  }
}

// The pre-check in assertSlugAvailable/generateUniqueSlug is check-then-act, not atomic — two
// concurrent requests can both pass it for the same slug. This catches the DB's unique
// constraint violation that results from losing that race, so it still surfaces as a clean
// ConflictError instead of an unhandled Prisma error.
async function runWithSlugConflictGuard<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError('A category with this slug already exists');
    }
    throw err;
  }
}

async function assertParentIsUsable(parentId: string): Promise<void> {
  const parent = await catalogRepository.findCategoryById(parentId);
  if (!parent || !parent.isActive) {
    throw new NotFoundError('Parent category not found');
  }
}

// Walk the new parent's ancestor chain: if categoryId appears on it, newParentId is either
// categoryId itself or one of its descendants, which would create a cycle in the tree.
async function assertNoCycle(categoryId: string, newParentId: string): Promise<void> {
  let currentId: string | null = newParentId;
  const visited = new Set<string>();

  while (currentId) {
    if (currentId === categoryId) {
      throw new ConflictError('A category cannot be set as its own ancestor');
    }
    if (visited.has(currentId)) {
      break;
    }
    visited.add(currentId);

    const current: Category | null = await catalogRepository.findCategoryById(currentId);
    currentId = current?.parentId ?? null;
  }
}

export async function createCategory(
  _staffId: string,
  input: CreateCategoryInput,
): Promise<Category> {
  if (input.parentId) {
    await assertParentIsUsable(input.parentId);
  }

  const slug = input.slug ?? (await generateUniqueSlug(input.name));
  if (input.slug) {
    await assertSlugAvailable(input.slug);
  }

  return runWithSlugConflictGuard(() =>
    catalogRepository.createCategory({
      name: input.name,
      slug,
      parentId: input.parentId ?? null,
      imageUrl: input.imageUrl ?? null,
      sortOrder: input.sortOrder,
    }),
  );
}

export async function updateCategory(
  _staffId: string,
  id: string,
  input: UpdateCategoryInput,
): Promise<Category> {
  const category = await catalogRepository.findCategoryById(id);
  if (!category) {
    throw new NotFoundError('Category not found');
  }

  if (input.parentId && input.parentId !== category.parentId) {
    await assertParentIsUsable(input.parentId);
    await assertNoCycle(id, input.parentId);
  }

  if (input.slug && input.slug !== category.slug) {
    await assertSlugAvailable(input.slug);
  }

  return runWithSlugConflictGuard(() =>
    catalogRepository.updateCategory(id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    }),
  );
}

export async function deleteCategory(_staffId: string, id: string): Promise<void> {
  const category = await catalogRepository.findCategoryById(id);
  if (!category) {
    throw new NotFoundError('Category not found');
  }

  const activeChildren = await catalogRepository.countActiveChildren(id);
  if (activeChildren > 0) {
    throw new ConflictError('Cannot delete a category that has active children');
  }

  const activeProducts = await catalogRepository.countActiveProductsByCategory(id);
  if (activeProducts > 0) {
    throw new ConflictError('Cannot delete a category that has active products');
  }

  await catalogRepository.deleteCategory(id);
}

export async function getCategory(id: string): Promise<Category> {
  const category = await catalogRepository.findCategoryById(id);
  if (!category) {
    throw new NotFoundError('Category not found');
  }
  return category;
}

export function listCategories(query: ListCategoriesQuery): Promise<Category[]> {
  return catalogRepository.listCategories({
    parentId: query.parentId ?? null,
    activeOnly: query.activeOnly ?? true,
  });
}

export async function getCategoryTree(activeOnly = true): Promise<CategoryTreeNode[]> {
  const categories = await catalogRepository.listAllCategories(activeOnly);

  const nodesById = new Map<string, CategoryTreeNode>(
    categories.map((category) => [category.id, { ...category, children: [] }]),
  );
  const roots: CategoryTreeNode[] = [];

  for (const category of categories) {
    // nodesById was built from this exact array, so both lookups are always defined:
    // listAllCategories() fetches every category in one query, and the parentId FK
    // guarantees a referenced parent is always present in that same result set.
    const node = nodesById.get(category.id)!;
    if (category.parentId) {
      nodesById.get(category.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

// ---- Products & Variants (Spec 07) ----------------------------

async function generateUniqueProductSlug(name: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 1;

  while (await catalogRepository.findProductBySlug(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
    if (suffix > SLUG_COLLISION_MAX_ATTEMPTS) {
      throw new ConflictError('Unable to generate a unique slug for this product');
    }
  }

  return candidate;
}

async function assertProductSlugAvailable(slug: string): Promise<void> {
  const existing = await catalogRepository.findProductBySlug(slug);
  if (existing) {
    throw new ConflictError('A product with this slug already exists');
  }
}

async function assertCategoryUsable(categoryId: string): Promise<void> {
  const category = await catalogRepository.findCategoryById(categoryId);
  if (!category) {
    throw new NotFoundError('Category not found');
  }
}

// Prisma v7 with a driver adapter (this project uses @prisma/adapter-pg) does not populate the
// classic `err.meta.target` on a P2002 — the violated constraint's columns instead live at
// `err.meta.driverAdapterError.cause.constraint.fields` (verified against a real Postgres unique
// violation). Both shapes are checked so this keeps working if a future Prisma version restores
// `meta.target` for driver adapters.
function conflictFieldsFromError(err: Prisma.PrismaClientKnownRequestError): string[] {
  const target = err.meta?.target;
  if (Array.isArray(target)) {
    return target;
  }

  const driverFields = (
    err.meta?.driverAdapterError as
      | { cause?: { constraint?: { fields?: unknown } } }
      | undefined
  )?.cause?.constraint?.fields;
  return Array.isArray(driverFields) ? driverFields : [];
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
    const existing = await catalogRepository.findVariantBySku(sku);
    if (existing) {
      throw new ConflictError(`SKU already exists: ${sku}`);
    }
  }

  const slug = input.slug ?? (await generateUniqueProductSlug(input.name));
  if (input.slug) {
    await assertProductSlugAvailable(input.slug);
  }

  return runWithConflictGuard(() =>
    catalogRepository.createProductWithVariants({
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
  const product = await catalogRepository.findProductById(id);
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
    catalogRepository.updateProduct(id, {
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
  );
}

export async function deleteProduct(_staffId: string, id: string): Promise<void> {
  const product = await catalogRepository.findProductById(id);
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  await catalogRepository.softDeleteProduct(id);
}

export async function addVariant(
  _staffId: string,
  productId: string,
  input: AddVariantInput,
): Promise<ProductVariant> {
  const product = await catalogRepository.findProductById(productId);
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  const existingSku = await catalogRepository.findVariantBySku(input.sku);
  if (existingSku) {
    throw new ConflictError(`SKU already exists: ${input.sku}`);
  }

  return runWithConflictGuard(() =>
    catalogRepository.addVariant(productId, {
      size: input.size,
      color: input.color,
      sku: input.sku,
      priceOverride: input.priceOverride ? new Prisma.Decimal(input.priceOverride) : null,
      stock: input.stock,
    }),
  );
}

// Allowed to write `stock` directly — this is a deliberate, narrow exception to the golden
// rule that ProductVariant.stock only changes through the inventory choke point
// (commitOrderStock/releaseOrderStock, Spec 17). This function exists for administrative stock
// correction at the catalog-management level (e.g. a staff member reconciling a manual stock
// count), never for order-driven fulfillment — order/checkout code must not call this.
export async function updateVariant(
  _staffId: string,
  variantId: string,
  input: UpdateVariantInput,
): Promise<ProductVariant> {
  const variant = await catalogRepository.findVariantById(variantId);
  if (!variant) {
    throw new NotFoundError('Variant not found');
  }

  if (input.sku && input.sku !== variant.sku) {
    const existingSku = await catalogRepository.findVariantBySku(input.sku);
    if (existingSku) {
      throw new ConflictError(`SKU already exists: ${input.sku}`);
    }
  }

  return runWithConflictGuard(() =>
    catalogRepository.updateVariant(variantId, {
      ...(input.size !== undefined ? { size: input.size } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.sku !== undefined ? { sku: input.sku } : {}),
      ...(input.priceOverride !== undefined
        ? { priceOverride: new Prisma.Decimal(input.priceOverride) }
        : {}),
      ...(input.stock !== undefined ? { stock: input.stock } : {}),
    }),
  );
}

export async function removeVariant(_staffId: string, variantId: string): Promise<void> {
  const variant = await catalogRepository.findVariantById(variantId);
  if (!variant) {
    throw new NotFoundError('Variant not found');
  }

  await catalogRepository.removeVariant(variantId);
}
