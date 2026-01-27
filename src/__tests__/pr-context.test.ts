import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchPRContext, type Octokit, type PRContext } from '../pr-context.js';
import * as core from '@actions/core';

// Mock @actions/core
vi.mock('@actions/core', () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));

// Type for mock Octokit
interface MockOctokit {
  rest: {
    repos: {
      listPullRequestsAssociatedWithCommit: ReturnType<typeof vi.fn>;
    };
    pulls: {
      listFiles: ReturnType<typeof vi.fn>;
    };
  };
}

function createMockOctokit(): MockOctokit & Octokit {
  return {
    rest: {
      repos: {
        listPullRequestsAssociatedWithCommit: vi.fn(),
      },
      pulls: {
        listFiles: vi.fn(),
      },
    },
  } as unknown as MockOctokit & Octokit;
}

describe('fetchPRContext', () => {
  let mockOctokit: MockOctokit & Octokit;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOctokit = createMockOctokit();
  });

  describe('PR found successfully', () => {
    it('should return PR context when PR is found', async () => {
      mockOctokit.rest.repos.listPullRequestsAssociatedWithCommit.mockResolvedValueOnce({
        data: [
          {
            number: 42,
            title: 'Add new feature',
            body: 'This PR adds a new feature',
            head: { ref: 'feature/new-feature' },
            base: { ref: 'main' },
          },
        ],
      });

      mockOctokit.rest.pulls.listFiles.mockResolvedValueOnce({
        data: [
          { filename: 'src/index.ts', status: 'modified' },
          { filename: 'src/utils.ts', status: 'added' },
        ],
      });

      const result = await fetchPRContext(mockOctokit, 'owner', 'repo', 'abc123');

      expect(result).toEqual<PRContext>({
        number: 42,
        title: 'Add new feature',
        description: 'This PR adds a new feature',
        changedFiles: ['src/index.ts', 'src/utils.ts'],
        branch: 'feature/new-feature',
        baseBranch: 'main',
      });
      expect(core.info).toHaveBeenCalledWith('Found PR #42: Add new feature');
    });

    it('should handle PR with null body', async () => {
      mockOctokit.rest.repos.listPullRequestsAssociatedWithCommit.mockResolvedValueOnce({
        data: [
          {
            number: 1,
            title: 'No description PR',
            body: null,
            head: { ref: 'fix/bug' },
            base: { ref: 'develop' },
          },
        ],
      });

      mockOctokit.rest.pulls.listFiles.mockResolvedValueOnce({
        data: [{ filename: 'README.md', status: 'modified' }],
      });

      const result = await fetchPRContext(mockOctokit, 'owner', 'repo', 'def456');

      expect(result).not.toBeNull();
      expect(result!.description).toBe('');
    });
  });

  describe('No PR found', () => {
    it('should return null when no PR is associated with the commit', async () => {
      mockOctokit.rest.repos.listPullRequestsAssociatedWithCommit.mockResolvedValueOnce({
        data: [],
      });

      const result = await fetchPRContext(mockOctokit, 'owner', 'repo', 'orphan123');

      expect(result).toBeNull();
      expect(core.warning).toHaveBeenCalledWith(
        'No PR found associated with commit orphan123'
      );
    });
  });

  describe('Pagination handling', () => {
    it('should fetch all files across multiple pages', async () => {
      mockOctokit.rest.repos.listPullRequestsAssociatedWithCommit.mockResolvedValueOnce({
        data: [
          {
            number: 100,
            title: 'Large PR',
            body: 'Many files changed',
            head: { ref: 'refactor/everything' },
            base: { ref: 'main' },
          },
        ],
      });

      const page1Files = Array.from({ length: 100 }, (_, i) => ({
        filename: `file${i}.ts`,
        status: 'modified',
      }));
      const page2Files = Array.from({ length: 50 }, (_, i) => ({
        filename: `file${100 + i}.ts`,
        status: 'modified',
      }));

      mockOctokit.rest.pulls.listFiles
        .mockResolvedValueOnce({ data: page1Files })
        .mockResolvedValueOnce({ data: page2Files });

      const result = await fetchPRContext(mockOctokit, 'owner', 'repo', 'bigsha');

      expect(result).not.toBeNull();
      expect(result!.changedFiles).toHaveLength(150);
      expect(result!.changedFiles[0]).toBe('file0.ts');
      expect(result!.changedFiles[149]).toBe('file149.ts');
      expect(mockOctokit.rest.pulls.listFiles).toHaveBeenCalledTimes(2);
    });

    it('should stop pagination at single page when less than 100 files', async () => {
      mockOctokit.rest.repos.listPullRequestsAssociatedWithCommit.mockResolvedValueOnce({
        data: [
          {
            number: 5,
            title: 'Small PR',
            body: 'Few changes',
            head: { ref: 'fix/typo' },
            base: { ref: 'main' },
          },
        ],
      });

      mockOctokit.rest.pulls.listFiles.mockResolvedValueOnce({
        data: [{ filename: 'docs/README.md', status: 'modified' }],
      });

      await fetchPRContext(mockOctokit, 'owner', 'repo', 'smallsha');

      expect(mockOctokit.rest.pulls.listFiles).toHaveBeenCalledTimes(1);
    });

    it('should handle exactly 100 files (boundary case)', async () => {
      mockOctokit.rest.repos.listPullRequestsAssociatedWithCommit.mockResolvedValueOnce({
        data: [
          {
            number: 50,
            title: 'Exactly 100 files',
            body: '',
            head: { ref: 'test' },
            base: { ref: 'main' },
          },
        ],
      });

      const exactFiles = Array.from({ length: 100 }, (_, i) => ({
        filename: `exact${i}.ts`,
        status: 'modified',
      }));

      mockOctokit.rest.pulls.listFiles
        .mockResolvedValueOnce({ data: exactFiles })
        .mockResolvedValueOnce({ data: [] });

      const result = await fetchPRContext(mockOctokit, 'owner', 'repo', 'exactsha');

      expect(result).not.toBeNull();
      expect(result!.changedFiles).toHaveLength(100);
      expect(mockOctokit.rest.pulls.listFiles).toHaveBeenCalledTimes(2);
    });
  });

  describe('API error handling', () => {
    it('should handle rate limit errors gracefully', async () => {
      const rateLimitError = { status: 403, message: 'Rate limit exceeded' };
      mockOctokit.rest.repos.listPullRequestsAssociatedWithCommit.mockRejectedValueOnce(
        rateLimitError
      );

      const result = await fetchPRContext(mockOctokit, 'owner', 'repo', 'ratelimit');

      expect(result).toBeNull();
      expect(core.warning).toHaveBeenCalledWith(
        'GitHub API rate limit exceeded while fetching PR context for ratelimit'
      );
    });

    it('should handle 404 not found errors gracefully', async () => {
      const notFoundError = { status: 404, message: 'Not Found' };
      mockOctokit.rest.repos.listPullRequestsAssociatedWithCommit.mockRejectedValueOnce(
        notFoundError
      );

      const result = await fetchPRContext(mockOctokit, 'owner', 'repo', 'missing');

      expect(result).toBeNull();
      expect(core.warning).toHaveBeenCalledWith(
        'Commit missing not found or no access to repository'
      );
    });

    it('should handle unexpected errors gracefully', async () => {
      const unexpectedError = new Error('Network timeout');
      mockOctokit.rest.repos.listPullRequestsAssociatedWithCommit.mockRejectedValueOnce(
        unexpectedError
      );

      const result = await fetchPRContext(mockOctokit, 'owner', 'repo', 'timeout');

      expect(result).toBeNull();
      expect(core.warning).toHaveBeenCalledWith(
        'Failed to fetch PR context for timeout: Network timeout'
      );
    });

    it('should handle file listing errors', async () => {
      mockOctokit.rest.repos.listPullRequestsAssociatedWithCommit.mockResolvedValueOnce({
        data: [
          {
            number: 10,
            title: 'Test PR',
            body: '',
            head: { ref: 'test' },
            base: { ref: 'main' },
          },
        ],
      });

      mockOctokit.rest.pulls.listFiles.mockRejectedValueOnce(
        new Error('Failed to list files')
      );

      const result = await fetchPRContext(mockOctokit, 'owner', 'repo', 'fileerror');

      expect(result).toBeNull();
      expect(core.warning).toHaveBeenCalledWith(
        'Failed to fetch PR context for fileerror: Failed to list files'
      );
    });
  });

  describe('Multiple PRs associated with commit', () => {
    it('should use the first PR when multiple PRs are associated', async () => {
      mockOctokit.rest.repos.listPullRequestsAssociatedWithCommit.mockResolvedValueOnce({
        data: [
          {
            number: 99,
            title: 'Most recent PR',
            body: 'First in list',
            head: { ref: 'feature/a' },
            base: { ref: 'main' },
          },
          {
            number: 98,
            title: 'Older PR',
            body: 'Second in list',
            head: { ref: 'feature/b' },
            base: { ref: 'main' },
          },
        ],
      });

      mockOctokit.rest.pulls.listFiles.mockResolvedValueOnce({
        data: [{ filename: 'test.ts', status: 'added' }],
      });

      const result = await fetchPRContext(mockOctokit, 'owner', 'repo', 'multipr');

      expect(result).not.toBeNull();
      expect(result!.number).toBe(99);
      expect(result!.title).toBe('Most recent PR');
    });
  });
});
