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
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
