import * as core from '@actions/core';
import type { GitHub } from '@actions/github/lib/utils';
import type { CITestResponse } from './types.js';

export type Octokit = InstanceType<typeof GitHub>;

const CHECK_NAME = 'Tester Army';

/**
 * Creates a new GitHub Check in "in_progress" state
 *
 * @returns The check_run_id
 */
export async function createCheck(
  octokit: Octokit,
  owner: string,
  repo: string,
  sha: string,
  name: string = CHECK_NAME
): Promise<number> {
  core.debug(`Creating check "${name}" for ${sha}`);

  try {
    const { data } = await octokit.rest.checks.create({
      owner,
      repo,
      name,
      head_sha: sha,
      status: 'in_progress',
      started_at: new Date().toISOString(),
      output: {
        title: 'Running tests...',
        summary: 'Tester Army is running automated tests on your preview deployment.',
      },
    });

    core.info(`Created check run #${data.id}`);
    return data.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.warning(`Failed to create check: ${message}`);
    throw error;
  }
}

/**
 * Updates an existing GitHub Check with test results
 */
export async function updateCheck(
  octokit: Octokit,
  owner: string,
  repo: string,
  checkRunId: number,
  result: CITestResponse
): Promise<void> {
  core.debug(`Updating check #${checkRunId} with result: ${result.output.result}`);

  const conclusion = result.output.result === 'PASS' ? 'success' : 'failure';
  const title = formatCheckTitle(result);
  const summary = formatCheckSummary(result);
  const details = formatCheckDetails(result);

  try {
    await octokit.rest.checks.update({
      owner,
      repo,
      check_run_id: checkRunId,
      status: 'completed',
      conclusion,
      completed_at: new Date().toISOString(),
      output: {
        title,
        summary,
        text: details,
      },
    });

    core.info(`Updated check #${checkRunId}: ${conclusion}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.warning(`Failed to update check: ${message}`);
    throw error;
  }
}

/**
 * Updates an existing GitHub Check with an error message
 */
export async function updateCheckFailure(
  octokit: Octokit,
  owner: string,
  repo: string,
  checkRunId: number,
  message: string
): Promise<void> {
  core.debug(`Updating check #${checkRunId} with failure`);

  try {
    await octokit.rest.checks.update({
      owner,
      repo,
      check_run_id: checkRunId,
      status: 'completed',
      conclusion: 'failure',
      completed_at: new Date().toISOString(),
      output: {
        title: 'Tester Army: Error',
        summary: message,
      },
    });

    core.info(`Updated check #${checkRunId}: failure`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    core.warning(`Failed to update check: ${errorMessage}`);
    throw error;
  }
}

/**
 * Formats the check title based on test results
 */
function formatCheckTitle(result: CITestResponse): string {
  return `Tester Army: ${result.output.result}`;
}

/**
 * Formats the check summary (one-line result)
 */
function formatCheckSummary(result: CITestResponse): string {
  const emoji = result.output.result === 'PASS' ? '✅' : '❌';
  const duration = formatDuration(result.duration);

  return `${emoji} ${result.output.description}\n\n**Feature:** ${result.output.featureName} | **Duration:** ${duration}`;
}

/**
 * Formats the detailed check output
 */
function formatCheckDetails(result: CITestResponse): string {
  const sections: string[] = [];

  // Test details
  if (result.output.description) {
    sections.push('## Test Results\n\n' + result.output.description);
  }

  // Screenshots
  if (result.output.screenshots && result.output.screenshots.length > 0) {
    sections.push(
      '## Screenshots\n\n' + formatScreenshots(result.output.screenshots)
    );
  }

  // Playwright code
  if (result.output.playwrightCode) {
    sections.push(formatPlaywrightCode(result.output.playwrightCode));
  }

  return sections.join('\n\n---\n\n');
}

/**
 * Formats screenshots as markdown images
 */
function formatScreenshots(screenshots: string[]): string {
  return screenshots
    .map((url, i) => `![Screenshot ${i + 1}](${url})`)
    .join('\n\n');
}

/**
 * Formats Playwright code in a collapsible section
 */
function formatPlaywrightCode(code: string): string {
  return `<details>
<summary>📝 Generated Playwright Code</summary>

\`\`\`typescript
${code}
\`\`\`

</details>`;
}

/**
 * Formats duration as human-readable string
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) {
    return `${minutes}m`;
  }
  return `${minutes}m ${remainingSeconds}s`;
}
