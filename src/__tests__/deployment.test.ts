import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as github from '@actions/github';
import {
  extractDeploymentInfo,
  isVercelDeployment,
  type DeploymentInfo,
} from '../deployment.js';
import * as core from '@actions/core';

// Mock @actions/core
vi.mock('@actions/core', () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));

/**
 * Creates a mock context for testing purposes
 */
function createMockContext(options: {
  state: string;
  targetUrl?: string;
  environmentUrl?: string;
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
        environment_url: options.environmentUrl,
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

describe('isVercelDeployment', () => {
  it('should detect .vercel.app URLs', () => {
    expect(isVercelDeployment('https://my-app-abc123.vercel.app')).toBe(true);
    expect(isVercelDeployment('https://preview-12345.vercel.app')).toBe(true);
  });

  it('should detect .vercel.dev URLs', () => {
    expect(isVercelDeployment('https://my-app.vercel.dev')).toBe(true);
  });

  it('should detect legacy .now.sh URLs', () => {
    expect(isVercelDeployment('https://my-app.now.sh')).toBe(true);
  });

  it('should detect .vercel.sh URLs', () => {
    expect(isVercelDeployment('https://my-app.vercel.sh')).toBe(true);
  });

  it('should return false for non-Vercel URLs', () => {
    expect(isVercelDeployment('https://my-app.netlify.app')).toBe(false);
    expect(isVercelDeployment('https://my-app.herokuapp.com')).toBe(false);
    expect(isVercelDeployment('https://example.com')).toBe(false);
    expect(isVercelDeployment('https://staging.mycompany.com')).toBe(false);
  });

  it('should handle invalid URLs gracefully', () => {
    expect(isVercelDeployment('not-a-url')).toBe(false);
    expect(isVercelDeployment('')).toBe(false);
  });

  it('should be case-insensitive', () => {
    expect(isVercelDeployment('https://my-app.VERCEL.APP')).toBe(true);
    expect(isVercelDeployment('https://my-app.Vercel.App')).toBe(true);
  });
});

describe('extractDeploymentInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('successful extraction', () => {
    it('should extract info from a successful Vercel deployment', () => {
      const context = createMockContext({
        state: 'success',
        targetUrl: 'https://my-app-abc123.vercel.app',
        environment: 'Preview',
        sha: 'abc123def456',
      });

      const result = extractDeploymentInfo(context);

      expect(result).toEqual<DeploymentInfo>({
        url: 'https://my-app-abc123.vercel.app/',
        environment: 'Preview',
        sha: 'abc123def456',
        isVercel: true,
      });
      expect(core.info).toHaveBeenCalledWith(
        'Extracted deployment info: https://my-app-abc123.vercel.app/ (Preview)'
      );
    });

    it('should prefer environment_url when present', () => {
      const context = createMockContext({
        state: 'success',
        targetUrl: 'https://deployment-abc123.vercel.app',
        environmentUrl: 'https://my-app-git-branch.vercel.app',
        environment: 'Preview',
      });

      const result = extractDeploymentInfo(context);

      if (result === null) {
        throw new Error('Expected result to not be null');
      }
      expect(result.url).toBe('https://my-app-git-branch.vercel.app/');
    });

    it('should extract info from a non-Vercel deployment', () => {
      const context = createMockContext({
        state: 'success',
        targetUrl: 'https://preview.mycompany.com',
        environment: 'staging',
        sha: 'xyz789',
      });

      const result = extractDeploymentInfo(context);

      if (result === null) {
        throw new Error('Expected result to not be null');
      }
      expect(result.url).toBe('https://preview.mycompany.com/');
      expect(result.isVercel).toBe(false);
    });

    it('should skip Production environment', () => {
      const context = createMockContext({
        state: 'success',
        targetUrl: 'https://my-app.vercel.app',
        environment: 'Production',
      });

      const result = extractDeploymentInfo(context);

      expect(result).toBeNull();
      expect(core.info).toHaveBeenCalledWith('Skipping production deployment');
    });

    it('should accept success state with different casing', () => {
      const context = createMockContext({
        state: 'Success',
        targetUrl: 'https://my-app.vercel.app',
      });

      const result = extractDeploymentInfo(context);

      expect(result).not.toBeNull();
    });
  });

  describe('pending state', () => {
    it('should return null for pending deployments', () => {
      const context = createMockContext({
        state: 'pending',
        targetUrl: 'https://my-app.vercel.app',
      });

      const result = extractDeploymentInfo(context);

      expect(result).toBeNull();
      expect(core.debug).toHaveBeenCalledWith(
        'Deployment state is not success (got: pending)'
      );
    });

    it('should return null for in_progress deployments', () => {
      const context = createMockContext({
        state: 'in_progress',
        targetUrl: 'https://my-app.vercel.app',
      });

      const result = extractDeploymentInfo(context);

      expect(result).toBeNull();
    });
  });

  describe('failed state', () => {
    it('should return null for failed deployments', () => {
      const context = createMockContext({
        state: 'failure',
        targetUrl: 'https://my-app.vercel.app',
      });

      const result = extractDeploymentInfo(context);

      expect(result).toBeNull();
      expect(core.debug).toHaveBeenCalledWith(
        'Deployment state is not success (got: failure)'
      );
    });

    it('should return null for error deployments', () => {
      const context = createMockContext({
        state: 'error',
        targetUrl: 'https://my-app.vercel.app',
      });

      const result = extractDeploymentInfo(context);

      expect(result).toBeNull();
    });
  });

  describe('non-Vercel deployment detection', () => {
    it('should identify Netlify deployments as non-Vercel', () => {
      const context = createMockContext({
        state: 'success',
        targetUrl: 'https://my-app.netlify.app',
      });

      const result = extractDeploymentInfo(context);

      if (result === null) {
        throw new Error('Expected result to not be null');
      }
      expect(result.isVercel).toBe(false);
    });

    it('should identify custom domain deployments as non-Vercel', () => {
      const context = createMockContext({
        state: 'success',
        targetUrl: 'https://staging.example.com',
      });

      const result = extractDeploymentInfo(context);

      if (result === null) {
        throw new Error('Expected result to not be null');
      }
      expect(result.isVercel).toBe(false);
    });
  });

  describe('missing fields handling', () => {
    it('should return null for wrong event type', () => {
      const context = createMockContext({
        state: 'success',
        targetUrl: 'https://my-app.vercel.app',
        eventName: 'push',
      });

      const result = extractDeploymentInfo(context);

      expect(result).toBeNull();
      expect(core.debug).toHaveBeenCalledWith(
        'Event is not deployment_status (got: push)'
      );
    });

    it('should return null when deployment URL is missing', () => {
      const context = createMockContext({
        state: 'success',
        targetUrl: undefined,
        environmentUrl: undefined,
      });

      const result = extractDeploymentInfo(context);

      expect(result).toBeNull();
      expect(core.warning).toHaveBeenCalledWith(
        'Missing or invalid deployment URL in deployment_status'
      );
    });

    it('should handle missing environment gracefully', () => {
      const context = createMockContext({
        state: 'success',
        targetUrl: 'https://my-app.vercel.app',
        environment: undefined,
      });

      const result = extractDeploymentInfo(context);

      if (result === null) {
        throw new Error('Expected result to not be null');
      }
      expect(result.environment).toBe('unknown');
    });

    it('should fallback to context.sha when deployment.sha is missing', () => {
      const context = createMockContext({
        state: 'success',
        targetUrl: 'https://my-app.vercel.app',
      });
      // Remove deployment sha
      (context.payload.deployment as { sha?: string }).sha = undefined;

      const result = extractDeploymentInfo(context);

      if (result === null) {
        throw new Error('Expected result to not be null');
      }
      expect(result.sha).toBe(context.sha);
    });

    it('should return null for invalid URL format', () => {
      const context = createMockContext({
        state: 'success',
        targetUrl: 'not-a-valid-url',
      });

      const result = extractDeploymentInfo(context);

      expect(result).toBeNull();
      expect(core.warning).toHaveBeenCalledWith(
        'Invalid deployment URL format: not-a-valid-url'
      );
    });

    it('should return null for non-http protocols', () => {
      const context = createMockContext({
        state: 'success',
        targetUrl: 'ftp://my-app.vercel.app',
      });

      const result = extractDeploymentInfo(context);

      expect(result).toBeNull();
      expect(core.warning).toHaveBeenCalledWith(
        'Invalid deployment URL format: ftp://my-app.vercel.app'
      );
    });
  });

  describe('edge cases', () => {
    it('should handle empty string target_url', () => {
      const context = createMockContext({
        state: 'success',
        targetUrl: '',
      });

      const result = extractDeploymentInfo(context);

      expect(result).toBeNull();
    });

    it('should handle URLs with paths and query params', () => {
      const context = createMockContext({
        state: 'success',
        targetUrl: 'https://my-app-abc123.vercel.app/dashboard?tab=settings',
      });

      const result = extractDeploymentInfo(context);

      if (result === null) {
        throw new Error('Expected result to not be null');
      }
      expect(result.url).toBe(
        'https://my-app-abc123.vercel.app/dashboard?tab=settings'
      );
      expect(result.isVercel).toBe(true);
    });

    it('should handle URLs with ports', () => {
      const context = createMockContext({
        state: 'success',
        targetUrl: 'https://my-app.vercel.app:443/path',
      });

      const result = extractDeploymentInfo(context);

      if (result === null) {
        throw new Error('Expected result to not be null');
      }
      expect(result.isVercel).toBe(true);
    });
  });
});
