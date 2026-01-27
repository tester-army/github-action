import type { TestRunRequest, TestResult, TesterArmyError } from './types.js';

const API_BASE_URL = 'https://api.testerarmy.com/v1';

export class TesterArmyClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async runTests(request: TestRunRequest): Promise<TestResult> {
    const response = await fetch(`${API_BASE_URL}/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'User-Agent': 'tester-army-github-action/0.1.0',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json() as TesterArmyError;
      throw new Error(`Tester Army API error: ${error.message} (${error.code})`);
    }

    return response.json() as Promise<TestResult>;
  }

  async getRunStatus(runId: string): Promise<TestResult> {
    const response = await fetch(`${API_BASE_URL}/runs/${runId}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'User-Agent': 'tester-army-github-action/0.1.0',
      },
    });

    if (!response.ok) {
      const error = await response.json() as TesterArmyError;
      throw new Error(`Tester Army API error: ${error.message} (${error.code})`);
    }

    return response.json() as Promise<TestResult>;
  }

  async pollUntilComplete(runId: string, timeoutMs: number): Promise<TestResult> {
    const startTime = Date.now();
    const pollInterval = 5000; // 5 seconds

    while (Date.now() - startTime < timeoutMs) {
      const result = await this.getRunStatus(runId);
      
      if (result.status !== 'passed' && result.status !== 'failed' && 
          result.status !== 'error' && result.status !== 'timeout') {
        // Still running, wait and poll again
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        continue;
      }

      return result;
    }

    throw new Error(`Test run timed out after ${timeoutMs}ms`);
  }
}
