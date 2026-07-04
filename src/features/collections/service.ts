import * as productsService from '@/features/products/service';
import { ConflictError, NotFoundError } from '@/core/errors/AppError';
import { withNotFoundOnP2025 } from '@/core/errors/prismaRaceGuard';
import { assertDateOrder } from '@/core/validation/dateOrder';
import { slugify } from '@/core/utils/slugify';
import { Prisma } from '@/generated/prisma/client';
import type { Collection, Product } from '@/generated/prisma/client';

import { collectionsRepository } from './repository';
import type { CreateCollectionInput, UpdateCollectionInput } from './schema';

const SLUG_COLLISION_MAX_ATTEMPTS = 20;

async function generateUniqueCollectionSlug(name: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 1;

  while (await collectionsRepository.findCollectionBySlug(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
    if (suffix > SLUG_COLLISION_MAX_ATTEMPTS) {
      throw new ConflictError('Unable to generate a unique slug for this collection');
    }
  }

  return candidate;
}

async function assertCollectionSlugAvailable(slug: string): Promise<void> {
  const existing = await collectionsRepository.findCollectionBySlug(slug);
  if (existing) {
    throw new ConflictError('A collection with this slug already exists');
  }
}

async function assertProductsExist(productIds: string[]): Promise<void> {
  if (productIds.length === 0) {
    return;
  }

  const activeIds = new Set(await productsService.findActiveProductIds(productIds));
  const missing = productIds.filter((id) => !activeIds.has(id));
  if (missing.length > 0) {
    throw new NotFoundError(`One or more products not found or inactive: ${missing.join(', ')}`);
  }
}

// The pre-check (findCollectionBySlug) is check-then-act, not atomic — mirrors the same
// TOCTOU guard already applied to category/product slugs.
async function runWithCollectionConflictGuard<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError('A collection with this slug already exists');
    }
    throw err;
  }
}

export async function createCollection(
  _staffId: string,
  input: CreateCollectionInput,
): Promise<Collection> {
  const slug = input.slug ?? (await generateUniqueCollectionSlug(input.name));
  if (input.slug) {
    await assertCollectionSlugAvailable(input.slug);
  }

  const productIds = input.productIds ?? [];
  await assertProductsExist(productIds);

  const collection = await runWithCollectionConflictGuard(() =>
    collectionsRepository.createCollection({
      name: input.name,
      slug,
      description: input.description ?? null,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
    }),
  );

  if (productIds.length > 0) {
    await collectionsRepository.setCollectionProducts(collection.id, productIds);
  }

  return collection;
}

export async function updateCollection(
  _staffId: string,
  id: string,
  input: UpdateCollectionInput,
): Promise<Collection> {
  const collection = await collectionsRepository.findCollectionById(id);
  if (!collection) {
    throw new NotFoundError('Collection not found');
  }

  if (input.slug && input.slug !== collection.slug) {
    await assertCollectionSlugAvailable(input.slug);
  }

  const startsAt = input.startsAt !== undefined ? input.startsAt : collection.startsAt;
  const endsAt = input.endsAt !== undefined ? input.endsAt : collection.endsAt;
  assertDateOrder(startsAt, endsAt);

  return withNotFoundOnP2025(
    () =>
      runWithCollectionConflictGuard(() =>
        collectionsRepository.updateCollection(id, {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
          ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
        }),
      ),
    'Collection not found',
  );
}

export async function deleteCollection(_staffId: string, id: string): Promise<void> {
  const collection = await collectionsRepository.findCollectionById(id);
  if (!collection) {
    throw new NotFoundError('Collection not found');
  }

  await withNotFoundOnP2025(
    () => collectionsRepository.deleteCollection(id),
    'Collection not found',
  );
}

export async function updateCollectionProducts(
  _staffId: string,
  collectionId: string,
  productIds: string[],
): Promise<void> {
  const collection = await collectionsRepository.findCollectionById(collectionId);
  if (!collection) {
    throw new NotFoundError('Collection not found');
  }

  await assertProductsExist(productIds);

  await collectionsRepository.setCollectionProducts(collectionId, productIds);
}

export function listActiveCollections(): Promise<Collection[]> {
  return collectionsRepository.listActiveCollections();
}

export interface CollectionWithProducts extends Collection {
  products: Product[];
}

export async function getCollectionBySlug(slug: string): Promise<CollectionWithProducts> {
  const collection = await collectionsRepository.findActiveCollectionBySlugWithProducts(slug);
  if (!collection) {
    throw new NotFoundError('Collection not found');
  }

  return {
    ...collection,
    products: collection.products.map((entry) => entry.product),
  };
}

// Cross-feature read used by banners (linkType: "collection" resolution).
export async function collectionExists(id: string): Promise<boolean> {
  const collection = await collectionsRepository.findCollectionById(id);
  return collection !== null;
}

// Used to resolve a slug to an id for the /collections/:slug/products listing route. Deliberately
// does not require the collection to currently be within its active promotional window — this
// is a "browse this collection's products" read, not the home-screen visibility surface that
// listActiveCollections/getCollectionBySlug serve.
export async function getCollectionIdBySlug(slug: string): Promise<string> {
  const collection = await collectionsRepository.findCollectionBySlug(slug);
  if (!collection) {
    throw new NotFoundError('Collection not found');
  }
  return collection.id;
}

// Used by the home feature to compose getHomeSections() — returns active collections with
// their active-product sets already embedded, matching what the storefront needs in one shot.
export async function listActiveCollectionsWithProducts(): Promise<CollectionWithProducts[]> {
  const collections = await collectionsRepository.listActiveCollectionsWithProducts();
  return collections.map((collection) => ({
    ...collection,
    products: collection.products.map((entry) => entry.product),
  }));
}
