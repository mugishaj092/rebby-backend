import { prisma } from '@/db/prisma';
import { Prisma } from '@/generated/prisma/client';
import type { ProductListItem } from '@/features/products/repository';

// Same select shape as products/repository.ts's private `productListSelect` — duplicated here
// rather than imported, since that const isn't exported (only the `ProductListItem` type is,
// which this module reuses via a type-only import per the discovery/products decision log).
const productListSelect = {
  id: true,
  name: true,
  slug: true,
  basePrice: true,
  compareAtPrice: true,
  images: {
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
    take: 1,
    select: { url: true },
  },
  variants: {
    where: { stock: { gt: 0 } },
    take: 1,
    select: { id: true },
  },
} satisfies Prisma.ProductSelect;

type ProductListRow = Prisma.ProductGetPayload<{ select: typeof productListSelect }>;

function toListItem(row: ProductListRow): ProductListItem {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    basePrice: row.basePrice,
    compareAtPrice: row.compareAtPrice,
    primaryImageUrl: row.images[0]?.url ?? null,
    inStock: row.variants.length > 0,
  };
}

interface SearchProductsFilter {
  query: string;
  afterRank?: number;
  afterId?: string;
  limit: number;
}

interface SearchRow {
  id: string;
  name: string;
  slug: string;
  basePrice: string;
  compareAtPrice: string | null;
  primaryImageUrl: string | null;
  inStock: boolean;
  rank: number;
}

interface SearchProductsResult {
  items: ProductListItem[];
  hasMore: boolean;
  lastRank: number | null;
}

export interface SkuSearchResult {
  product: ProductListItem;
  variant: { id: string; size: string; color: string; sku: string };
}

export const discoveryRepository = {
  // Ranked full-text search — Prisma's query builder has no `tsvector`/`ts_rank` operators, so
  // this goes through `$queryRaw`. Ranking isn't monotonic with `id`, so a plain "last-seen id"
  // cursor (as used by products.listProducts) can't express "continue after this ranked row" —
  // pagination instead keys off `(rank, id)`, matching the `ORDER BY rank DESC, id ASC` below.
  async searchProducts({
    query,
    afterRank,
    afterId,
    limit,
  }: SearchProductsFilter): Promise<SearchProductsResult> {
    const cursorFilter =
      afterRank !== undefined && afterId !== undefined
        ? Prisma.sql`AND (rank < ${afterRank} OR (rank = ${afterRank} AND id > ${afterId}))`
        : Prisma.empty;

    const rows = await prisma.$queryRaw<SearchRow[]>`
      WITH ranked AS (
        SELECT
          p.id,
          p.name,
          p.slug,
          p.base_price AS "basePrice",
          p.compare_at_price AS "compareAtPrice",
          (
            SELECT pi.url FROM product_images pi
            WHERE pi.product_id = p.id
            ORDER BY pi.is_primary DESC, pi.sort_order ASC
            LIMIT 1
          ) AS "primaryImageUrl",
          EXISTS (
            SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.stock > 0
          ) AS "inStock",
          ts_rank(p.search_vector, plainto_tsquery('english', ${query})) AS rank
        FROM products p
        WHERE p.is_active = true
          AND p.deleted_at IS NULL
          AND p.search_vector @@ plainto_tsquery('english', ${query})
      )
      SELECT * FROM ranked
      WHERE 1 = 1 ${cursorFilter}
      ORDER BY rank DESC, id ASC
      LIMIT ${limit + 1}
    `;

    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const lastRow = pageRows[pageRows.length - 1];

    return {
      items: pageRows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        basePrice: new Prisma.Decimal(row.basePrice),
        compareAtPrice: row.compareAtPrice !== null ? new Prisma.Decimal(row.compareAtPrice) : null,
        primaryImageUrl: row.primaryImageUrl,
        inStock: row.inStock,
      })),
      hasMore,
      lastRank: lastRow ? lastRow.rank : null,
    };
  },

  async findVariantBySku(sku: string): Promise<SkuSearchResult | null> {
    const variant = await prisma.productVariant.findFirst({
      where: { sku, product: { isActive: true, deletedAt: null } },
      select: {
        id: true,
        size: true,
        color: true,
        sku: true,
        product: { select: productListSelect },
      },
    });

    if (!variant) {
      return null;
    }

    return {
      product: toListItem(variant.product),
      variant: { id: variant.id, size: variant.size, color: variant.color, sku: variant.sku },
    };
  },
};
