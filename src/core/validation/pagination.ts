import { z } from 'zod';

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 50;

// Cursor is an opaque "last seen row id" string — pairs with a deterministic `orderBy` at the
// query site (Prisma's cursor/skip:1/take handles the stable-ordering semantics; no manual
// composite encoding needed). Shared across every cursor-paginated listing endpoint.
export const cursorPaginationQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
});

export type CursorPaginationQuery = z.infer<typeof cursorPaginationQuerySchema>;

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}
