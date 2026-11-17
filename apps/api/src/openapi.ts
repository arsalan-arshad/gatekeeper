export function buildOpenApiDocument(baseUrl: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Gatekeeper Agent API',
      version: '0.1.0',
      description:
        "Request intros through a person's Gatekeeper. Authenticate agent calls with an API key. Private gate rules are never returned.",
      license: { name: 'AGPL-3.0' },
      contact: {
        name: 'Arsalan',
        url: 'https://arsalandev.studio',
      },
    },
    servers: [{ url: baseUrl }],
    paths: {
      '/v1/requests': {
        post: {
          summary: 'Submit an intro request (API key)',
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['targetHandle', 'senderName', 'senderContact', 'message'],
                  properties: {
                    targetHandle: {
                      type: 'string',
                      description: 'Public Gatekeeper handle (without @)',
                    },
                    handle: { type: 'string', description: 'Alias of targetHandle' },
                    senderType: { type: 'string', enum: ['human', 'agent'], default: 'human' },
                    senderName: { type: 'string' },
                    senderContact: {
                      type: 'string',
                      description: 'Email or contact for double opt-in / reject replies',
                    },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Request stored and judged',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      request: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          status: {
                            type: 'string',
                            enum: ['pending', 'delivered', 'accepted', 'declined'],
                          },
                          decision: {
                            type: 'string',
                            nullable: true,
                            enum: ['accept', 'reject', 'spam', null],
                          },
                          aiScore: { type: 'integer', nullable: true },
                        },
                      },
                      judgment: {
                        type: 'object',
                        nullable: true,
                        properties: {
                          score: { type: 'integer' },
                          decision: { type: 'string', enum: ['accept', 'reject', 'spam'] },
                          reason_public: { type: 'string' },
                          suggested_rewrite: { type: 'string', nullable: true },
                        },
                      },
                    },
                  },
                },
              },
            },
            '401': { description: 'Missing or invalid API key' },
            '429': { description: 'Rate limited (per-key or per-IP)' },
          },
        },
      },
      '/v1/users/{handle}': {
        get: {
          summary: 'Public profile (no private rules)',
          parameters: [{ name: 'handle', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Public profile' },
            '404': { description: 'Not found' },
          },
        },
      },
      '/v1/directory': {
        get: {
          summary: 'Opt-in public directory (no emails, rules, or private fields)',
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: false,
              schema: { type: 'string', maxLength: 100 },
            },
            {
              name: 'role',
              in: 'query',
              required: false,
              schema: { type: 'string', maxLength: 80 },
            },
            {
              name: 'tag',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: 'Repeatable; at most 5',
            },
            {
              name: 'want',
              in: 'query',
              required: false,
              schema: { type: 'string', maxLength: 100 },
            },
            {
              name: 'cursor',
              in: 'query',
              required: false,
              schema: { type: 'string' },
            },
            {
              name: 'limit',
              in: 'query',
              required: false,
              schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
            },
          ],
          responses: {
            '200': {
              description:
                'Whitelisted public profiles only (handle, name, role, tags, bio, wants/offers summaries)',
            },
            '429': { description: 'IP rate limited (60/min)' },
          },
        },
      },
      '/llms.txt': {
        get: {
          summary: 'Instructions for AI agents',
          responses: { '200': { description: 'Plain text' } },
        },
      },
    },
    components: {
      securitySchemes: {
        ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
        BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'gk_…' },
      },
    },
  };
}
