import type { JsonObject } from 'swagger-ui-express';

const successEnvelope = (dataSchema: object): object => ({
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: dataSchema,
  },
  required: ['success', 'data'],
});

const errorEnvelope = (code: string, example: string): object => ({
  type: 'object',
  properties: {
    success: { type: 'boolean', example: false },
    error: {
      type: 'object',
      properties: {
        code: { type: 'string', example: code },
        message: { type: 'string', example },
      },
    },
  },
});

const tokenResponseSchema = (accountKey: 'user' | 'staff', extraAccountProps: object = {}): object =>
  successEnvelope({
    type: 'object',
    properties: {
      accessToken: { type: 'string', description: 'Short-lived JWT — send as `Authorization: Bearer <token>`' },
      expiresIn: { type: 'integer', description: 'Access token TTL in seconds' },
      [accountKey]: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          ...extraAccountProps,
        },
      },
    },
  });

const invalidCredentialsResponse = {
  description: 'Wrong email/password, unknown email, or a locked account — content-identical for all three',
  content: { 'application/json': { schema: errorEnvelope('UNAUTHORIZED', 'Invalid email or password') } },
};

const invalidRefreshTokenResponse = {
  description: 'Missing, invalid, expired, or already-rotated (replayed) refresh token',
  content: { 'application/json': { schema: errorEnvelope('UNAUTHORIZED', 'Invalid refresh token') } },
};

const credentialsRequestBody = {
  required: true,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', format: 'password' },
        },
      },
    },
  },
};

