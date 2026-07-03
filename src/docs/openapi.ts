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

const tokenResponseSchema = (
  accountKey: 'user' | 'staff',
  options: { extraAccountProps?: object; includeRefreshToken?: boolean } = {},
): object =>
  successEnvelope({
    type: 'object',
    properties: {
      accessToken: {
        type: 'string',
        description: 'Short-lived JWT — send as `Authorization: Bearer <token>`',
      },
      expiresIn: { type: 'integer', description: 'Access token TTL in seconds' },
      ...(options.includeRefreshToken
        ? {
            refreshToken: {
              type: 'string',
              description:
                'Only present for the customer flow (mobile/expo-secure-store clients). Also set as an httpOnly cookie for browser clients — store this value yourself only if you cannot rely on cookies.',
            },
          }
        : {}),
      [accountKey]: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          ...options.extraAccountProps,
        },
      },
    },
  });

const refreshOrLogoutRequestBody = {
  required: false,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          refreshToken: {
            type: 'string',
            description:
              'Optional — only needed by cookie-less clients (React Native/Expo). Browser clients omit this; the httpOnly cookie is used instead.',
          },
        },
      },
    },
  },
};

const invalidCredentialsResponse = {
  description:
    'Wrong email/password, unknown email, or a locked account — content-identical for all three',
  content: {
    'application/json': { schema: errorEnvelope('UNAUTHORIZED', 'Invalid email or password') },
  },
};

const invalidRefreshTokenResponse = {
  description: 'Missing, invalid, expired, or already-rotated (replayed) refresh token',
  content: {
    'application/json': { schema: errorEnvelope('UNAUTHORIZED', 'Invalid refresh token') },
  },
};

const categoryNotFoundResponse = {
  description: 'No category with that id',
  content: { 'application/json': { schema: errorEnvelope('NOT_FOUND', 'Category not found') } },
};

const staffAuthResponses = {
  '401': {
    description: 'Missing/invalid/expired access token',
    content: {
      'application/json': { schema: errorEnvelope('UNAUTHORIZED', 'Authentication required') },
    },
  },
  '403': {
    description: "Valid token, but the role is below the route's required minimum",
    content: {
      'application/json': {
        schema: errorEnvelope('FORBIDDEN', 'Insufficient staff role for this route'),
      },
    },
  },
};

const validationFailedResponse = {
  description: 'Validation failed',
  content: {
    'application/json': { schema: errorEnvelope('VALIDATION_ERROR', 'Request validation failed') },
  },
};

const categoryIdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string', format: 'uuid' },
};

