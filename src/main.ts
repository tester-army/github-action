import * as core from '@actions/core';
import * as github from '@actions/github';
import { createClient } from './tester-army.js';
import { getGitHubContext, formatSummary } from './github.js';
import { extractDeploymentInfo } from './deployment.js';
import { fetchPRContext } from './pr-context.js';
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

    const deploymentInfo = extractDeploymentInfo(github.context);
    if (!deploymentInfo) {
      core.setFailed('No successful deployment_status event with target_url found');
      return;
    }

    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      core.setFailed('Missing GITHUB_TOKEN for PR context lookup');
      return;
    }

    const octokit = github.getOctokit(githubToken);
    const { owner, repo } = github.context.repo;
    const prContext = await fetchPRContext(
      octokit,
      owner,
      repo,
      deploymentInfo.sha
    );

    if (!prContext) {
      core.setFailed('Unable to resolve PR context for deployment');
      return;
    }

    const request: CITestRequest = {
      url: deploymentInfo.url,
      context: {
        title: prContext.title,
        description: prContext.description,
        changedFiles: prContext.changedFiles,
      },
      credentials,
    };

    const result = await client.runCITest(request);

    const normalizedResult =
      result.output.result === 'PASS' ? 'passed' : 'failed';

    // Set outputs
    core.setOutput('result', normalizedResult);
    core.setOutput('summary', result.output.description);
    core.setOutput('report-url', result.output.screenshots[0] ?? '');

    // Write job summary
    const summary = formatSummary(
      result.output.result,
      result.output.featureName,
      result.duration,
      result.output.screenshots[0]
    );
    await core.summary.addRaw(summary).write();

    // Log results
    core.info(`\n📊 Test Results:`);
    core.info(`   Result: ${result.output.result}`);
    core.info(`   Feature: ${result.output.featureName}`);
    core.info(`   Duration: ${result.duration}ms`);

    // Handle failure
    if (result.output.result !== 'PASS' && inputs.failOnError) {
      core.setFailed('Tests failed');
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
