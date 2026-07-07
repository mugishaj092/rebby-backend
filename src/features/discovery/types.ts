import type { Prisma } from '@/generated/prisma/client';

export interface ProductFilters {
  categoryId?: string;
  size?: string;
  color?: string;
  minPrice?: Prisma.Decimal;
  maxPrice?: Prisma.Decimal;
  availability?: 'in_stock' | 'all';
  newArrivals?: boolean;
  onSale?: boolean;
}

export const PRODUCT_SORT_VALUES = [
  'newest',
  'price_asc',
  'price_desc',
  'best_selling',
  'most_popular',
] as const;

export type ProductSort = (typeof PRODUCT_SORT_VALUES)[number];
