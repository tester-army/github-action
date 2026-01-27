export interface ActionInputs {
  apiKey: string;
  credentialsEmail?: string;
  credentialsPassword?: string;
  timeout: number;
  failOnError: boolean;
}

export interface TestCredentials {
  email: string;
  password: string;
}

export interface TestRunRequest {
  credentials?: TestCredentials;
  timeout: number;
  context: {
    repository: string;
    sha: string;
    ref: string;
    actor: string;
    runId: number;
  };
}

export interface TestResult {
  id: string;
  status: 'passed' | 'failed' | 'error' | 'timeout';
  summary: string;
  reportUrl: string;
  duration: number;
  failedTests: number;
  passedTests: number;
  totalTests: number;
}

export interface TesterArmyError {
  error: string;
  message: string;
}

// New types for CI Test endpoint

export interface CITestRequest {
  url: string;
  context: {
    title: string;
    description?: string;
    changedFiles: string[];
  };
  credentials?: {
    email: string;
    password: string;
  };
}

export interface CITestResponse {
  output: {
    featureName: string;
    result: 'PASS' | 'FAILED';
    description: string;
    screenshots: string[];
    playwrightCode: string;
  };
  testPlan: {
    instructions: string;
    focusAreas: string[];
    complexity: 'simple' | 'moderate' | 'complex';
  };
  duration: number;
}

// Typed API errors
export class TesterArmyAPIError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'TesterArmyAPIError';
  }
}

export class BadRequestError extends TesterArmyAPIError {
  constructor(message: string) {
    super(message, 400, 'BAD_REQUEST');
    this.name = 'BadRequestError';
  }
}

export class UnauthorizedError extends TesterArmyAPIError {
  constructor(message: string) {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class RateLimitError extends TesterArmyAPIError {
  constructor(message: string, public readonly retryAfter?: number) {
    super(message, 429, 'RATE_LIMITED');
    this.name = 'RateLimitError';
  }
}

export class TimeoutError extends TesterArmyAPIError {
  constructor(message: string) {
    super(message, 504, 'TIMEOUT');
    this.name = 'TimeoutError';
  }
}

export class ServerError extends TesterArmyAPIError {
  constructor(message: string, statusCode: number) {
    super(message, statusCode, 'SERVER_ERROR');
    this.name = 'ServerError';
  }
}

// CI Test types

export interface CITestResponse {
  id: string;
  status: 'passed' | 'failed' | 'error';
  summary: string;
  details: string;
  screenshots: string[];
  playwrightCode?: string;
  duration: number;
  passedTests: number;
  failedTests: number;
  totalTests: number;
}
