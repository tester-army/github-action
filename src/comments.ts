import * as core from '@actions/core';
import type { GitHub } from '@actions/github/lib/utils';
import type { CITestResponse } from './types.js';

export type Octokit = InstanceType<typeof GitHub>;

const COMMENT_MARKER = '<!-- tester-army-comment -->';

/**
 * Posts or updates a comment on a PR with test results
 */
export async function postOrUpdateComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  result: CITestResponse,
  deploymentUrl: string
): Promise<void> {
  core.debug(`Posting comment for PR #${prNumber}`);

  const body = formatComment(result, deploymentUrl);

  try {
    // Check for existing comment
    const existingCommentId = await findExistingComment(
      octokit,
      owner,
      repo,
      prNumber
    );

    if (existingCommentId) {
      // Update existing comment
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existingCommentId,
        body,
      });
      core.info(`Updated existing comment #${existingCommentId} on PR #${prNumber}`);
    } else {
      // Create new comment
      const { data } = await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body,
      });
      core.info(`Created comment #${data.id} on PR #${prNumber}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.warning(`Failed to post comment on PR #${prNumber}: ${message}`);
    throw error;
  }
}

/**
 * Finds an existing Tester Army comment on the PR
 */
async function findExistingComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<number | null> {
  try {
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    });

    for (const comment of comments) {
      if (comment.body?.includes(COMMENT_MARKER)) {
        return comment.id;
      }
    }

    return null;
  } catch (error) {
    core.debug(`Error finding existing comment: ${error}`);
    return null;
  }
}

/**
 * Formats the PR comment with test results
 */
export function formatComment(
  result: CITestResponse,
  deploymentUrl: string
): string {
  const statusEmoji = result.status === 'passed' ? '✅' : '❌';
  const statusText = result.status === 'passed' ? 'Passed' : 'Failed';
  const duration = formatDuration(result.duration);

  const sections: string[] = [
    COMMENT_MARKER,
    '## 🧪 Tester Army Results',
    '',
    `**Status:** ${statusEmoji} ${statusText}`,
    `**Duration:** ${duration}`,
    `**Tested URL:** ${deploymentUrl}`,
    '',
  ];

  // Summary
  if (result.summary) {
    sections.push('### Summary');
    sections.push(`> ${result.summary}`);
    sections.push('');
  }

  // Results details
  if (result.details) {
    sections.push('### Results');
    sections.push(result.details);
    sections.push('');
  }

  // Screenshots
  if (result.screenshots && result.screenshots.length > 0) {
    sections.push('### Screenshots');
    result.screenshots.forEach((url, i) => {
      sections.push(`![Screenshot ${i + 1}](${url})`);
    });
    sections.push('');
  }

  // Playwright code
  if (result.playwrightCode) {
    sections.push('<details>');
    sections.push('<summary>📝 Generated Playwright Code</summary>');
    sections.push('');
    sections.push('```typescript');
    sections.push(result.playwrightCode);
    sections.push('```');
    sections.push('');
    sections.push('</details>');
    sections.push('');
  }

  // Footer
  sections.push('---');
  sections.push('*Tested by [Tester Army](https://tester.army)*');

  return sections.join('\n');
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
