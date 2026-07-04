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

export const categoriesRepository = {
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

  // Reads the `products` table directly (via the shared Prisma client) rather than calling
  // into the products feature's service — Category.deleteCategory needs "does this category
  // have active products" while Product.createProduct/updateProduct needs "does this category
  // exist" (the reverse direction). Routing both through cross-feature service calls would make
  // categories and products depend on each other, a circular feature dependency this codebase's
  // architecture rules forbid. This one-line, read-only count is the documented exception that
  // keeps the dependency edge one-directional (products → categories only).
  countActiveProductsByCategory(categoryId: string) {
    return prisma.product.count({ where: { categoryId, deletedAt: null } });
  },
};