export const openApiDocument: JsonObject = {
  openapi: '3.0.3',
  info: {
    title: 'REBY API (dev — auth foundation only)',
    version: '0.1.0-dev',
    description:
      'Hand-written, throwaway OpenAPI doc covering spec 05 only (health check, self-hosted JWT auth, and the temporary /_debug/* routes). Superseded by the real generated spec in spec 35; not for production use. Refresh/logout rely on an httpOnly cookie set by a prior login/register call in the same browser session — use "Try it out" for login first, then refresh/logout, so the cookie is present.',
  },
  paths: {
    '/health': {
      get: {
        summary: 'Health check',
        tags: ['Health'],
        responses: {
          '200': {
            description: 'Server is up',
            content: {
              'application/json': {
                schema: successEnvelope({
                  type: 'object',
                  properties: { status: { type: 'string', example: 'ok' } },
                }),
              },
            },
          },
        },
      },
    },
    '/api/v1/auth/register': {
      post: {
        summary: 'Register a new customer account',
        description: 'Sets the reby_refresh_token httpOnly cookie (path-scoped to /api/v1/auth).',
        tags: ['Auth — Customer'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password'],
                properties: {
                  name: { type: 'string', example: 'Jane Doe' },
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', format: 'password', minLength: 12, maxLength: 128 },
                  phone: { type: 'string', example: '0780000000' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Account created', content: { 'application/json': { schema: tokenResponseSchema('user') } } },
          '409': {
            description: 'Email already registered',
            content: {
              'application/json': { schema: errorEnvelope('CONFLICT', 'An account with this email already exists') },
            },
          },
          '422': {
            description: 'Validation failed (e.g. password under 12 characters)',
            content: {
              'application/json': { schema: errorEnvelope('VALIDATION_ERROR', 'Request validation failed') },
            },
          },
          '429': {
            description: 'Rate limited (10 requests/minute per IP)',
            content: {
              'application/json': { schema: errorEnvelope('RATE_LIMITED', 'Too many requests. Please try again shortly.') },
            },
          },
        },
      },
    },
    '/api/v1/auth/login': {
      post: {
        summary: 'Log in as a customer',
        description: 'Sets the reby_refresh_token httpOnly cookie (path-scoped to /api/v1/auth).',
        tags: ['Auth — Customer'],
        requestBody: credentialsRequestBody,
        responses: {
          '200': { description: 'Logged in', content: { 'application/json': { schema: tokenResponseSchema('user') } } },
          '401': invalidCredentialsResponse,
          '429': {
            description: 'Rate limited (10 requests/minute per IP)',
            content: {
              'application/json': { schema: errorEnvelope('RATE_LIMITED', 'Too many requests. Please try again shortly.') },
            },
          },
        },
      },
    },
    '/api/v1/auth/refresh': {
      post: {
        summary: 'Rotate the customer refresh token and issue a new access token',
        description:
          'Reads reby_refresh_token from the cookie (no request body). Replaying an already-rotated token revokes the entire token family, forcing full re-login.',
        tags: ['Auth — Customer'],
        responses: {
          '200': {
            description: 'Rotated',
            content: {
              'application/json': {
                schema: successEnvelope({
                  type: 'object',
                  properties: {
                    accessToken: { type: 'string' },
                    expiresIn: { type: 'integer' },
                  },
                }),
              },
            },
          },
          '401': invalidRefreshTokenResponse,
        },
      },
    },
    '/api/v1/auth/logout': {
      post: {
        summary: 'Revoke the presented customer refresh token and clear the cookie',
        tags: ['Auth — Customer'],
        responses: {
          '200': {
            description: 'Logged out (idempotent — succeeds even with no/invalid cookie present)',
            content: {
              'application/json': {
                schema: successEnvelope({
                  type: 'object',
                  properties: { loggedOut: { type: 'boolean', example: true } },
                }),
              },
            },
          },
        },
      },
    },
    '/api/v1/admin/auth/login': {
      post: {
        summary: 'Log in as staff (staff accounts are provisioned separately, never self-registered)',
        description: 'Sets the reby_staff_refresh_token httpOnly cookie (path-scoped to /api/v1/admin/auth).',
        tags: ['Auth — Staff'],
        requestBody: credentialsRequestBody,
        responses: {
          '200': {
            description: 'Logged in',
            content: {
              'application/json': {
                schema: tokenResponseSchema('staff', { role: { type: 'string', enum: ['staff', 'manager', 'owner'] } }),
              },
            },
          },
          '401': invalidCredentialsResponse,
          '429': {
            description: 'Rate limited (10 requests/minute per IP)',
            content: {
              'application/json': { schema: errorEnvelope('RATE_LIMITED', 'Too many requests. Please try again shortly.') },
            },
          },
        },
      },
    },
    '/api/v1/admin/auth/refresh': {
      post: {
        summary: 'Rotate the staff refresh token and issue a new access token',
        description: 'Reads reby_staff_refresh_token from the cookie (no request body); same rotation/reuse-detection logic as the customer flow.',
        tags: ['Auth — Staff'],
        responses: {
          '200': {
            description: 'Rotated',
            content: {
              'application/json': {
                schema: successEnvelope({
                  type: 'object',
                  properties: {
                    accessToken: { type: 'string' },
                    expiresIn: { type: 'integer' },
                  },
                }),
              },
            },
          },
          '401': invalidRefreshTokenResponse,
        },
      },
    },
    '/api/v1/admin/auth/logout': {
      post: {
        summary: 'Revoke the presented staff refresh token and clear the cookie',
        tags: ['Auth — Staff'],
        responses: {
          '200': {
            description: 'Logged out (idempotent)',
            content: {
              'application/json': {
                schema: successEnvelope({
                  type: 'object',
                  properties: { loggedOut: { type: 'boolean', example: true } },
                }),
              },
            },
          },
        },
      },
    },
    '/api/v1/_debug/whoami': {
      get: {
        summary: '[throwaway] Echo the authenticated customer',
        tags: ['Debug (spec 05, dev-only)'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Valid customer access token',
            content: {
              'application/json': {
                schema: successEnvelope({
                  type: 'object',
                  properties: { user: { $ref: '#/components/schemas/AuthenticatedUser' } },
                }),
              },
            },
          },
          '401': {
            description: 'Missing/invalid/expired access token',
            content: { 'application/json': { schema: errorEnvelope('UNAUTHORIZED', 'Authentication required') } },
          },
          '403': {
            description: 'Valid token, but it belongs to a staff account, not a customer',
            content: {
              'application/json': {
                schema: errorEnvelope('FORBIDDEN', 'Staff accounts cannot access customer routes'),
              },
            },
          },
        },
      },
    },
    '/api/v1/_debug/staff-whoami': {
      get: {
        summary: '[throwaway] Echo the authenticated staff member (minRole: STAFF)',
        tags: ['Debug (spec 05, dev-only)'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Valid staff access token (staff, manager, or owner)',
            content: {
              'application/json': {
                schema: successEnvelope({
                  type: 'object',
                  properties: { staff: { $ref: '#/components/schemas/AuthenticatedStaff' } },
                }),
              },
            },
          },
          '401': {
            description: 'Missing/invalid/expired access token',
            content: { 'application/json': { schema: errorEnvelope('UNAUTHORIZED', 'Authentication required') } },
          },
          '403': {
            description: 'Valid token, but it belongs to a customer, or role is below STAFF',
            content: { 'application/json': { schema: errorEnvelope('FORBIDDEN', 'Staff access required') } },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'The accessToken returned by a login/register/refresh call.',
      },
    },
    schemas: {
      AuthenticatedUser: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
        },
      },
      AuthenticatedStaff: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ['staff', 'manager', 'owner'] },
        },
      },
    },
  },
};
