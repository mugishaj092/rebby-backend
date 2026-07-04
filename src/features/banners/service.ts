import * as categoriesService from '@/features/categories/service';
import * as collectionsService from '@/features/collections/service';
import * as productsService from '@/features/products/service';
import { NotFoundError, ValidationError } from '@/core/errors/AppError';
import { withNotFoundOnP2025 } from '@/core/errors/prismaRaceGuard';
import { assertDateOrder } from '@/core/validation/dateOrder';
import type { Banner } from '@/generated/prisma/client';

import { bannersRepository } from './repository';
import type { CreateBannerInput, UpdateBannerInput } from './schema';

async function assertBannerLinkValueResolves(linkType: string, linkValue: string): Promise<void> {
  switch (linkType) {
    case 'product': {
      if (!(await productsService.productExists(linkValue))) {
        throw new NotFoundError('linkValue does not reference an existing product');
      }
      break;
    }
    case 'category': {
      if (!(await categoriesService.categoryExists(linkValue))) {
        throw new NotFoundError('linkValue does not reference an existing category');
      }
      break;
    }
    case 'collection': {
      if (!(await collectionsService.collectionExists(linkValue))) {
        throw new NotFoundError('linkValue does not reference an existing collection');
      }
      break;
    }
    case 'url': {
      try {
        new URL(linkValue);
      } catch {
        throw new ValidationError('linkValue must be a valid URL when linkType is "url"');
      }
      break;
    }
    default:
      break;
  }
}

export async function createBanner(_staffId: string, input: CreateBannerInput): Promise<Banner> {
  await assertBannerLinkValueResolves(input.linkType, input.linkValue);

  return bannersRepository.createBanner({
    title: input.title,
    imageUrl: input.imageUrl,
    linkType: input.linkType,
    linkValue: input.linkValue,
    placement: input.placement,
    sortOrder: input.sortOrder,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
  });
}

export async function updateBanner(
  _staffId: string,
  id: string,
  input: UpdateBannerInput,
): Promise<Banner> {
  const banner = await bannersRepository.findBannerById(id);
  if (!banner) {
    throw new NotFoundError('Banner not found');
  }

  const linkType = input.linkType ?? banner.linkType;
  const linkValue = input.linkValue ?? banner.linkValue;
  if (input.linkType !== undefined || input.linkValue !== undefined) {
    await assertBannerLinkValueResolves(linkType, linkValue);
  }

  const startsAt = input.startsAt !== undefined ? input.startsAt : banner.startsAt;
  const endsAt = input.endsAt !== undefined ? input.endsAt : banner.endsAt;
  assertDateOrder(startsAt, endsAt);

  return withNotFoundOnP2025(
    () =>
      bannersRepository.updateBanner(id, {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
        ...(input.linkType !== undefined ? { linkType: input.linkType } : {}),
        ...(input.linkValue !== undefined ? { linkValue: input.linkValue } : {}),
        ...(input.placement !== undefined ? { placement: input.placement } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
        ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
      }),
    'Banner not found',
  );
}

export async function deleteBanner(_staffId: string, id: string): Promise<void> {
  const banner = await bannersRepository.findBannerById(id);
  if (!banner) {
    throw new NotFoundError('Banner not found');
  }

  await withNotFoundOnP2025(() => bannersRepository.deleteBanner(id), 'Banner not found');
}

// Used by the home feature to compose getHomeSections().
export function listActiveBanners(): Promise<Banner[]> {
  return bannersRepository.listActiveBanners();
}
