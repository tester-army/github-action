import * as core from '@actions/core';
import type { GitHub } from '@actions/github/lib/utils';

export type Octokit = InstanceType<typeof GitHub>;

/**
 * Represents the context of a Pull Request associated with a deployment
 */
export interface PRContext {
  /** PR number */
  number: number;
  /** PR title */
  title: string;
  /** PR description/body */
  description: string;
  /** List of files changed in the PR */
  changedFiles: string[];
  /** Head branch name (source branch) */
  branch: string;
  /** Base branch name (target branch) */
  baseBranch: string;
}

/**
 * Represents a file changed in a PR
 */
interface PRFile {
  filename: string;
  status: string;
}

/**
 * Fetches the PR context associated with a commit SHA
 *
 * @param octokit - Authenticated GitHub API client
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param sha - Commit SHA to find associated PR
 * @returns PRContext if a PR is found, null otherwise
 */
export async function fetchPRContext(
  octokit: Octokit,
  owner: string,
  repo: string,
  sha: string
): Promise<PRContext | null> {
  core.debug(`Fetching PR context for commit ${sha} in ${owner}/${repo}`);

  try {
    // Find PRs associated with this commit
    const { data: pulls } =
      await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
        owner,
        repo,
        commit_sha: sha,
        per_page: 100,
      });

    if (pulls.length === 0) {
      core.warning(`No PR found associated with commit ${sha}`);
      return null;
    }

    // Use the first (most recent) PR associated with this commit
    const pr = pulls[0];
    core.info(`Found PR #${pr.number}: ${pr.title}`);

    // Fetch all changed files with pagination
    const changedFiles = await fetchAllChangedFiles(
      octokit,
      owner,
      repo,
      pr.number
    );
    core.debug(`Found ${changedFiles.length} changed files in PR #${pr.number}`);

    return {
      number: pr.number,
      title: pr.title,
      description: pr.body ?? '',
      changedFiles,
      branch: pr.head.ref,
      baseBranch: pr.base.ref,
    };
  } catch (error) {
    handleAPIError(error, sha);
    return null;
  }
}

/**
 * Fetches all changed files in a PR, handling pagination
 *
 * @param octokit - Authenticated GitHub API client
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param pullNumber - PR number
 * @returns Array of filenames changed in the PR
 */
async function fetchAllChangedFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<string[]> {
  const changedFiles: string[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    core.debug(`Fetching changed files page ${page} for PR #${pullNumber}`);

    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: perPage,
      page,
    });

    for (const file of files as PRFile[]) {
      changedFiles.push(file.filename);
    }

    // If we got fewer files than perPage, we've reached the end
    if (files.length < perPage) {
      break;
    }

    page++;

    // Safety limit to prevent infinite loops (GitHub max is 3000 files)
    if (page > 30) {
      core.warning(`PR #${pullNumber} has more than 3000 files, truncating`);
      break;
    }
  }

  return changedFiles;
}

/**
 * Handles API errors gracefully with appropriate logging
 *
 * @param error - The error that occurred
 * @param sha - The commit SHA being queried (for context)
 */
function handleAPIError(error: unknown, sha: string): void {
  if (isRateLimitError(error)) {
    core.warning(
      `GitHub API rate limit exceeded while fetching PR context for ${sha}`
    );
    core.warning(
      'Consider using a PAT with higher rate limits or reducing API calls'
    );
    return;
  }

  if (isNotFoundError(error)) {
    core.warning(`Commit ${sha} not found or no access to repository`);
    return;
  }

  // Log unexpected errors
  const message = error instanceof Error ? error.message : String(error);
  core.warning(`Failed to fetch PR context for ${sha}: ${message}`);
}

/**
 * Checks if an error is a GitHub rate limit error
 */
function isRateLimitError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    if (status !== 403) {
      return false;
    }
    const message =
      'message' in error ? String((error as { message?: string }).message) : '';
    return message.toLowerCase().includes('rate limit');
  }
  return false;
}

/**
 * Checks if an error is a 404 Not Found error
 */
function isNotFoundError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status === 404;
  }
  return false;
}
