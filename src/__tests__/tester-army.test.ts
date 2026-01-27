import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient } from '../tester-army.js';
import type { CITestRequest, CITestResponse } from '../types.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('TesterArmyClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const testRequest: CITestRequest = {
    deploymentUrl: 'https://preview.example.com',
    prContext: {
      title: 'Test PR',
      description: 'Test description',
      changedFiles: ['src/index.ts'],
    },
  };

  const successResponse: CITestResponse = {
    id: 'test-123',
    status: 'passed',
    summary: 'All tests passed',
    details: 'Detailed results...',
    screenshots: ['https://example.com/screenshot1.png'],
    playwrightCode: 'test("example", async () => {});',
    duration: 5000,
    passedTests: 3,
    failedTests: 0,
    totalTests: 3,
  };

  describe('successful API call', () => {
    it('should call the CI test endpoint and return response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(successResponse),
      });

      const client = createClient('test-api-key');
      const result = await client.runCITest(testRequest);

      expect(result).toEqual(successResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.testerarmy.com/api/v1/ci/test',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-api-key',
            'User-Agent': 'tester-army-github-action/0.1.0',
          }),
          body: JSON.stringify(testRequest),
        })
      );
    });

    it('should use custom baseUrl when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(successResponse),
      });

      const client = createClient('test-api-key', {
        baseUrl: 'https://staging.testerarmy.com',
      });
      await client.runCITest(testRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://staging.testerarmy.com/api/v1/ci/test',
        expect.any(Object)
      );
    });
  });

  describe('400 error handling', () => {
    it('should throw BadRequestError for 400 responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ message: 'Invalid deployment URL' }),
      });

      const client = createClient('test-api-key');

      await expect(client.runCITest(testRequest)).rejects.toMatchObject({
        name: 'BadRequestError',
        message: 'Invalid deployment URL',
      });
    });
  });

  describe('401 error handling', () => {
    it('should throw UnauthorizedError for 401 responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ message: 'Invalid API key' }),
      });

      const client = createClient('bad-api-key');

      await expect(client.runCITest(testRequest)).rejects.toMatchObject({
        name: 'UnauthorizedError',
        message: 'Invalid API key',
      });
    });
  });

  describe('429 rate limit handling', () => {
    it('should throw RateLimitError for 429 responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({ 'Retry-After': '60' }),
        json: () => Promise.resolve({ message: 'Rate limit exceeded' }),
      });

      const client = createClient('test-api-key');

      await expect(client.runCITest(testRequest)).rejects.toMatchObject({
        name: 'RateLimitError',
        message: 'Rate limit exceeded',
      });
    });
  });

  describe('5xx retry logic', () => {
    it('should retry on 500 errors (mocked without real delay)', async () => {
      // Temporarily set delay to 0 for testing by mocking setTimeout
      const originalSetTimeout = globalThis.setTimeout;
      globalThis.setTimeout = ((fn: () => void) =>
        originalSetTimeout(fn, 0)) as typeof setTimeout;

      try {
        // First two calls fail with 500, third succeeds
        mockFetch
          .mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            json: () => Promise.resolve({ message: 'Server error' }),
          })
          .mockResolvedValueOnce({
            ok: false,
            status: 503,
            statusText: 'Service Unavailable',
            json: () => Promise.resolve({ message: 'Service unavailable' }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(successResponse),
          });

        const client = createClient('test-api-key');
        const result = await client.runCITest(testRequest);

        expect(result).toEqual(successResponse);
        expect(mockFetch).toHaveBeenCalledTimes(3);
      } finally {
        globalThis.setTimeout = originalSetTimeout;
      }
    });

    it('should fail after max retries on persistent 5xx errors', async () => {
      const originalSetTimeout = globalThis.setTimeout;
      globalThis.setTimeout = ((fn: () => void) =>
        originalSetTimeout(fn, 0)) as typeof setTimeout;

      try {
        mockFetch
          .mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            json: () => Promise.resolve({ message: 'Persistent server error' }),
          })
          .mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            json: () => Promise.resolve({ message: 'Persistent server error' }),
          })
          .mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            json: () => Promise.resolve({ message: 'Persistent server error' }),
          });

        const client = createClient('test-api-key');

        await expect(client.runCITest(testRequest)).rejects.toMatchObject({
          name: 'ServerError',
        });

        // Initial + 2 retries = 3 attempts
        expect(mockFetch).toHaveBeenCalledTimes(3);
      } finally {
        globalThis.setTimeout = originalSetTimeout;
      }
    });

    it('should not retry on 4xx errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ message: 'Bad request' }),
      });

      const client = createClient('test-api-key');

      await expect(client.runCITest(testRequest)).rejects.toMatchObject({
        name: 'BadRequestError',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('response parsing', () => {
    it('should handle non-JSON error responses', async () => {
      const originalSetTimeout = globalThis.setTimeout;
      globalThis.setTimeout = ((fn: () => void) =>
        originalSetTimeout(fn, 0)) as typeof setTimeout;

      try {
        mockFetch
          .mockResolvedValueOnce({
            ok: false,
            status: 502,
            statusText: 'Bad Gateway',
            json: () => Promise.reject(new Error('Invalid JSON')),
          })
          .mockResolvedValueOnce({
            ok: false,
            status: 502,
            statusText: 'Bad Gateway',
            json: () => Promise.reject(new Error('Invalid JSON')),
          })
          .mockResolvedValueOnce({
            ok: false,
            status: 502,
            statusText: 'Bad Gateway',
            json: () => Promise.reject(new Error('Invalid JSON')),
          });

        const client = createClient('test-api-key');

        await expect(client.runCITest(testRequest)).rejects.toMatchObject({
          name: 'ServerError',
        });
      } finally {
        globalThis.setTimeout = originalSetTimeout;
      }
    });
  });
});
