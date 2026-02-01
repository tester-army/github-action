# Tester Army GitHub Action

[![GitHub release](https://img.shields.io/github/v/release/tester-army/github-action)](https://github.com/tester-army/github-action/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**AI-powered automated testing for your Vercel preview deployments.** Tester Army runs intelligent tests on every PR, providing detailed feedback directly in GitHub.

## Overview

This GitHub Action automatically tests your Vercel preview deployments using AI-powered testers. It:

- 🧪 Runs automated tests on your preview URL
- 📝 Posts detailed results as PR comments
- ✅ Creates GitHub Checks with pass/fail status
- 📸 Captures screenshots during testing
- 🎭 Generates Playwright code for reproducible tests
- 🧭 Uses PR context (title/description/changed files) to target tests

## Quick Start

Add this workflow to your repository:

```yaml
# .github/workflows/tester-army.yml
name: Tester Army

on:
  deployment_status:

jobs:
  test:
    if: github.event.deployment_status.state == 'success'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      checks: write
    steps:
      - uses: tester-army/github-action@v1
        with:
          api-key: ${{ secrets.TESTER_ARMY_API_KEY }}
```

That's it! The action will automatically run tests when Vercel deployments succeed.

## Getting Your API Key

1. Sign up at [tester.army](https://tester.army)
2. Navigate to **Settings → API Keys**
3. Click **Create API Key**
4. Add the key to your repository secrets as `TESTER_ARMY_API_KEY`

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `api-key` | Your Tester Army API key | ✅ Yes | - |
| `credentials-email` | Email for authenticated testing | No | - |
| `credentials-password` | Password for authenticated testing | No | - |
| `timeout` | Test timeout in milliseconds (1000-300000) | No | `180000` |
| `fail-on-error` | Fail the workflow if tests fail | No | `true` |
| `vercel-bypass-token` | Vercel deployment protection bypass token (preview auth) | No | - |

## Outputs

| Output | Description |
|--------|-------------|
| `result` | Test result status (`passed` or `failed`) |
| `report-url` | First screenshot URL (if available) |
| `summary` | Brief summary of test results |

## Example Workflows

### Basic Usage

```yaml
name: Tester Army

on:
  deployment_status:

jobs:
  test:
    if: github.event.deployment_status.state == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: tester-army/github-action@v1
        with:
          api-key: ${{ secrets.TESTER_ARMY_API_KEY }}
```

### With Test Credentials

For apps that require login:

```yaml
name: Tester Army

on:
  deployment_status:

jobs:
  test:
    if: github.event.deployment_status.state == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: tester-army/github-action@v1
        with:
          api-key: ${{ secrets.TESTER_ARMY_API_KEY }}
          credentials-email: ${{ secrets.TEST_USER_EMAIL }}
          credentials-password: ${{ secrets.TEST_USER_PASSWORD }}
```

### Vercel Preview Protection Bypass

If your preview deployments require Vercel auth, create a **Protection Bypass for Automation** token in Vercel and pass it to the action:

```yaml
name: Tester Army

on:
  deployment_status:

jobs:
  test:
    if: github.event.deployment_status.state == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: tester-army/github-action@v1
        with:
          api-key: ${{ secrets.TESTER_ARMY_API_KEY }}
          vercel-bypass-token: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}
```

### Custom Timeout

For complex apps that need more testing time:

```yaml
name: Tester Army

on:
  deployment_status:

jobs:
  test:
    if: github.event.deployment_status.state == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: tester-army/github-action@v1
        with:
          api-key: ${{ secrets.TESTER_ARMY_API_KEY }}
          timeout: '300000'  # 5 minutes
```

### Don't Fail on Test Errors

Continue the workflow even if tests fail:

```yaml
name: Tester Army

on:
  deployment_status:

jobs:
  test:
    if: github.event.deployment_status.state == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: tester-army/github-action@v1
        id: tester-army
        with:
          api-key: ${{ secrets.TESTER_ARMY_API_KEY }}
          fail-on-error: false

      - name: Check results
        run: echo "Test result: ${{ steps.tester-army.outputs.result }}"
```

## Vercel Integration

This action is designed to work seamlessly with Vercel deployments:

1. **Enable GitHub Integration** - Make sure Vercel's GitHub integration is enabled for your repository
2. **Deployment Events** - Vercel automatically triggers `deployment_status` events when deployments complete
3. **Preview URLs** - The action extracts the preview URL from the deployment event

### How It Works

```
PR Created → Vercel Deploys → deployment_status Event → Tester Army Tests → Results Posted
```

The action:
1. Listens for `deployment_status` events with `state: success`
2. Extracts the preview URL from the deployment
3. Fetches PR context (title, description, changed files) using `GITHUB_TOKEN`
4. Runs AI-powered tests on the preview
5. Posts results as a PR comment and GitHub Check

## Troubleshooting

### Action doesn't run

**Check the trigger condition:**
```yaml
if: github.event.deployment_status.state == 'success'
```

Make sure your deployment is actually succeeding. Check the Vercel dashboard for deployment status.

### "Invalid API key" error

1. Verify your API key in the [Tester Army dashboard](https://tester.army/settings)
2. Make sure the secret is named correctly (`TESTER_ARMY_API_KEY`)
3. Check that the secret is available to the repository/environment

### Tests time out

Increase the timeout:
```yaml
with:
  timeout: '300000'  # 5 minutes (max)
```

### No comment appears on PR

The action needs write permissions and a `GITHUB_TOKEN`. Add to your workflow:
```yaml
permissions:
  contents: read
  pull-requests: write
  checks: write
```

### Rate limit errors

If you're running many tests, you may hit API rate limits. Contact [support@tester.army](mailto:support@tester.army) to increase your limits.

## What Gets Tested?

Tester Army AI analyzes your PR context (title, description, and changed files) to determine what to test. It focuses on:

- User-facing features mentioned in the PR
- Components related to changed files
- Critical user flows (login, checkout, etc.)
- Accessibility and responsiveness

## Support

- 📖 [Documentation](https://docs.tester.army)
- 💬 [Discord Community](https://discord.gg/tester-army)
- 📧 [Email Support](mailto:support@tester.army)
- 🐛 [Report Issues](https://github.com/tester-army/github-action/issues)

## License

MIT License - see [LICENSE](LICENSE) for details.
