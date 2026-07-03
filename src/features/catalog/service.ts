import { ConflictError, NotFoundError } from '@/core/errors/AppError';
import { slugify } from '@/core/utils/slugify';
import type { Category } from '@/generated/prisma/client';

import { catalogRepository } from './repository';
import type { CreateCategoryInput, ListCategoriesQuery, UpdateCategoryInput } from './schema';

const SLUG_COLLISION_MAX_ATTEMPTS = 20;

export interface CategoryTreeNode extends Category {
  children: CategoryTreeNode[];
}

async function generateUniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 1;

  while (await catalogRepository.findCategoryBySlug(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
    if (suffix > SLUG_COLLISION_MAX_ATTEMPTS) {
      throw new ConflictError('Unable to generate a unique slug for this category');
    }
  }

  return candidate;
}

async function assertSlugAvailable(slug: string): Promise<void> {
  const existing = await catalogRepository.findCategoryBySlug(slug);
  if (existing) {
    throw new ConflictError('A category with this slug already exists');
  }
}

async function assertParentIsUsable(parentId: string): Promise<void> {
  const parent = await catalogRepository.findCategoryById(parentId);
  if (!parent || !parent.isActive) {
    throw new NotFoundError('Parent category not found');
  }
}

// Walk the new parent's ancestor chain: if categoryId appears on it, newParentId is either
// categoryId itself or one of its descendants, which would create a cycle in the tree.
async function assertNoCycle(categoryId: string, newParentId: string): Promise<void> {
  let currentId: string | null = newParentId;
  const visited = new Set<string>();

  while (currentId) {
    if (currentId === categoryId) {
      throw new ConflictError('A category cannot be set as its own ancestor');
    }
    if (visited.has(currentId)) {
      break;
    }
    visited.add(currentId);

    const current: Category | null = await catalogRepository.findCategoryById(currentId);
    currentId = current?.parentId ?? null;
  }
}

export async function createCategory(
  _staffId: string,
  input: CreateCategoryInput,
): Promise<Category> {
  if (input.parentId) {
    await assertParentIsUsable(input.parentId);
  }

  const slug = input.slug ?? (await generateUniqueSlug(input.name));
  if (input.slug) {
    await assertSlugAvailable(input.slug);
  }

  return catalogRepository.createCategory({
    name: input.name,
    slug,
    parentId: input.parentId ?? null,
    imageUrl: input.imageUrl ?? null,
    sortOrder: input.sortOrder,
  });
}

export async function updateCategory(
  _staffId: string,
  id: string,
  input: UpdateCategoryInput,
): Promise<Category> {
  const category = await catalogRepository.findCategoryById(id);
  if (!category) {
    throw new NotFoundError('Category not found');
  }

  if (input.parentId && input.parentId !== category.parentId) {
    await assertParentIsUsable(input.parentId);
    await assertNoCycle(id, input.parentId);
  }

  if (input.slug && input.slug !== category.slug) {
    await assertSlugAvailable(input.slug);
  }

  return catalogRepository.updateCategory(id, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.slug !== undefined ? { slug: input.slug } : {}),
    ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
    ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
    ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
  });
}

export async function deleteCategory(_staffId: string, id: string): Promise<void> {
  const category = await catalogRepository.findCategoryById(id);
  if (!category) {
    throw new NotFoundError('Category not found');
  }

  const activeChildren = await catalogRepository.countActiveChildren(id);
  if (activeChildren > 0) {
    throw new ConflictError('Cannot delete a category that has active children');
  }

  // TODO(spec 07): also block deletion if active products reference this category

  await catalogRepository.deleteCategory(id);
}

export async function getCategory(id: string): Promise<Category> {
  const category = await catalogRepository.findCategoryById(id);
  if (!category) {
    throw new NotFoundError('Category not found');
  }
  return category;
}

export function listCategories(query: ListCategoriesQuery): Promise<Category[]> {
  return catalogRepository.listCategories({
    parentId: query.parentId ?? null,
    activeOnly: query.activeOnly,
  });
}

export async function getCategoryTree(): Promise<CategoryTreeNode[]> {
  const categories = await catalogRepository.listAllCategories();

  const nodesById = new Map<string, CategoryTreeNode>(
    categories.map((category) => [category.id, { ...category, children: [] }]),
  );
  const roots: CategoryTreeNode[] = [];

  for (const category of categories) {
    // nodesById was built from this exact array, so both lookups are always defined:
    // listAllCategories() fetches every category in one query, and the parentId FK
    // guarantees a referenced parent is always present in that same result set.
    const node = nodesById.get(category.id)!;
    if (category.parentId) {
      nodesById.get(category.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}
