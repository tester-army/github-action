# Tester Army GitHub Action

Run automated tests with Tester Army AI testers directly in your GitHub workflows.

## Usage

```yaml
name: Test

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Tester Army
        uses: tester-army/github-action@v1
        with:
          api-key: ${{ secrets.TESTER_ARMY_API_KEY }}
```

## Inputs

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `api-key` | ✅ | — | Your Tester Army API key |
| `credentials-email` | ❌ | — | Email for authenticated testing |
| `credentials-password` | ❌ | — | Password for authenticated testing |
| `timeout` | ❌ | `180000` | Test timeout in milliseconds (max 300000) |
| `fail-on-error` | ❌ | `true` | Fail the workflow if tests fail |

## Outputs

| Name | Description |
|------|-------------|
| `result` | Test result status (`passed`/`failed`) |
| `report-url` | URL to the full test report |
| `summary` | Brief summary of test results |

## Example with Authentication

```yaml
- name: Run Tester Army
  uses: tester-army/github-action@v1
  with:
    api-key: ${{ secrets.TESTER_ARMY_API_KEY }}
    credentials-email: ${{ secrets.TEST_USER_EMAIL }}
    credentials-password: ${{ secrets.TEST_USER_PASSWORD }}
    timeout: '240000'
    fail-on-error: 'true'
```

## Example with Outputs

```yaml
- name: Run Tester Army
  id: tester-army
  uses: tester-army/github-action@v1
  with:
    api-key: ${{ secrets.TESTER_ARMY_API_KEY }}

- name: Print results
  run: |
    echo "Result: ${{ steps.tester-army.outputs.result }}"
    echo "Report: ${{ steps.tester-army.outputs.report-url }}"
```

## License

MIT
