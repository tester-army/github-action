import * as core from '@actions/core';
import * as github from '@actions/github';
import { createClient } from './tester-army.js';
import { getGitHubContext, formatSummary } from './github.js';
import { extractDeploymentInfo } from './deployment.js';
import { fetchPRContext } from './pr-context.js';
import { createCheck, updateCheck, updateCheckFailure } from './checks.js';
import { postOrUpdateComment } from './comments.js';
import type {
  ActionInputs,
  TestCredentials,
  CITestRequest,
} from './types.js';

function getInputs(): ActionInputs {
  const apiKey = core.getInput('api-key', { required: true });
  const credentialsEmail = core.getInput('credentials-email');
  const credentialsPassword = core.getInput('credentials-password');
  const timeout = parseInt(core.getInput('timeout') || '180000', 10);
  const failOnError = core.getBooleanInput('fail-on-error');
  const vercelBypassToken = core.getInput('vercel-bypass-token');

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
    vercelBypassToken: vercelBypassToken || undefined,
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
      core.info('No successful deployment_status event found. Skipping.');
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
      core.info('No PR context found for deployment. Skipping.');
      return;
    }

    if (prContext.changedFiles.length === 0) {
      core.info('PR context has no changed files. Skipping.');
      return;
    }

    let checkRunId: number | undefined;
    try {
      checkRunId = await createCheck(octokit, owner, repo, deploymentInfo.sha);
    } catch {
      core.warning('Continuing without check run due to create failure.');
    }

    const request: CITestRequest = {
      url: deploymentInfo.url,
      context: {
        title: prContext.title,
        description: prContext.description,
        changedFiles: prContext.changedFiles,
      },
      credentials,
      vercelBypassToken: inputs.vercelBypassToken,
    };

    let result;
    try {
      result = await client.runCITest(request);
    } catch (error) {
      if (checkRunId) {
        const message =
          error instanceof Error ? error.message : 'Tester Army run failed';
        try {
          await updateCheckFailure(octokit, owner, repo, checkRunId, message);
        } catch {
          // Ignore check update failure
        }
      }
      throw error;
    }

    if (checkRunId) {
      await updateCheck(octokit, owner, repo, checkRunId, result);
    }

    try {
      await postOrUpdateComment(
        octokit,
        owner,
        repo,
        prContext.number,
        result,
        deploymentInfo.url
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      core.warning(`Failed to post PR comment: ${message}`);
    }

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
