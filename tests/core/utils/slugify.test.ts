import { describe, expect, it } from 'vitest';

import { slugify } from '@/core/utils/slugify';

describe('slugify', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugify('Summer Dresses')).toBe('summer-dresses');
  });

  it('collapses non-alphanumeric runs into a single hyphen', () => {
    expect(slugify("Men's & Women's Wear!!")).toBe('men-s-women-s-wear');
  });

  it('trims leading/trailing hyphens produced by punctuation at the edges', () => {
    expect(slugify('  --Sale-- ')).toBe('sale');
  });
});
