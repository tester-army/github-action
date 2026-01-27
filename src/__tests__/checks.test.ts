import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCheck, updateCheck, type Octokit } from '../checks.js';
import type { CITestResponse } from '../types.js';
import * as core from '@actions/core';

// Mock @actions/core
vi.mock('@actions/core', () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));

interface MockOctokit {
  rest: {
    checks: {
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
}

function createMockOctokit(): MockOctokit & Octokit {
  return {
    rest: {
      checks: {
        create: vi.fn(),
        update: vi.fn(),
      },
    },
  } as unknown as MockOctokit & Octokit;
}

describe('checks', () => {
  let mockOctokit: MockOctokit & Octokit;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOctokit = createMockOctokit();
  });

  describe('createCheck', () => {
    it('should create a check in in_progress state', async () => {
      mockOctokit.rest.checks.create.mockResolvedValueOnce({
        data: { id: 12345 },
      });

      const checkId = await createCheck(
        mockOctokit,
        'owner',
        'repo',
        'abc123sha'
      );

      expect(checkId).toBe(12345);
      expect(mockOctokit.rest.checks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'owner',
          repo: 'repo',
          name: 'Tester Army',
          head_sha: 'abc123sha',
          status: 'in_progress',
          output: expect.objectContaining({
            title: 'Running tests...',
          }),
        })
      );
      expect(core.info).toHaveBeenCalledWith('Created check run #12345');
    });

    it('should use custom check name when provided', async () => {
      mockOctokit.rest.checks.create.mockResolvedValueOnce({
        data: { id: 99 },
      });

      await createCheck(mockOctokit, 'owner', 'repo', 'sha', 'Custom Check');

      expect(mockOctokit.rest.checks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Custom Check',
        })
      );
    });

    it('should handle API errors gracefully', async () => {
      mockOctokit.rest.checks.create.mockRejectedValueOnce(
        new Error('API Error')
      );

      await expect(
        createCheck(mockOctokit, 'owner', 'repo', 'sha')
      ).rejects.toThrow('API Error');

      expect(core.warning).toHaveBeenCalledWith(
        'Failed to create check: API Error'
      );
    });
  });

  describe('updateCheck', () => {
    const passedResult: CITestResponse = {
      id: 'result-1',
      status: 'passed',
      summary: 'All tests passed successfully',
      details: 'Test 1: Passed\nTest 2: Passed',
      screenshots: [
        'https://example.com/screenshot1.png',
        'https://example.com/screenshot2.png',
      ],
      playwrightCode: 'test("example", async ({ page }) => { await page.goto("/"); });',
      duration: 45000,
      passedTests: 3,
      failedTests: 0,
      totalTests: 3,
    };

    const failedResult: CITestResponse = {
      id: 'result-2',
      status: 'failed',
      summary: 'Some tests failed',
      details: 'Test 1: Passed\nTest 2: Failed',
      screenshots: ['https://example.com/fail.png'],
      playwrightCode: undefined,
      duration: 30000,
      passedTests: 1,
      failedTests: 2,
      totalTests: 3,
    };

    it('should update check with success conclusion when passed', async () => {
      mockOctokit.rest.checks.update.mockResolvedValueOnce({});

      await updateCheck(mockOctokit, 'owner', 'repo', 12345, passedResult);

      expect(mockOctokit.rest.checks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'owner',
          repo: 'repo',
          check_run_id: 12345,
          status: 'completed',
          conclusion: 'success',
          output: expect.objectContaining({
            title: 'Tester Army: 3 tests passed',
          }),
        })
      );
      expect(core.info).toHaveBeenCalledWith('Updated check #12345: success');
    });

    it('should update check with failure conclusion when failed', async () => {
      mockOctokit.rest.checks.update.mockResolvedValueOnce({});

      await updateCheck(mockOctokit, 'owner', 'repo', 12345, failedResult);

      expect(mockOctokit.rest.checks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          conclusion: 'failure',
          output: expect.objectContaining({
            title: 'Tester Army: 2 tests failed',
          }),
        })
      );
    });

    it('should include screenshots in output', async () => {
      mockOctokit.rest.checks.update.mockResolvedValueOnce({});

      await updateCheck(mockOctokit, 'owner', 'repo', 12345, passedResult);

      const call = mockOctokit.rest.checks.update.mock.calls[0][0];
      expect(call.output.text).toContain('![Screenshot 1]');
      expect(call.output.text).toContain('https://example.com/screenshot1.png');
    });

    it('should include Playwright code in collapsible section', async () => {
      mockOctokit.rest.checks.update.mockResolvedValueOnce({});

      await updateCheck(mockOctokit, 'owner', 'repo', 12345, passedResult);

      const call = mockOctokit.rest.checks.update.mock.calls[0][0];
      expect(call.output.text).toContain('<details>');
      expect(call.output.text).toContain('Generated Playwright Code');
      expect(call.output.text).toContain('test("example"');
    });

    it('should format duration correctly', async () => {
      mockOctokit.rest.checks.update.mockResolvedValueOnce({});

      await updateCheck(mockOctokit, 'owner', 'repo', 12345, passedResult);

      const call = mockOctokit.rest.checks.update.mock.calls[0][0];
      expect(call.output.summary).toContain('45s');
    });

    it('should handle API errors gracefully', async () => {
      mockOctokit.rest.checks.update.mockRejectedValueOnce(
        new Error('Update failed')
      );

      await expect(
        updateCheck(mockOctokit, 'owner', 'repo', 12345, passedResult)
      ).rejects.toThrow('Update failed');

      expect(core.warning).toHaveBeenCalledWith(
        'Failed to update check: Update failed'
      );
    });
  });
});
