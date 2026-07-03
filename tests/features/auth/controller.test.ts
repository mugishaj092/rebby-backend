import { Request } from 'express';
import { describe, expect, it } from 'vitest';

import { requestContext } from '@/features/auth/controller';

describe('features/auth/controller requestContext', () => {
  it('falls back to null when req.ip is undefined', () => {
    const req = { ip: undefined, headers: {} } as unknown as Request;

    expect(requestContext(req)).toEqual({ ipAddress: null, userAgent: null });
  });

  it('captures req.ip and the User-Agent header when present', () => {
    const req = { ip: '203.0.113.5', headers: { 'user-agent': 'vitest-test-agent' } } as unknown as Request;

    expect(requestContext(req)).toEqual({ ipAddress: '203.0.113.5', userAgent: 'vitest-test-agent' });
  });
});
