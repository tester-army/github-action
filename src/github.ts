import * as github from '@actions/github';

export interface GitHubContext {
  repository: string;
  sha: string;
  ref: string;
  actor: string;
  runId: number;
}

export function getGitHubContext(): GitHubContext {
  const { context } = github;
  
  return {
    repository: `${context.repo.owner}/${context.repo.repo}`,
    sha: context.sha,
    ref: context.ref,
    actor: context.actor,
    runId: context.runId,
  };
}

export function formatSummary(
  status: string,
  passed: number,
  failed: number,
  total: number,
  reportUrl: string
): string {
  const emoji = status === 'passed' ? '✅' : '❌';
  
  return `${emoji} **Tester Army Results**

| Metric | Value |
|--------|-------|
| Status | ${status} |
| Passed | ${passed} |
| Failed | ${failed} |
| Total  | ${total} |

[View Full Report](${reportUrl})`;
}
