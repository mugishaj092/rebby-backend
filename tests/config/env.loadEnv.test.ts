import { afterEach, describe, expect, it, vi } from 'vitest';

import { EnvValidationError, loadEnv } from '@/config/env';

describe('loadEnv', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs a readable error and calls process.exit(1) before rethrowing on EnvValidationError', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new EnvValidationError(
      'Invalid environment configuration:\n  - DATABASE_URL: DATABASE_URL is required',
    );

    expect(() =>
      loadEnv(() => {
        throw err;
      }),
    ).toThrow(err);

    expect(errorSpy).toHaveBeenCalledWith(err.message);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('rethrows without logging or exiting for a non-EnvValidationError failure', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('unexpected failure while reading process.env');

    expect(() =>
      loadEnv(() => {
        throw err;
      }),
    ).toThrow(err);

    expect(errorSpy).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
