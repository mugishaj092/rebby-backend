import { prisma } from '@/db/prisma';

type BannerLinkType = 'product' | 'category' | 'collection' | 'url';
type BannerPlacement = 'homepage' | 'campaign';

interface BannerSeed {
  title: string;
  imageUrl: string;
  linkType: BannerLinkType;
  // A category/collection/product slug to resolve into an id, or the raw URL when linkType is 'url'.
  linkRef: string;
  placement: BannerPlacement;
  sortOrder: number;
  startsAt?: Date;
  endsAt?: Date;
}

// `homepage` banners are evergreen nav/promo tiles — no date window, shown whenever isActive.
// `campaign` banners are inherently time-boxed (spec 08's active-window filtering exists
// specifically for these): one is currently live, one is scheduled in the future, to demonstrate
// GET /api/v1/home only returning banners that are actually in-window right now.
const BANNERS: BannerSeed[] = [
  {
    title: 'New Arrivals',
    imageUrl: 'https://placehold.co/1200x400?text=New+Arrivals',
    linkType: 'collection',
    linkRef: 'new-arrivals',
    placement: 'homepage',
    sortOrder: 0,
  },
  {
    title: 'Shop Women',
    imageUrl: 'https://placehold.co/1200x400?text=Shop+Women',
    linkType: 'category',
    linkRef: 'women',
    placement: 'homepage',
    sortOrder: 1,
  },
  {
    title: 'Summer Sale',
    imageUrl: 'https://placehold.co/1200x400?text=Summer+Sale',
    linkType: 'collection',
    linkRef: 'summer-sale',
    placement: 'campaign',
    sortOrder: 0,
    startsAt: new Date('2026-06-01T00:00:00Z'),
    endsAt: new Date('2026-08-31T23:59:59Z'),
  },
  {
    title: 'Rwanda Fashion Week',
    imageUrl: 'https://placehold.co/1200x400?text=Fashion+Week',
    linkType: 'url',
    linkRef: 'https://reby.rw/blog/rwanda-fashion-week',
    placement: 'campaign',
    sortOrder: 1,
    startsAt: new Date('2026-10-01T00:00:00Z'),
    endsAt: new Date('2026-10-15T23:59:59Z'),
  },
];

async function resolveLinkValue(linkType: BannerLinkType, linkRef: string): Promise<string> {
  switch (linkType) {
    case 'url':
      return linkRef;
    case 'category': {
      const category = await prisma.category.findUnique({ where: { slug: linkRef } });
      if (!category) {
        throw new Error(`seedBanners: category not found: ${linkRef} — run seedCategories first`);
      }
      return category.id;
    }
    case 'collection': {
      const collection = await prisma.collection.findUnique({ where: { slug: linkRef } });
      if (!collection) {
        throw new Error(
          `seedBanners: collection not found: ${linkRef} — run seedCollections first`,
        );
      }
      return collection.id;
    }
    case 'product': {
      const product = await prisma.product.findUnique({ where: { slug: linkRef } });
      if (!product) {
        throw new Error(`seedBanners: product not found: ${linkRef} — run seedProducts first`);
      }
      return product.id;
    }
  }
}

export async function seedBanners(): Promise<void> {
  let created = 0;
  let updated = 0;

  for (const seed of BANNERS) {
    const linkValue = await resolveLinkValue(seed.linkType, seed.linkRef);
    const data = {
      imageUrl: seed.imageUrl,
      linkType: seed.linkType,
      linkValue,
      placement: seed.placement,
      sortOrder: seed.sortOrder,
      startsAt: seed.startsAt ?? null,
      endsAt: seed.endsAt ?? null,
    };

    // Banner has no unique column to upsert() on, so re-seeding matches by title instead —
    // updating in place (rather than skip-only) so a rerun after changing seed data (e.g. a
    // campaign's date window) actually applies, instead of silently leaving stale rows behind.
    const existing = await prisma.banner.findFirst({ where: { title: seed.title } });
    if (existing) {
      await prisma.banner.update({ where: { id: existing.id }, data });
      updated += 1;
      continue;
    }

    await prisma.banner.create({ data: { title: seed.title, ...data } });
    created += 1;
  }

  console.log(`  banners: ${created} created, ${updated} updated`);
}
