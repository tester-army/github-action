import * as github from '@actions/github';
import * as core from '@actions/core';

/**
 * Deployment information extracted from a GitHub deployment_status event
 */
export interface DeploymentInfo {
  /** The deployment preview URL */
  url: string;
  /** The deployment environment (e.g., "Preview", "Production") */
  environment: string;
  /** The commit SHA that triggered the deployment */
  sha: string;
  /** Whether this is a Vercel deployment */
  isVercel: boolean;
}

/**
 * Vercel URL patterns for detection
 */
const VERCEL_URL_PATTERNS = [
  /\.vercel\.app$/i,
  /\.vercel\.dev$/i,
  /\.now\.sh$/i,
  /\.vercel\.sh$/i,
];

/**
 * Check if a URL is a Vercel deployment
 */
export function isVercelDeployment(url: string): boolean {
  try {
    const parsed = new URL(url);
    return VERCEL_URL_PATTERNS.some((pattern) => pattern.test(parsed.hostname));
  } catch {
    return false;
  }
}

/**
 * Extracts deployment information from a GitHub deployment_status event
 *
 * @param context - The GitHub Actions context
 * @returns DeploymentInfo if extraction succeeds, null otherwise
 */
export function extractDeploymentInfo(
  context: typeof github.context
): DeploymentInfo | null {
  // Validate event type
  if (context.eventName !== 'deployment_status') {
    core.debug(`Event is not deployment_status (got: ${context.eventName})`);
    return null;
  }

  const payload = context.payload;

  // Check deployment_status exists
  if (!payload.deployment_status) {
    core.warning('Missing deployment_status in event payload');
    return null;
  }

  const deploymentStatus = payload.deployment_status as {
    state?: string;
    target_url?: string;
    environment?: string;
    description?: string;
  };

  // Only process successful deployments
  const state = deploymentStatus.state;
  if (state !== 'success') {
    core.debug(`Deployment state is not success (got: ${state})`);
    return null;
  }

  // Extract target URL
  const targetUrl = deploymentStatus.target_url;
  if (!targetUrl || typeof targetUrl !== 'string') {
    core.warning('Missing or invalid target_url in deployment_status');
    return null;
  }

  // Validate URL format
  try {
    new URL(targetUrl);
  } catch {
    core.warning(`Invalid target_url format: ${targetUrl}`);
    return null;
  }

  // Extract environment
  const environment = deploymentStatus.environment ?? 'unknown';

  // Extract SHA from deployment or context
  let sha: string;

  const deployment = payload.deployment as { sha?: string } | undefined;
  if (deployment?.sha && typeof deployment.sha === 'string') {
    sha = deployment.sha;
  } else {
    sha = context.sha;
    core.debug('Using context.sha as deployment.sha was not available');
  }

  // Check if it's a Vercel deployment
  const isVercel = isVercelDeployment(targetUrl);

  core.info(`Extracted deployment info: ${targetUrl} (${environment})`);
  core.debug(`SHA: ${sha}, Vercel: ${isVercel}`);

  return {
    url: targetUrl,
    environment,
    sha,
    isVercel,
  };
}

/**
 * Creates a mock context for testing purposes
 */
export function createMockContext(options: {
  state: string;
  targetUrl?: string;
  environment?: string;
  sha?: string;
  eventName?: string;
}): typeof github.context {
  return {
    eventName: options.eventName ?? 'deployment_status',
    sha: options.sha ?? 'abc123def456',
    ref: 'refs/heads/main',
    actor: 'test-user',
    repo: { owner: 'test-owner', repo: 'test-repo' },
    runId: 12345,
    runNumber: 1,
    runAttempt: 1,
    job: 'test-job',
    action: 'test-action',
    workflow: 'test-workflow',
    issue: { owner: 'test-owner', repo: 'test-repo', number: 1 },
    payload: {
      deployment_status: {
        state: options.state,
        target_url: options.targetUrl,
        environment: options.environment,
        description: 'Deployment completed',
      },
      deployment: {
        sha: options.sha ?? 'abc123def456',
        ref: 'feature/test-branch',
      },
    },
    apiUrl: 'https://api.github.com',
    serverUrl: 'https://github.com',
    graphqlUrl: 'https://api.github.com/graphql',
  } as typeof github.context;
}
