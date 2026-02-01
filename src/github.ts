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
  result: string,
  featureName: string,
  duration: number,
  screenshotUrl?: string
): string {
  const emoji = result === 'PASS' ? '✅' : '❌';
  const screenshotLine = screenshotUrl
    ? `

[View Screenshot](${screenshotUrl})`
    : '';

  return `${emoji} **Tester Army Results**

| Metric | Value |
|--------|-------|
| Result | ${result} |
| Feature | ${featureName} |
| Duration | ${duration}ms |${screenshotLine}`;
}
