import { prisma } from '@/db/prisma';

interface CategoryCreateData {
  name: string;
  slug: string;
  parentId: string | null;
  imageUrl: string | null;
  sortOrder: number;
}

interface CategoryUpdateData {
  name?: string;
  slug?: string;
  parentId?: string | null;
  imageUrl?: string | null;
  sortOrder?: number;
}

interface ListCategoriesFilter {
  parentId?: string | null;
  activeOnly?: boolean;
}

export const catalogRepository = {
  createCategory(data: CategoryCreateData) {
    return prisma.category.create({ data });
  },

  updateCategory(id: string, data: CategoryUpdateData) {
    return prisma.category.update({ where: { id }, data });
  },

  deleteCategory(id: string) {
    return prisma.category.delete({ where: { id } });
  },

  findCategoryById(id: string) {
    return prisma.category.findUnique({ where: { id } });
  },

  findCategoryBySlug(slug: string) {
    return prisma.category.findUnique({ where: { slug } });
  },

  countActiveChildren(parentId: string) {
    return prisma.category.count({ where: { parentId, isActive: true } });
  },

  listCategories({ parentId, activeOnly }: ListCategoriesFilter) {
    return prisma.category.findMany({
      where: {
        ...(parentId !== undefined ? { parentId } : {}),
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  },

  listAllCategories(activeOnly?: boolean) {
    return prisma.category.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  },
};
