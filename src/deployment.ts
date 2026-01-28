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
 * Deployment status payload structure from GitHub webhook
 */
interface DeploymentStatusPayload {
  state?: string;
  target_url?: string;
  environment?: string;
  description?: string;
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
 * Validates a URL string and returns the parsed URL if valid
 *
 * @param url - The URL string to validate
 * @returns The parsed URL object if valid, null otherwise
 */
function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * Check if a parsed URL is a Vercel deployment
 *
 * @param parsedUrl - The parsed URL object to check
 * @returns true if the URL matches a Vercel deployment pattern
 */
function isVercelUrl(parsedUrl: URL): boolean {
  return VERCEL_URL_PATTERNS.some((pattern) => pattern.test(parsedUrl.hostname));
}

/**
 * Check if a URL string is a Vercel deployment
 *
 * @param url - The URL string to check
 * @returns true if the URL matches a Vercel deployment pattern
 */
export function isVercelDeployment(url: string): boolean {
  const parsed = parseUrl(url);
  return parsed !== null && isVercelUrl(parsed);
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

  const deploymentStatus = payload.deployment_status as DeploymentStatusPayload;

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

  // Validate URL format and check if it's Vercel in one parse
  const parsedUrl = parseUrl(targetUrl);
  if (!parsedUrl) {
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

  // Check if it's a Vercel deployment (reuses already parsed URL)
  const isVercel = isVercelUrl(parsedUrl);

  core.info(`Extracted deployment info: ${targetUrl} (${environment})`);
  core.debug(`SHA: ${sha}, Vercel: ${isVercel}`);

  return {
    url: targetUrl,
    environment,
    sha,
    isVercel,
  };
}
