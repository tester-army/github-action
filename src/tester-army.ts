import type {
  CITestRequest,
  CITestResponse,
  BadRequestError,
  UnauthorizedError,
  RateLimitError,
  TimeoutError,
  ServerError,
  TesterArmyError,
} from './types.js';

const DEFAULT_BASE_URL = 'https://api.testerarmy.com';
const DEFAULT_TIMEOUT = 300000; // 5 minutes
const MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY = 1000; // 1 second

export interface TesterArmyClientOptions {
  baseUrl?: string;
  timeout?: number;
}

export interface TesterArmyClient {
  runCITest(request: CITestRequest): Promise<CITestResponse>;
}

/**
 * Creates a Tester Army API client with retry logic and proper error handling
 */
export function createClient(
  apiKey: string,
  options?: TesterArmyClientOptions
): TesterArmyClient {
  const baseUrl = options?.baseUrl ?? DEFAULT_BASE_URL;
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;

  return {
    runCITest: (request: CITestRequest) =>
      runCITest(apiKey, baseUrl, timeout, request),
  };
}

/**
 * Runs a CI test with retry logic for transient failures
 */
async function runCITest(
  apiKey: string,
  baseUrl: string,
  timeout: number,
  request: CITestRequest
): Promise<CITestResponse> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await executeRequest(apiKey, baseUrl, timeout, request);
    } catch (error) {
      if (error instanceof Error) {
        lastError = error;

        // Only retry on 5xx server errors
        if (isServerError(error) && attempt < MAX_RETRIES) {
          const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
          await sleep(delay);
          continue;
        }
      }

      // Don't retry on client errors (4xx) or after max retries
      throw error;
    }
  }

  throw lastError ?? new Error('Unexpected error in retry loop');
}

/**
 * Executes a single API request
 */
async function executeRequest(
  apiKey: string,
  baseUrl: string,
  timeout: number,
  request: CITestRequest
): Promise<CITestResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${baseUrl}/api/v1/ci/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': 'tester-army-github-action/0.1.0',
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      await handleErrorResponse(response);
    }

    return (await response.json()) as CITestResponse;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      const err = new Error(
        `Request timed out after ${timeout}ms`
      ) as Error & { statusCode: number };
      err.statusCode = 504;
      err.name = 'TimeoutError';
      throw err;
    }

    throw error;
  }
}

/**
 * Handles error responses and throws appropriate typed errors
 */
async function handleErrorResponse(response: Response): Promise<never> {
  let errorBody: TesterArmyError | null = null;

  try {
    errorBody = (await response.json()) as TesterArmyError;
  } catch {
    // Response body is not JSON, use status text
  }

  const message =
    errorBody?.message ?? response.statusText ?? 'Unknown error';

  switch (response.status) {
    case 400: {
      const err = new Error(message) as BadRequestError;
      err.name = 'BadRequestError';
      (err as unknown as { statusCode: number }).statusCode = 400;
      throw err;
    }
    case 401: {
      const err = new Error(message) as UnauthorizedError;
      err.name = 'UnauthorizedError';
      (err as unknown as { statusCode: number }).statusCode = 401;
      throw err;
    }
    case 429: {
      const retryAfter = response.headers.get('Retry-After');
      const err = new Error(message) as RateLimitError;
      err.name = 'RateLimitError';
      (err as unknown as { statusCode: number }).statusCode = 429;
      (err as unknown as { retryAfter: number | undefined }).retryAfter =
        retryAfter ? parseInt(retryAfter, 10) : undefined;
      throw err;
    }
    case 504: {
      const err = new Error(message) as TimeoutError;
      err.name = 'TimeoutError';
      (err as unknown as { statusCode: number }).statusCode = 504;
      throw err;
    }
    default:
      if (response.status >= 500) {
        const err = new Error(message) as ServerError;
        err.name = 'ServerError';
        (err as unknown as { statusCode: number }).statusCode = response.status;
        throw err;
      }
      throw new Error(`Tester Army API error (${response.status}): ${message}`);
  }
}

/**
 * Checks if an error is a server error (5xx)
 */
function isServerError(error: Error): boolean {
  return (
    error.name === 'ServerError' ||
    ((error as unknown as { statusCode?: number }).statusCode ?? 0) >= 500
  );
}

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Legacy exports for backward compatibility
export { TesterArmyClient as TesterArmyClientInterface };
