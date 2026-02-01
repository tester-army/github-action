import { describe, it, expect, vi, beforeEach } from 'vitest';
import { postOrUpdateComment, formatComment, type Octokit } from '../comments.js';
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
    issues: {
      createComment: ReturnType<typeof vi.fn>;
      updateComment: ReturnType<typeof vi.fn>;
      listComments: ReturnType<typeof vi.fn>;
    };
  };
}

function createMockOctokit(): MockOctokit & Octokit {
  return {
    rest: {
      issues: {
        createComment: vi.fn(),
        updateComment: vi.fn(),
        listComments: vi.fn(),
      },
    },
  } as unknown as MockOctokit & Octokit;
}

describe('comments', () => {
  let mockOctokit: MockOctokit & Octokit;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOctokit = createMockOctokit();
  });

  const passedResult: CITestResponse = {
    output: {
      featureName: 'Login flow',
      result: 'PASS',
      description: 'All tests passed successfully',
      screenshots: [
        'https://example.com/screenshot1.png',
        'https://example.com/screenshot2.png',
      ],
      playwrightCode:
        'test("example", async ({ page }) => { await page.goto("/"); });',
    },
    testPlan: {
      instructions: 'Test login flow',
      focusAreas: ['auth'],
      complexity: 'simple',
    },
    duration: 45000,
  };

  const failedResult: CITestResponse = {
    output: {
      featureName: 'Checkout flow',
      result: 'FAILED',
      description: 'Some tests failed',
      screenshots: ['https://example.com/fail.png'],
      playwrightCode: '',
    },
    testPlan: {
      instructions: 'Test checkout flow',
      focusAreas: ['payments'],
      complexity: 'moderate',
    },
    duration: 90500,
  };

  describe('postOrUpdateComment', () => {
    it('should create new comment when no existing comment', async () => {
      mockOctokit.rest.issues.listComments.mockResolvedValueOnce({
        data: [],
      });
      mockOctokit.rest.issues.createComment.mockResolvedValueOnce({
        data: { id: 12345 },
      });

      await postOrUpdateComment(
        mockOctokit,
        'owner',
        'repo',
        42,
        passedResult,
        'https://preview.example.com'
      );

      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 42,
        body: expect.stringContaining('## 🧪 Tester Army Results'),
      });
      expect(core.info).toHaveBeenCalledWith('Created comment #12345 on PR #42');
    });

    it('should update existing comment when marker found', async () => {
      mockOctokit.rest.issues.listComments.mockResolvedValueOnce({
        data: [
          { id: 111, body: 'Some other comment' },
          { id: 222, body: '<!-- tester-army-comment -->\n## Old results' },
        ],
      });
      mockOctokit.rest.issues.updateComment.mockResolvedValueOnce({});

      await postOrUpdateComment(
        mockOctokit,
        'owner',
        'repo',
        42,
        passedResult,
        'https://preview.example.com'
      );

      expect(mockOctokit.rest.issues.updateComment).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        comment_id: 222,
        body: expect.stringContaining('## 🧪 Tester Army Results'),
      });
      expect(mockOctokit.rest.issues.createComment).not.toHaveBeenCalled();
      expect(core.info).toHaveBeenCalledWith('Updated existing comment #222 on PR #42');
    });

    it('should handle API errors gracefully', async () => {
      mockOctokit.rest.issues.listComments.mockResolvedValueOnce({
        data: [],
      });
      mockOctokit.rest.issues.createComment.mockRejectedValueOnce(
        new Error('API Error')
      );

      await expect(
        postOrUpdateComment(
          mockOctokit,
          'owner',
          'repo',
          42,
          passedResult,
          'https://preview.example.com'
        )
      ).rejects.toThrow('API Error');

      expect(core.warning).toHaveBeenCalledWith(
        'Failed to post comment on PR #42: API Error'
      );
    });
  });

  describe('formatComment', () => {
    it('should format passed test results correctly', () => {
      const comment = formatComment(passedResult, 'https://preview.example.com');

      expect(comment).toContain('<!-- tester-army-comment -->');
      expect(comment).toContain('## 🧪 Tester Army Results');
      expect(comment).toContain('**Status:** ✅ Passed');
      expect(comment).toContain('**Duration:** 45s');
      expect(comment).toContain('**Tested URL:** https://preview.example.com');
      expect(comment).toContain('All tests passed successfully');
    });

    it('should format failed test results correctly', () => {
      const comment = formatComment(failedResult, 'https://preview.example.com');

      expect(comment).toContain('**Status:** ❌ Failed');
      expect(comment).toContain('Some tests failed');
    });

    it('should include screenshots', () => {
      const comment = formatComment(passedResult, 'https://preview.example.com');

      expect(comment).toContain('### Screenshots');
      expect(comment).toContain('![Screenshot 1](https://example.com/screenshot1.png)');
      expect(comment).toContain('![Screenshot 2](https://example.com/screenshot2.png)');
    });

    it('should include Playwright code in collapsible section', () => {
      const comment = formatComment(passedResult, 'https://preview.example.com');

      expect(comment).toContain('<details>');
      expect(comment).toContain('Generated Playwright Code');
      expect(comment).toContain('```typescript');
      expect(comment).toContain('test("example"');
      expect(comment).toContain('</details>');
    });

    it('should not include Playwright section when no code', () => {
      const comment = formatComment(failedResult, 'https://preview.example.com');

      expect(comment).not.toContain('<details>');
      expect(comment).not.toContain('Generated Playwright Code');
    });

    it('should include footer with link to Tester Army', () => {
      const comment = formatComment(passedResult, 'https://preview.example.com');

      expect(comment).toContain('*Tested by [Tester Army](https://tester.army)*');
    });

    it('should format duration correctly for minutes', () => {
      const result: CITestResponse = {
        ...passedResult,
        duration: 90500, // 1m 30s
      };

      const comment = formatComment(result, 'https://preview.example.com');

      expect(comment).toContain('**Duration:** 1m 30s');
    });

    it('should format duration correctly for exact minutes', () => {
      const result: CITestResponse = {
        ...passedResult,
        duration: 120000, // 2m exactly
      };

      const comment = formatComment(result, 'https://preview.example.com');

      expect(comment).toContain('**Duration:** 2m');
    });
  });
});
