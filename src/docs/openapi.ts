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

const productIdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  description: 'Product id',
  schema: { type: 'string', format: 'uuid' },
};

const variantIdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  description: 'Variant id',
  schema: { type: 'string', format: 'uuid' },
};

const moneyStringSchema = (example: string) => ({
  type: 'string',
  description: 'Positive decimal string with up to 2 decimal places, e.g. "19.99".',
  pattern: '^\\d+(\\.\\d{1,2})?$',
  example,
});

const productNotFoundResponse = {
  description: 'No product with that id',
  content: { 'application/json': { schema: errorEnvelope('NOT_FOUND', 'Product not found') } },
};

const variantNotFoundResponse = {
  description: 'No variant with that id',
  content: { 'application/json': { schema: errorEnvelope('NOT_FOUND', 'Variant not found') } },
};

const variantWriteProperties = (requiredStock: boolean) => ({
  size: { type: 'string', maxLength: 20, example: 'M' },
  color: { type: 'string', maxLength: 50, example: 'Black' },
  sku: { type: 'string', maxLength: 100, example: 'TSHIRT-BLK-M' },
  priceOverride: moneyStringSchema('17.50'),
  stock: { type: 'integer', minimum: 0, ...(requiredStock ? {} : {}), example: 25 },
});

const createProductRequestBody = {
  required: true,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['name', 'basePrice', 'variants'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 191, example: 'Cotton T-Shirt' },
          slug: {
            type: 'string',
            description:
              'Optional — auto-generated from name (with a numeric suffix on collision) if omitted.',
            example: 'cotton-t-shirt',
          },
          categoryId: {
            type: 'string',
            format: 'uuid',
            description: 'Must reference an existing category.',
          },
          description: { type: 'string' },
          fabric: { type: 'string', maxLength: 255 },
          careInstructions: { type: 'string', maxLength: 500 },
          basePrice: moneyStringSchema('19.99'),
          compareAtPrice: moneyStringSchema('24.99'),
          images: {
            type: 'array',
            items: {
              type: 'object',
              required: ['url'],
              properties: {
                url: { type: 'string', format: 'uri', maxLength: 500 },
                sortOrder: { type: 'integer', default: 0 },
                isPrimary: { type: 'boolean', default: false },
              },
            },
          },
          variants: {
            type: 'array',
            minItems: 1,
            description: 'At least one variant is required.',
            items: {
              type: 'object',
              required: ['size', 'color', 'sku', 'stock'],
              properties: variantWriteProperties(true),
            },
          },
        },
      },
    },
  },
};

const updateProductRequestBody = {
  required: true,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        description: 'All fields optional — product-level fields only (not images/variants).',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 191 },
          slug: { type: 'string' },
          categoryId: { type: 'string', format: 'uuid' },
          description: { type: 'string' },
          fabric: { type: 'string', maxLength: 255 },
          careInstructions: { type: 'string', maxLength: 500 },
          basePrice: moneyStringSchema('19.99'),
          compareAtPrice: moneyStringSchema('24.99'),
        },
      },
    },
  },
};

const addVariantRequestBody = {
  required: true,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['size', 'color', 'sku', 'stock'],
        properties: variantWriteProperties(true),
      },
    },
  },
};

const updateVariantRequestBody = {
  required: true,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        description: 'All fields optional, including stock (see summary/description below).',
        properties: variantWriteProperties(false),
      },
    },
  },
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

const collectionIdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  description: 'Collection id',
  schema: { type: 'string', format: 'uuid' },
};

const collectionSlugParam = {
  name: 'slug',
  in: 'path' as const,
  required: true,
  description: 'Collection slug',
  schema: { type: 'string' },
};

const bannerIdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  description: 'Banner id',
  schema: { type: 'string', format: 'uuid' },
};

const collectionNotFoundResponse = {
  description: 'No collection with that id/slug',
  content: { 'application/json': { schema: errorEnvelope('NOT_FOUND', 'Collection not found') } },
};

const bannerNotFoundResponse = {
  description: 'No banner with that id',
  content: { 'application/json': { schema: errorEnvelope('NOT_FOUND', 'Banner not found') } },
};

