import { ValidationError } from '@/core/errors/AppError';

// Shared by collections and banners. A schema-level refine can only catch an inverted window
// when both dates arrive in the same request — it can't see a stored row, so a partial update
// that only touches one of the two dates needs the merged (input ?? existing) values checked here.
export function assertDateOrder(startsAt: Date | null, endsAt: Date | null): void {
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw new ValidationError('endsAt must be after startsAt');
  }
}
