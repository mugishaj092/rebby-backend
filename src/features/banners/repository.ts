import { prisma } from '@/db/prisma';

interface BannerCreateData {
  title: string;
  imageUrl: string;
  linkType: string;
  linkValue: string;
  placement: string;
  sortOrder: number;
  startsAt: Date | null;
  endsAt: Date | null;
}

interface BannerUpdateData {
  title?: string;
  imageUrl?: string;
  linkType?: string;
  linkValue?: string;
  placement?: string;
  sortOrder?: number;
  isActive?: boolean;
  startsAt?: Date | null;
  endsAt?: Date | null;
}

export const bannersRepository = {
  createBanner(data: BannerCreateData) {
    return prisma.banner.create({ data });
  },

  updateBanner(id: string, data: BannerUpdateData) {
    return prisma.banner.update({ where: { id }, data });
  },

  deleteBanner(id: string) {
    return prisma.banner.delete({ where: { id } });
  },

  findBannerById(id: string) {
    return prisma.banner.findUnique({ where: { id } });
  },

  listActiveBanners(placement?: string) {
    const now = new Date();
    return prisma.banner.findMany({
      where: {
        isActive: true,
        ...(placement !== undefined ? { placement } : {}),
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  },
};