const collectionWriteRequestBody = (requiredName: boolean) => ({
  required: true,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        ...(requiredName ? { required: ['name'] } : {}),
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 150, example: 'New Arrivals' },
          slug: {
            type: 'string',
            description:
              'Optional — auto-generated from name (with a numeric suffix on collision) if omitted.',
            example: 'new-arrivals',
          },
          description: { type: 'string', maxLength: 500 },
          isActive: { type: 'boolean', description: 'Update only.' },
          startsAt: { type: 'string', format: 'date-time', nullable: true },
          endsAt: { type: 'string', format: 'date-time', nullable: true },
          productIds: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
            description: 'Create only — initial product set, each id must be an active product.',
          },
        },
      },
    },
  },
});

const setCollectionProductsRequestBody = {
  required: true,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['productIds'],
        properties: {
          productIds: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
            description:
              'Replaces the full product set. Order determines sortOrder. An empty array clears the collection.',
          },
        },
      },
    },
  },
};

const bannerWriteRequestBody = (required: boolean) => ({
  required: true,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        ...(required
          ? { required: ['title', 'imageUrl', 'linkType', 'linkValue', 'placement'] }
          : {}),
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 191, example: 'Flash Deals' },
          imageUrl: { type: 'string', format: 'uri', maxLength: 500 },
          linkType: { type: 'string', enum: ['product', 'category', 'collection', 'url'] },
          linkValue: {
            type: 'string',
            description:
              'The id of the referenced product/category/collection, or a raw URL when linkType is "url".',
          },
          placement: { type: 'string', enum: ['homepage', 'campaign'] },
          sortOrder: { type: 'integer', default: 0 },
          isActive: { type: 'boolean', description: 'Update only.' },
          startsAt: { type: 'string', format: 'date-time', nullable: true },
          endsAt: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: 'Must be after startsAt when both are present.',
          },
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
      'Hand-written, throwaway OpenAPI doc covering specs 05–08 (health check, self-hosted JWT auth, the temporary /_debug/* routes, Categories, Products & Variants, and Collections & Banners). Superseded by the real generated spec in spec 35; not for production use. Customer refresh/logout accept the refresh token via cookie (browser) or request body (React Native/Expo — no persistent cookie jar); staff refresh/logout are cookie-only. Use "Try it out" for login first (in the same browser session) so the cookie is present, or pass refreshToken from the login/register response body directly.',
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
          'All fields optional. Changing parentId re-runs the same existence/active check as create, plus a cycle check (rejected if it would set the category as its own ancestor).',
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
          '404': {
            description:
              'Either the :id in the path does not exist, or (if parentId is being changed) the new parentId does not reference an existing, active category — same parent validation as create.',
            content: {
              'application/json': {
                schema: errorEnvelope('NOT_FOUND', 'Category not found'),
                examples: {
                  categoryNotFound: {
                    summary: 'The category being updated does not exist',
                    value: {
                      success: false,
                      error: { code: 'NOT_FOUND', message: 'Category not found' },
                    },
                  },
                  parentNotFound: {
                    summary: 'parentId does not reference an existing, active category',
                    value: {
                      success: false,
                      error: { code: 'NOT_FOUND', message: 'Parent category not found' },
                    },
                  },
                },
              },
            },
          },
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
    '/api/v1/admin/products': {
      post: {
        summary: 'Create a product with its variants and images in one call (STAFF+)',
        description:
          'A single nested write — the product, all variants, and all images are created atomically. Duplicate SKUs within the request, or against an existing variant, are rejected before any write.',
        tags: ['Catalog — Products (admin)'],
        security: [{ bearerAuth: [] }],
        requestBody: createProductRequestBody,
        responses: {
          '201': {
            description: 'Created',
            content: {
              'application/json': {
                schema: successEnvelope({ $ref: '#/components/schemas/ProductWithRelations' }),
              },
            },
          },
          '404': {
            description: 'categoryId does not reference an existing category',
            content: {
              'application/json': { schema: errorEnvelope('NOT_FOUND', 'Category not found') },
            },
          },
          '409': {
            description:
              'Duplicate SKU in the request payload, SKU already exists on another variant, or a duplicate product slug',
            content: {
              'application/json': {
                schema: errorEnvelope('CONFLICT', 'SKU already exists: TSHIRT-BLK-M'),
              },
            },
          },
          '422': validationFailedResponse,
          ...staffAuthResponses,
        },
      },
    },
    '/api/v1/admin/products/{id}': {
      patch: {
        summary: 'Update product-level fields (STAFF+)',
        description: 'Variants and images are managed separately, via their own routes.',
        tags: ['Catalog — Products (admin)'],
        security: [{ bearerAuth: [] }],
        parameters: [productIdParam],
        requestBody: updateProductRequestBody,
        responses: {
          '200': {
            description: 'Updated',
            content: {
              'application/json': {
                schema: successEnvelope({ $ref: '#/components/schemas/Product' }),
              },
            },
          },
          '404': productNotFoundResponse,
          '409': {
            description: 'Duplicate product slug',
            content: {
              'application/json': {
                schema: errorEnvelope('CONFLICT', 'A product with this slug already exists'),
              },
            },
          },
          '422': validationFailedResponse,
          ...staffAuthResponses,
        },
      },
      delete: {
        summary: 'Soft-delete a product (MANAGER+)',
        description:
          'Sets deletedAt and isActive: false; the row is kept (not removed) so past OrderItems still resolve against it.',
        tags: ['Catalog — Products (admin)'],
        security: [{ bearerAuth: [] }],
        parameters: [productIdParam],
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
          '404': productNotFoundResponse,
          ...staffAuthResponses,
        },
      },
    },
    '/api/v1/admin/products/{id}/variants': {
      post: {
        summary: 'Add a variant to an existing product (STAFF+)',
        tags: ['Catalog — Products (admin)'],
        security: [{ bearerAuth: [] }],
        parameters: [productIdParam],
        requestBody: addVariantRequestBody,
        responses: {
          '201': {
            description: 'Created',
            content: {
              'application/json': {
                schema: successEnvelope({ $ref: '#/components/schemas/ProductVariant' }),
              },
            },
          },
          '404': productNotFoundResponse,
          '409': {
            description:
              'SKU already exists, or this product already has a variant with this size/color combination',
            content: {
              'application/json': {
                schema: errorEnvelope('CONFLICT', 'SKU already exists: TSHIRT-BLK-M'),
              },
            },
          },
          '422': validationFailedResponse,
          ...staffAuthResponses,
        },
      },
    },
    '/api/v1/admin/variants/{id}': {
      patch: {
        summary: 'Update a variant, including a direct stock correction (STAFF+)',
        description:
          'All fields optional. Allowed to write `stock` directly — this is the one narrow, documented exception to the "stock only changes through the inventory choke point" rule (Spec 17): administrative stock correction (e.g. a manual recount), never order fulfillment.',
        tags: ['Catalog — Variants (admin)'],
        security: [{ bearerAuth: [] }],
        parameters: [variantIdParam],
        requestBody: updateVariantRequestBody,
        responses: {
          '200': {
            description: 'Updated',
            content: {
              'application/json': {
                schema: successEnvelope({ $ref: '#/components/schemas/ProductVariant' }),
              },
            },
          },
          '404': variantNotFoundResponse,
          '409': {
            description: 'SKU already exists on another variant',
            content: {
              'application/json': {
                schema: errorEnvelope('CONFLICT', 'SKU already exists: TSHIRT-BLK-M'),
              },
            },
          },
          '422': validationFailedResponse,
          ...staffAuthResponses,
        },
      },
      delete: {
        summary: 'Remove a variant (MANAGER+)',
        tags: ['Catalog — Variants (admin)'],
        security: [{ bearerAuth: [] }],
        parameters: [variantIdParam],
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
          '404': variantNotFoundResponse,
          ...staffAuthResponses,
        },
      },
    },
    '/api/v1/home': {
      get: {
        summary: 'Home-screen sections — active banners grouped by placement + active collections',
        description:
          'Public — no auth required. The single read path the mobile app/home screen calls; do not re-derive equivalent banner/collection queries elsewhere.',
        tags: ['Catalog — Home (public)'],
        responses: {
          '200': {
            description: 'Home sections',
            content: {
              'application/json': {
                schema: successEnvelope({ $ref: '#/components/schemas/HomeSections' }),
              },
            },
          },
        },
      },
    },
    '/api/v1/collections': {
      get: {
        summary: 'List active collections',
        description:
          'Public — no auth required. Only collections that are isActive and within their startsAt/endsAt window. Does not include each collection’s product set — see the :slug detail route for that.',
        tags: ['Catalog — Collections (public)'],
        responses: {
          '200': {
            description: 'Active collections',
            content: {
              'application/json': {
                schema: successEnvelope({
                  type: 'array',
                  items: { $ref: '#/components/schemas/Collection' },
                }),
              },
            },
          },
        },
      },
    },
    '/api/v1/collections/{slug}': {
      get: {
        summary: 'Get a single active collection with its products',
        description:
          'Public — no auth required. 404 if the slug is unknown or outside its active window.',
        tags: ['Catalog — Collections (public)'],
        parameters: [collectionSlugParam],
        responses: {
          '200': {
            description: 'The collection with its ordered product set',
            content: {
              'application/json': {
                schema: successEnvelope({ $ref: '#/components/schemas/CollectionWithProducts' }),
              },
            },
          },
          '404': collectionNotFoundResponse,
        },
      },
    },
    '/api/v1/admin/collections': {
      post: {
        summary: 'Create a collection, optionally with an initial product set (STAFF+)',
        tags: ['Catalog — Collections (admin)'],
        security: [{ bearerAuth: [] }],
        requestBody: collectionWriteRequestBody(true),
        responses: {
          '201': {
            description: 'Created',
            content: {
              'application/json': {
                schema: successEnvelope({ $ref: '#/components/schemas/Collection' }),
              },
            },
          },
          '404': {
            description: 'One or more productIds do not reference an active, non-deleted product',
            content: {
              'application/json': {
                schema: errorEnvelope('NOT_FOUND', 'One or more products not found or inactive'),
              },
            },
          },
          '409': {
            description: 'Duplicate slug, or no unique slug could be auto-generated',
            content: {
              'application/json': {
                schema: errorEnvelope('CONFLICT', 'A collection with this slug already exists'),
              },
            },
          },
          '422': validationFailedResponse,
          ...staffAuthResponses,
        },
      },
    },
    '/api/v1/admin/collections/{id}': {
      patch: {
        summary: 'Update a collection (STAFF+)',
        description:
          'All fields optional. Product set is managed separately, via the /products route.',
        tags: ['Catalog — Collections (admin)'],
        security: [{ bearerAuth: [] }],
        parameters: [collectionIdParam],
        requestBody: collectionWriteRequestBody(false),
        responses: {
          '200': {
            description: 'Updated',
            content: {
              'application/json': {
                schema: successEnvelope({ $ref: '#/components/schemas/Collection' }),
              },
            },
          },
          '404': collectionNotFoundResponse,
          '409': {
            description: 'Duplicate slug',
            content: {
              'application/json': {
                schema: errorEnvelope('CONFLICT', 'A collection with this slug already exists'),
              },
            },
          },
          '422': validationFailedResponse,
          ...staffAuthResponses,
        },
      },
      delete: {
        summary: 'Delete a collection (MANAGER+)',
        description: 'Cascades to its collection_products join rows.',
        tags: ['Catalog — Collections (admin)'],
        security: [{ bearerAuth: [] }],
        parameters: [collectionIdParam],
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
          '404': collectionNotFoundResponse,
          ...staffAuthResponses,
        },
      },
    },
    '/api/v1/admin/collections/{id}/products': {
      put: {
        summary: 'Replace a collection’s full product set (STAFF+)',
        description:
          'Atomic delete-then-insert — the join table always reflects exactly the submitted set afterward. Every id must reference an active, non-deleted product; an empty array clears the collection.',
        tags: ['Catalog — Collections (admin)'],
        security: [{ bearerAuth: [] }],
        parameters: [collectionIdParam],
        requestBody: setCollectionProductsRequestBody,
        responses: {
          '200': {
            description: 'Replaced',
            content: {
              'application/json': {
                schema: successEnvelope({
                  type: 'object',
                  properties: { updated: { type: 'boolean', example: true } },
                }),
              },
            },
          },
          '404': {
            description:
              'The collection does not exist, or one or more productIds do not reference an active, non-deleted product',
            content: {
              'application/json': { schema: errorEnvelope('NOT_FOUND', 'Collection not found') },
            },
          },
          '422': validationFailedResponse,
          ...staffAuthResponses,
        },
      },
    },
    '/api/v1/admin/banners': {
      post: {
        summary: 'Create a banner (STAFF+)',
        description:
          'endsAt must be after startsAt when both are present. linkValue must resolve to a real product/category/collection when linkType is not "url".',
        tags: ['Catalog — Banners (admin)'],
        security: [{ bearerAuth: [] }],
        requestBody: bannerWriteRequestBody(true),
        responses: {
          '201': {
            description: 'Created',
            content: {
              'application/json': {
                schema: successEnvelope({ $ref: '#/components/schemas/Banner' }),
              },
            },
          },
          '404': {
            description: 'linkValue does not reference an existing product/category/collection',
            content: {
              'application/json': {
                schema: errorEnvelope(
                  'NOT_FOUND',
                  'linkValue does not reference an existing product',
                ),
              },
            },
          },
          '422': validationFailedResponse,
          ...staffAuthResponses,
        },
      },
    },
    '/api/v1/admin/banners/{id}': {
      patch: {
        summary: 'Update a banner (STAFF+)',
        description:
          'All fields optional. Re-validates linkValue if linkType or linkValue changes.',
        tags: ['Catalog — Banners (admin)'],
        security: [{ bearerAuth: [] }],
        parameters: [bannerIdParam],
        requestBody: bannerWriteRequestBody(false),
        responses: {
          '200': {
            description: 'Updated',
            content: {
              'application/json': {
                schema: successEnvelope({ $ref: '#/components/schemas/Banner' }),
              },
            },
          },
          '404': bannerNotFoundResponse,
          '422': validationFailedResponse,
          ...staffAuthResponses,
        },
      },
      delete: {
        summary: 'Delete a banner (MANAGER+)',
        tags: ['Catalog — Banners (admin)'],
        security: [{ bearerAuth: [] }],
        parameters: [bannerIdParam],
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
          '404': bannerNotFoundResponse,
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
      Product: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          categoryId: { type: 'string', format: 'uuid', nullable: true },
          name: { type: 'string' },
          slug: { type: 'string' },
          description: { type: 'string', nullable: true },
          fabric: { type: 'string', nullable: true },
          careInstructions: { type: 'string', nullable: true },
          basePrice: {
            type: 'string',
            description: 'Decimal serialized as a string, e.g. "19.99".',
          },
          compareAtPrice: { type: 'string', nullable: true },
          isActive: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          deletedAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      ProductImage: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          productId: { type: 'string', format: 'uuid' },
          url: { type: 'string', format: 'uri' },
          sortOrder: { type: 'integer' },
          isPrimary: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ProductVariant: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          productId: { type: 'string', format: 'uuid' },
          size: { type: 'string' },
          color: { type: 'string' },
          sku: { type: 'string' },
          priceOverride: { type: 'string', nullable: true },
          stock: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      ProductWithRelations: {
        allOf: [
          { $ref: '#/components/schemas/Product' },
          {
            type: 'object',
            properties: {
              images: { type: 'array', items: { $ref: '#/components/schemas/ProductImage' } },
              variants: {
                type: 'array',
                items: { $ref: '#/components/schemas/ProductVariant' },
              },
            },
          },
        ],
      },
      Collection: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          slug: { type: 'string' },
          description: { type: 'string', nullable: true },
          isActive: { type: 'boolean' },
          startsAt: { type: 'string', format: 'date-time', nullable: true },
          endsAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CollectionWithProducts: {
        allOf: [
          { $ref: '#/components/schemas/Collection' },
          {
            type: 'object',
            properties: {
              products: {
                type: 'array',
                description: 'Ordered by the collection’s sortOrder.',
                items: { $ref: '#/components/schemas/Product' },
              },
            },
          },
        ],
      },
      Banner: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          imageUrl: { type: 'string', format: 'uri' },
          linkType: { type: 'string', enum: ['product', 'category', 'collection', 'url'] },
          linkValue: { type: 'string' },
          placement: { type: 'string', enum: ['homepage', 'campaign'] },
          sortOrder: { type: 'integer' },
          isActive: { type: 'boolean' },
          startsAt: { type: 'string', format: 'date-time', nullable: true },
          endsAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      HomeSections: {
        type: 'object',
        properties: {
          banners: {
            type: 'object',
            description: 'Active, in-window banners grouped by placement.',
            additionalProperties: {
              type: 'array',
              items: { $ref: '#/components/schemas/Banner' },
            },
            example: { homepage: [], campaign: [] },
          },
          collections: {
            type: 'array',
            items: { $ref: '#/components/schemas/CollectionWithProducts' },
          },
        },
      },
    },
  },
};