const categoryWriteRequestBody = (requiredName: boolean) => ({
  required: true,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        ...(requiredName ? { required: ['name'] } : {}),
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 150, example: 'Dresses' },
          slug: {
            type: 'string',
            description:
              'Optional — auto-generated from name (with a numeric suffix on collision) if omitted.',
            example: 'dresses',
          },
          parentId: {
            type: 'string',
            format: 'uuid',
            description: 'Must reference an existing, active category.',
          },
          imageUrl: { type: 'string', format: 'uri', maxLength: 500 },
          sortOrder: { type: 'integer', default: 0 },
        },
      },
    },
  },
});

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
    title: 'REBY API (dev — auth + catalog foundation)',
    version: '0.1.0-dev',
    description:
      'Hand-written, throwaway OpenAPI doc covering specs 05–06 (health check, self-hosted JWT auth, the temporary /_debug/* routes, and Categories). Superseded by the real generated spec in spec 35; not for production use. Customer refresh/logout accept the refresh token via cookie (browser) or request body (React Native/Expo — no persistent cookie jar); staff refresh/logout are cookie-only. Use "Try it out" for login first (in the same browser session) so the cookie is present, or pass refreshToken from the login/register response body directly.',
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
        description:
          'Sets the reby_refresh_token httpOnly cookie (path-scoped to /api/v1/auth) AND returns refreshToken in the body, for cookie-less (React Native/Expo) clients.',
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
          '201': {
            description: 'Account created',
            content: {
              'application/json': {
                schema: tokenResponseSchema('user', { includeRefreshToken: true }),
              },
            },
          },
          '409': {
            description: 'Email already registered',
            content: {
              'application/json': {
                schema: errorEnvelope('CONFLICT', 'An account with this email already exists'),
              },
            },
          },
          '422': {
            description: 'Validation failed (e.g. password under 12 characters)',
            content: {
              'application/json': {
                schema: errorEnvelope('VALIDATION_ERROR', 'Request validation failed'),
              },
            },
          },
          '429': {
            description: 'Rate limited (10 requests/minute per IP)',
            content: {
              'application/json': {
                schema: errorEnvelope(
                  'RATE_LIMITED',
                  'Too many requests. Please try again shortly.',
                ),
              },
            },
          },
        },
      },
    },
    '/api/v1/auth/login': {
      post: {
        summary: 'Log in as a customer',
        description:
          'Sets the reby_refresh_token httpOnly cookie (path-scoped to /api/v1/auth) AND returns refreshToken in the body, for cookie-less (React Native/Expo) clients.',
        tags: ['Auth — Customer'],
        requestBody: credentialsRequestBody,
        responses: {
          '200': {
            description: 'Logged in',
            content: {
              'application/json': {
                schema: tokenResponseSchema('user', { includeRefreshToken: true }),
              },
            },
          },
          '401': invalidCredentialsResponse,
          '429': {
            description: 'Rate limited (10 requests/minute per IP)',
            content: {
              'application/json': {
                schema: errorEnvelope(
                  'RATE_LIMITED',
                  'Too many requests. Please try again shortly.',
                ),
              },
            },
          },
        },
      },
    },
    '/api/v1/auth/refresh': {
      post: {
        summary: 'Rotate the customer refresh token and issue a new access token',
        description:
          'Reads reby_refresh_token from the cookie, or refreshToken from the request body for cookie-less (React Native/Expo) clients (cookie takes precedence if both are present). Replaying an already-rotated token revokes the entire token family, forcing full re-login.',
        tags: ['Auth — Customer'],
        requestBody: refreshOrLogoutRequestBody,
        responses: {
          '200': {
            description: 'Rotated',
            content: {
              'application/json': {
                schema: successEnvelope({
                  type: 'object',
                  properties: {
                    accessToken: { type: 'string' },
                    refreshToken: { type: 'string' },
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
        description:
          'Reads reby_refresh_token from the cookie, or refreshToken from the request body for cookie-less clients.',
        tags: ['Auth — Customer'],
        requestBody: refreshOrLogoutRequestBody,
        responses: {
          '200': {
            description:
              'Logged out (idempotent — succeeds even with no/invalid cookie or token present)',
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
        summary:
          'Log in as staff (staff accounts are provisioned separately, never self-registered)',
        description:
          'Sets the reby_staff_refresh_token httpOnly cookie (path-scoped to /api/v1/admin/auth).',
        tags: ['Auth — Staff'],
        requestBody: credentialsRequestBody,
        responses: {
          '200': {
            description: 'Logged in',
            content: {
              'application/json': {
                schema: tokenResponseSchema('staff', {
                  extraAccountProps: {
                    role: { type: 'string', enum: ['staff', 'manager', 'owner'] },
                  },
                }),
              },
            },
          },
          '401': invalidCredentialsResponse,
          '429': {
            description: 'Rate limited (10 requests/minute per IP)',
            content: {
              'application/json': {
                schema: errorEnvelope(
                  'RATE_LIMITED',
                  'Too many requests. Please try again shortly.',
                ),
              },
            },
          },
        },
      },
    },
    '/api/v1/admin/auth/refresh': {
      post: {
        summary: 'Rotate the staff refresh token and issue a new access token',
        description:
          'Reads reby_staff_refresh_token from the cookie (no request body); same rotation/reuse-detection logic as the customer flow.',
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
    '/api/v1/categories': {
      get: {
        summary: 'List categories (flat, filterable by parentId)',
        description:
          'Public — no auth required. Defaults to active-only and top-level (parentId: null) when the query params are omitted.',
        tags: ['Catalog — Categories (public)'],
        parameters: [
          {
            name: 'parentId',
            in: 'query',
            required: false,
            description: 'Fetch the children of this category. Omit for top-level categories.',
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'activeOnly',
            in: 'query',
            required: false,
            description: 'Defaults to true. Set to false to lift the active-only restriction.',
            schema: { type: 'string', enum: ['true', 'false'] },
          },
        ],
        responses: {
          '200': {
            description: 'Matching categories',
            content: {
              'application/json': {
                schema: successEnvelope({
                  type: 'array',
                  items: { $ref: '#/components/schemas/Category' },
                }),
              },
            },
          },
          '422': validationFailedResponse,
        },
      },
    },
    '/api/v1/categories/tree': {
      get: {
        summary: 'Full nested category tree',
        description:
          'Public — no auth required. Active-only by default (the internal service also supports an admin/internal activeOnly=false mode, not currently exposed as a query param on this route).',
        tags: ['Catalog — Categories (public)'],
        responses: {
          '200': {
            description: 'Top-level categories, each with a nested children array',
            content: {
              'application/json': {
                schema: successEnvelope({
                  type: 'array',
                  items: { $ref: '#/components/schemas/CategoryTreeNode' },
                }),
              },
            },
          },
        },
      },
    },
    '/api/v1/categories/{id}': {
      get: {
        summary: 'Get a single category by id',
        description:
          'Public — no auth required. Not filtered by isActive (unlike the list/tree endpoints) — a caller who already has the id can still fetch it.',
        tags: ['Catalog — Categories (public)'],
        parameters: [categoryIdParam],
        responses: {
          '200': {
            description: 'The category',
            content: {
              'application/json': {
                schema: successEnvelope({ $ref: '#/components/schemas/Category' }),
              },
            },
          },
          '404': categoryNotFoundResponse,
        },
      },
    },
    '/api/v1/admin/categories': {
      post: {
        summary: 'Create a category (STAFF+)',
        description: 'If parentId is provided, it must reference an existing, active category.',
        tags: ['Catalog — Categories (admin)'],
        security: [{ bearerAuth: [] }],
        requestBody: categoryWriteRequestBody(true),
        responses: {
          '201': {
            description: 'Created',
            content: {
              'application/json': {
                schema: successEnvelope({ $ref: '#/components/schemas/Category' }),
              },
            },
          },
          '404': {
            description: 'parentId does not reference an existing, active category',
            content: {
              'application/json': {
                schema: errorEnvelope('NOT_FOUND', 'Parent category not found'),
              },
            },
          },
          '409': {
            description: 'Duplicate slug, or no unique slug could be auto-generated',
            content: {
              'application/json': {
                schema: errorEnvelope('CONFLICT', 'A category with this slug already exists'),
              },
            },
          },
          '422': validationFailedResponse,
          ...staffAuthResponses,
        },
      },
    },
    '/api/v1/admin/categories/{id}': {
      patch: {
        summary: 'Update a category (STAFF+)',
        description:
          'All fields optional. Changing parentId is rejected if it would set the category as its own ancestor.',
        tags: ['Catalog — Categories (admin)'],
        security: [{ bearerAuth: [] }],
        parameters: [categoryIdParam],
        requestBody: categoryWriteRequestBody(false),
        responses: {
          '200': {
            description: 'Updated',
            content: {
              'application/json': {
                schema: successEnvelope({ $ref: '#/components/schemas/Category' }),
              },
            },
          },
          '404': categoryNotFoundResponse,
          '409': {
            description:
              'Duplicate slug, or parentId would create a cycle (self or descendant as ancestor)',
            content: {
              'application/json': {
                schema: errorEnvelope('CONFLICT', 'A category cannot be set as its own ancestor'),
              },
            },
          },
          '422': validationFailedResponse,
          ...staffAuthResponses,
        },
      },
      delete: {
        summary: 'Delete a category (MANAGER+)',
        description:
          'Rejected if the category has active children. Requires a higher role than create/update since it is more destructive.',
        tags: ['Catalog — Categories (admin)'],
        security: [{ bearerAuth: [] }],
        parameters: [categoryIdParam],
        responses: {
          '200': {
            description: 'Deleted',
            content: {
              'application/json': {
                schema: successEnvelope({
                  type: 'object',
                  properties: { deleted: { type: 'boolean', example: true } },
                }),
              },
            },
          },
          '404': categoryNotFoundResponse,
          '409': {
            description: 'Category has active children',
            content: {
              'application/json': {
                schema: errorEnvelope(
                  'CONFLICT',
                  'Cannot delete a category that has active children',
                ),
              },
            },
          },
          ...staffAuthResponses,
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
            content: {
              'application/json': {
                schema: errorEnvelope('UNAUTHORIZED', 'Authentication required'),
              },
            },
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
            content: {
              'application/json': {
                schema: errorEnvelope('UNAUTHORIZED', 'Authentication required'),
              },
            },
          },
          '403': {
            description: 'Valid token, but it belongs to a customer, or role is below STAFF',
            content: {
              'application/json': { schema: errorEnvelope('FORBIDDEN', 'Staff access required') },
            },
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
      Category: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          parentId: { type: 'string', format: 'uuid', nullable: true },
          name: { type: 'string' },
          slug: { type: 'string' },
          imageUrl: { type: 'string', nullable: true },
          sortOrder: { type: 'integer' },
          isActive: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CategoryTreeNode: {
        allOf: [
          { $ref: '#/components/schemas/Category' },
          {
            type: 'object',
            properties: {
              children: { type: 'array', items: { $ref: '#/components/schemas/CategoryTreeNode' } },
            },
          },
        ],
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
