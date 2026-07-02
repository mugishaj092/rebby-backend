import { afterEach, describe, expect, it, vi } from 'vitest';

import { logger } from '@/core/utils/logger';

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('error delegates to console.error with the message and extra args', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    logger.error('[context] boom', { extra: true });

    expect(spy).toHaveBeenCalledWith('[context] boom', { extra: true });
  });

  it('warn delegates to console.warn with the message and extra args', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logger.warn('careful', 'details');

    expect(spy).toHaveBeenCalledWith('careful', 'details');
  });

  it('info delegates to console.info with the message and extra args', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});

    logger.info('starting up');

    expect(spy).toHaveBeenCalledWith('starting up');
  });
});
