import { prisma } from '@/db/prisma';
import { Prisma } from '@/generated/prisma/client';

import type { ProductFilters, ProductSort } from './types';

// "New arrival" window for the `newArrivals` filter — a named constant per spec 11 §3 rather
// than an inline magic number, so the definition of "recent" lives in exactly one place.
export const NEW_ARRIVALS_WINDOW_DAYS = 30;

function newArrivalsSince(): Date {
  return new Date(Date.now() - NEW_ARRIVALS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

// `compareAtPrice > basePrice` is a column-to-column comparison Prisma's `where` DSL can't
// express (no operator compares two fields of the same row). Resolved via one raw query and
// reused as an `id IN (...)` filter by both entry points, so the "on sale" definition lives in
// exactly one place despite catalog (Prisma query builder) and search (raw SQL) needing it in
// two different shapes.
async function findOnSaleProductIds(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM products
    WHERE compare_at_price IS NOT NULL AND compare_at_price > base_price
  `;
  return rows.map((row) => row.id);
}

function variantRelationFilter(
  filters: ProductFilters,
): Prisma.ProductVariantListRelationFilter | undefined {
  if (!filters.size && !filters.color && filters.availability !== 'in_stock') {
    return undefined;
  }

  return {
    some: {
      ...(filters.size ? { size: filters.size } : {}),
      ...(filters.color ? { color: filters.color } : {}),
      ...(filters.availability === 'in_stock' ? { stock: { gt: 0 } } : {}),
    },
  };
}

// Used by `catalog.listProducts` (Prisma query builder entry point).
export async function buildProductWhereClause(
  filters: ProductFilters,
): Promise<Prisma.ProductWhereInput> {
  const where: Prisma.ProductWhereInput = {};

  if (filters.categoryId) {
    where.categoryId = filters.categoryId;
  }

  const variants = variantRelationFilter(filters);
  if (variants) {
    where.variants = variants;
  }

  if (filters.minPrice || filters.maxPrice) {
    where.basePrice = {
      ...(filters.minPrice ? { gte: filters.minPrice } : {}),
      ...(filters.maxPrice ? { lte: filters.maxPrice } : {}),
    };
  }

  if (filters.newArrivals) {
    where.createdAt = { gte: newArrivalsSince() };
  }

  if (filters.onSale) {
    where.id = { in: await findOnSaleProductIds() };
  }

  return where;
}

// Used by `discovery.searchProducts` (raw-SQL entry point, required for the `tsvector` text
// match Prisma's query builder can't express — see repository.ts). Same filter definitions as
// `buildProductWhereClause` above, translated to a raw AND-ed fragment instead of a Prisma
// where object, aliasing the products table as `p` and joining `product_variants` as `pv` to
// match the shape of the raw query in repository.ts.
export async function buildProductWhereSql(filters: ProductFilters): Promise<Prisma.Sql> {
  const conditions: Prisma.Sql[] = [];

  if (filters.categoryId) {
    conditions.push(Prisma.sql`p.category_id = ${filters.categoryId}`);
  }

  if (filters.size || filters.color || filters.availability === 'in_stock') {
    const variantConditions: Prisma.Sql[] = [Prisma.sql`pv.product_id = p.id`];
    if (filters.size) {
      variantConditions.push(Prisma.sql`pv.size = ${filters.size}`);
    }
    if (filters.color) {
      variantConditions.push(Prisma.sql`pv.color = ${filters.color}`);
    }
    if (filters.availability === 'in_stock') {
      variantConditions.push(Prisma.sql`pv.stock > 0`);
    }
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM product_variants pv WHERE ${Prisma.join(variantConditions, ' AND ')})`,
    );
  }

  if (filters.minPrice) {
    conditions.push(Prisma.sql`p.base_price >= ${filters.minPrice}`);
  }
  if (filters.maxPrice) {
    conditions.push(Prisma.sql`p.base_price <= ${filters.maxPrice}`);
  }

  if (filters.newArrivals) {
    conditions.push(Prisma.sql`p.created_at >= ${newArrivalsSince()}`);
  }

  if (filters.onSale) {
    const ids = await findOnSaleProductIds();
    // An empty array bound to `= ANY(...)` is best avoided (array-type binding edge cases) —
    // `FALSE` is the correct, unambiguous "no on-sale products" condition either way.
    conditions.push(ids.length > 0 ? Prisma.sql`p.id = ANY(${ids})` : Prisma.sql`FALSE`);
  }

  return conditions.length > 0 ? Prisma.sql`AND ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
}

interface SortColumn {
  column: 'created_at' | 'base_price';
  direction: 'asc' | 'desc';
}

// `best_selling` needs Order/OrderItem (spec 16) and `most_popular` needs
// RecentlyViewed/WishlistItem (spec 12/15) — neither exists yet, so both alias to `newest`
// until their forward dependencies ship (spec 11 §3). Sorting always uses `Product.basePrice`,
// never a matching variant's `priceOverride` — list results are product-level rollups (one row
// per product, not per matched variant), so there is no single "the matching variant" to sort
// by once a listing shows many products at once.
function sortColumn(sort: ProductSort): SortColumn {
  switch (sort) {
    case 'price_asc':
      return { column: 'base_price', direction: 'asc' };
    case 'price_desc':
      return { column: 'base_price', direction: 'desc' };
    case 'best_selling':
    case 'most_popular':
    case 'newest':
      return { column: 'created_at', direction: 'desc' };
  }
}

// Used by `catalog.listProducts`.
export function buildProductOrderBy(sort: ProductSort): Prisma.ProductOrderByWithRelationInput[] {
  const { column, direction } = sortColumn(sort);
  return column === 'base_price'
    ? [{ basePrice: direction }, { id: 'desc' }]
    : [{ createdAt: direction }, { id: 'desc' }];
}

// Used by `discovery.searchProducts`'s raw query. `column`/`direction` only ever come from the
// fixed switch above (never user input), so interpolating them via `Prisma.raw` is safe.
export function buildProductOrderBySql(sort: ProductSort): Prisma.Sql {
  const { column, direction } = sortColumn(sort);
  return Prisma.raw(`ORDER BY p.${column} ${direction.toUpperCase()}, p.id ASC`);
}

export interface SearchCursorValue {
  sortValue: string;
  id: string;
}

// Keyset pagination condition for `discovery.searchProducts` — mirrors `buildProductOrderBySql`'s
// column/direction/tie-break choice so "continue after this row" stays consistent with the
// query's own ORDER BY. Catalog doesn't need this: it uses Prisma's native cursor pagination,
// which resolves the equivalent "continue after row X in this orderBy" logic internally.
export function buildSearchCursorSql(sort: ProductSort, cursor?: SearchCursorValue): Prisma.Sql {
  if (!cursor) {
    return Prisma.empty;
  }

  const { column, direction } = sortColumn(sort);
  const comparator = direction === 'desc' ? Prisma.raw('<') : Prisma.raw('>');

  if (column === 'created_at') {
    const value = new Date(cursor.sortValue);
    return Prisma.sql`AND (p.created_at ${comparator} ${value} OR (p.created_at = ${value} AND p.id > ${cursor.id}))`;
  }

  return Prisma.sql`AND (p.base_price ${comparator} ${cursor.sortValue}::numeric OR (p.base_price = ${cursor.sortValue}::numeric AND p.id > ${cursor.id}))`;
}

export function searchSortValue(
  sort: ProductSort,
  row: { createdAt: Date; basePrice: string },
): string {
  return sortColumn(sort).column === 'created_at' ? row.createdAt.toISOString() : row.basePrice;
}

interface RawProductFilterQuery {
  categoryId?: string;
  size?: string;
  color?: string;
  minPrice?: string;
  maxPrice?: string;
  availability?: 'in_stock' | 'all';
  newArrivals?: boolean;
  onSale?: boolean;
}

// Shared translation from the raw (string-based) parsed query into the typed `ProductFilters`
// used by the query builder — money fields become `Decimal` at this service-layer boundary,
// never in the Zod schema itself (per code-standards.md).
export function toProductFilters(query: RawProductFilterQuery): ProductFilters {
  return {
    categoryId: query.categoryId,
    size: query.size,
    color: query.color,
    minPrice: query.minPrice ? new Prisma.Decimal(query.minPrice) : undefined,
    maxPrice: query.maxPrice ? new Prisma.Decimal(query.maxPrice) : undefined,
    availability: query.availability,
    newArrivals: query.newArrivals,
    onSale: query.onSale,
  };
}
