import { Prisma } from '@/generated/prisma/client';

import { NotFoundError } from './AppError';

// Every feature's update/delete flow does a check-then-act existence pre-check (find by id,
// throw NotFoundError if missing) before calling the repository's update/delete — that pre-check
// is not atomic with the write. If the row is deleted by a concurrent request in between, Prisma
// throws P2025 ("record to update/delete does not exist") from the write itself. This maps that
// race to the same NotFoundError the pre-check would have thrown, so it surfaces as a clean 404
// instead of an unhandled 500. Shared across features since the mechanism is identical everywhere
// — only the not-found message differs.
export async function withNotFoundOnP2025<T>(
  operation: () => Promise<T>,
  notFoundMessage: string,
): Promise<T> {
  try {
    return await operation();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new NotFoundError(notFoundMessage);
    }
    throw err;
  }
}
