import { ValidationError } from '@/core/errors/AppError';
import type { CursorPage } from '@/core/validation/pagination';
import type { ProductListItem } from '@/features/products/repository';

import { discoveryRepository, type SkuSearchResult } from './repository';
import { toProductFilters, type SearchCursorValue } from './queryBuilder';
import type { SearchQuery } from './schema';

function encodeCursor(cursor: SearchCursorValue): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(raw: string): SearchCursorValue {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new ValidationError('Invalid search cursor');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as SearchCursorValue).sortValue !== 'string' ||
    typeof (parsed as SearchCursorValue).id !== 'string'
  ) {
    throw new ValidationError('Invalid search cursor');
  }

  return parsed as SearchCursorValue;
}

export async function search(query: SearchQuery): Promise<CursorPage<ProductListItem>> {
  const q = query.q.trim();
  if (!q) {
    throw new ValidationError('q must not be empty');
  }

  const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
  const filters = toProductFilters(query);

  const { items, hasMore, lastCursor } = await discoveryRepository.searchProducts({
    query: q,
    filters,
    sort: query.sort,
    cursor,
    limit: query.limit,
  });

  const nextCursor = hasMore && lastCursor ? encodeCursor(lastCursor) : null;

  return { items, nextCursor };
}

export async function searchBySku(sku: string): Promise<SkuSearchResult | null> {
  const trimmed = sku.trim();
  if (!trimmed) {
    throw new ValidationError('sku must not be empty');
  }

  return discoveryRepository.findVariantBySku(trimmed);
}
