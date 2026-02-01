import {
  BadRequestError,
  UnauthorizedError,
  RateLimitError,
  TimeoutError,
  ServerError,
} from './types.js';
import type { CITestRequest, CITestResponse, TesterArmyError } from './types.js';

const DEFAULT_BASE_URL = 'https://tester.army';
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
    const response = await fetch(`${baseUrl}/v1/ci/test`, {
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
      throw new TimeoutError(`Request timed out after ${timeout}ms`);
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
    case 400:
      throw new BadRequestError(message);
    case 401:
      throw new UnauthorizedError(message);
    case 429: {
      const retryAfterHeader = response.headers.get('Retry-After');
      const retryAfter = retryAfterHeader
        ? Number.parseInt(retryAfterHeader, 10)
        : undefined;
      throw new RateLimitError(
        message,
        Number.isFinite(retryAfter) ? retryAfter : undefined
      );
    }
    case 504:
      throw new TimeoutError(message);
    default:
      if (response.status >= 500) {
        throw new ServerError(message, response.status);
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
