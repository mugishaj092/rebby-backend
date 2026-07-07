import { ValidationError } from '@/core/errors/AppError';
import type { CursorPage } from '@/core/validation/pagination';
import type { ProductListItem } from '@/features/products/repository';

import { discoveryRepository, type SkuSearchResult } from './repository';
import type { SearchQuery } from './schema';

interface SearchCursor {
  rank: number;
  id: string;
}

function encodeCursor(cursor: SearchCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(raw: string): SearchCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new ValidationError('Invalid search cursor');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as SearchCursor).rank !== 'number' ||
    typeof (parsed as SearchCursor).id !== 'string'
  ) {
    throw new ValidationError('Invalid search cursor');
  }

  return parsed as SearchCursor;
}

export async function search(query: SearchQuery): Promise<CursorPage<ProductListItem>> {
  const q = query.q.trim();
  if (!q) {
    throw new ValidationError('q must not be empty');
  }

  const after = query.cursor ? decodeCursor(query.cursor) : undefined;

  const { items, hasMore, lastRank } = await discoveryRepository.searchProducts({
    query: q,
    afterRank: after?.rank,
    afterId: after?.id,
    limit: query.limit,
  });

  const lastItem = items[items.length - 1];
  const nextCursor =
    hasMore && lastItem && lastRank !== null
      ? encodeCursor({ rank: lastRank, id: lastItem.id })
      : null;

  return { items, nextCursor };
}

export async function searchBySku(sku: string): Promise<SkuSearchResult | null> {
  const trimmed = sku.trim();
  if (!trimmed) {
    throw new ValidationError('sku must not be empty');
  }

  return discoveryRepository.findVariantBySku(trimmed);
}
