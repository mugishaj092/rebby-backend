import * as bannersService from '@/features/banners/service';
import * as collectionsService from '@/features/collections/service';
import type { CollectionWithProducts } from '@/features/collections/service';
import type { Banner } from '@/generated/prisma/client';

export interface HomeSections {
  banners: Record<string, Banner[]>;
  collections: CollectionWithProducts[];
}

function groupBannersByPlacement(banners: Banner[]): Record<string, Banner[]> {
  const grouped: Record<string, Banner[]> = {};
  for (const banner of banners) {
    (grouped[banner.placement] ??= []).push(banner);
  }
  return grouped;
}

// The single "home screen" read path — Spec 09 and the mobile app call this rather than
// re-deriving equivalent banner/collection queries elsewhere. Purely a composition of the
// banners and collections features' own services — this feature owns no data of its own.
export async function getHomeSections(): Promise<HomeSections> {
  const [banners, collections] = await Promise.all([
    bannersService.listActiveBanners(),
    collectionsService.listActiveCollectionsWithProducts(),
  ]);

  return {
    banners: groupBannersByPlacement(banners),
    collections,
  };
}
