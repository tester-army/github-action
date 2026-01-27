import * as core from '@actions/core';
import { createClient } from './tester-army.js';
import { getGitHubContext, formatSummary } from './github.js';
import type { ActionInputs, TestCredentials, CITestRequest } from './types.js';

function getInputs(): ActionInputs {
  const apiKey = core.getInput('api-key', { required: true });
  const credentialsEmail = core.getInput('credentials-email');
  const credentialsPassword = core.getInput('credentials-password');
  const timeout = parseInt(core.getInput('timeout') || '180000', 10);
  const failOnError = core.getBooleanInput('fail-on-error');

  // Validate timeout
  if (timeout < 1000 || timeout > 300000) {
    throw new Error('Timeout must be between 1000 and 300000 milliseconds');
  }

  return {
    apiKey,
    credentialsEmail: credentialsEmail || undefined,
    credentialsPassword: credentialsPassword || undefined,
    timeout,
    failOnError,
  };
}

function getCredentials(inputs: ActionInputs): TestCredentials | undefined {
  if (inputs.credentialsEmail && inputs.credentialsPassword) {
    return {
      email: inputs.credentialsEmail,
      password: inputs.credentialsPassword,
    };
  }
  return undefined;
}

async function run(): Promise<void> {
  try {
    const inputs = getInputs();
    const context = getGitHubContext();
    const credentials = getCredentials(inputs);

    core.info('🧪 Starting Tester Army test run...');
    core.info(`Repository: ${context.repository}`);
    core.info(`Commit: ${context.sha.substring(0, 7)}`);
    core.info(`Timeout: ${inputs.timeout}ms`);

    const client = createClient(inputs.apiKey, { timeout: inputs.timeout });

    // TODO: In production, deploymentUrl comes from deployment extraction
    // and prContext comes from PR context fetching
    const request: CITestRequest = {
      deploymentUrl: 'https://preview.example.com', // Placeholder
      prContext: {
        title: 'PR Title', // Placeholder
        description: 'PR Description', // Placeholder
        changedFiles: [], // Placeholder
      },
      credentials,
    };

    const result = await client.runCITest(request);

    // Set outputs
    core.setOutput('result', result.status);
    core.setOutput('summary', result.summary);

    // Write job summary
    const summary = formatSummary(
      result.status,
      result.passedTests,
      result.failedTests,
      result.totalTests,
      '' // No reportUrl in new response
    );
    await core.summary.addRaw(summary).write();

    // Log results
    core.info(`\n📊 Test Results:`);
    core.info(`   Status: ${result.status}`);
    core.info(`   Passed: ${result.passedTests}/${result.totalTests}`);
    core.info(`   Duration: ${result.duration}ms`);

    // Handle failure
    if (result.status !== 'passed' && inputs.failOnError) {
      core.setFailed(
        `Tests failed: ${result.failedTests} of ${result.totalTests} tests failed`
      );
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unexpected error occurred');
    }
  }
}

run();
