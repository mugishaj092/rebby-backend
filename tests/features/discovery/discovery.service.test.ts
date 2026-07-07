import { describe, expect, it } from 'vitest';

import { ValidationError } from '@/core/errors/AppError';
import * as discoveryService from '@/features/discovery/service';
import type { SearchQuery } from '@/features/discovery/schema';

// These two checks are unreachable through the HTTP layer — `searchQuerySchema`/
// `skuSearchParamsSchema` already `.trim().min(1)` before the controller ever calls the
// service — but the spec asks the service to defend independently, so it isn't silently
// broken if ever called from a non-HTTP caller. Exercised here by calling the service directly.
describe('features/discovery service — defensive validation (unreachable via HTTP)', () => {
  it('search() rejects a whitespace-only q even if the caller bypasses schema validation', async () => {
    const query = { q: '   ', limit: 20 } as SearchQuery;
    await expect(discoveryService.search(query)).rejects.toThrow(ValidationError);
  });

  it('searchBySku() rejects a whitespace-only sku even if the caller bypasses schema validation', async () => {
    await expect(discoveryService.searchBySku('   ')).rejects.toThrow(ValidationError);
  });
});
