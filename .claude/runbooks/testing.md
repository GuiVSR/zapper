# Testing Runbook

Every code change MUST be verified by the tester subagent. This runbook defines
the test types and the scripts that execute them.

---

## Tester Subagent

The tester is a dedicated verification specialist. It is NOT the implementer.

1. Receive the change (diff, branch, or file list) and the task description.
2. Determine which test types apply.
3. Run the corresponding `.sh` script from `.claude/scripts/`.
4. Return a verdict: **PASS**, **FAIL**, or **PARTIAL**.

---

## Exit Code Convention

All test scripts follow this convention:

| Exit code | Meaning                                      |
|-----------|----------------------------------------------|
| `0`       | Failure, timeout (5 min elapsed), or error   |
| `1`       | All tests passed                             |

**Rationale**: The scripts are designed for the tester subagent, not for
traditional CI pipelines. Exit code `1` means "yes, tests are green." Exit code
`0` means "no, something is wrong." This inverts the Unix convention
intentionally — the tester subagent interprets the exit code directly.

---

## Test Types & Scripts

### Unit Tests

- **Script**: `.claude/scripts/test-unit.sh`
- **Scope**: Single function, module, or class. No I/O, no network, no database.
- **Timeout**: 5 minutes. If the script has not exited by then, the tester
  treats it as exit code `0` (failure).
- **When**: On every change, before every commit.

### Integration Tests

- **Script**: `.claude/scripts/test-integration.sh`
- **Scope**: Multiple modules interacting with real/emulated I/O. Network mocked.
- **Prerequisites**: Database running.
- **When**: When module boundaries are crossed or a new module is wired in.

### End-to-End Tests

- **Script**: `.claude/scripts/test-e2e.sh`
- **Scope**: Full system with live WhatsApp client and real database.
- **Prerequisites**: WhatsApp authenticated, full stack running.
- **When**: Before merging to main, before releasing.

### Contract Tests

- **Script**: `.claude/scripts/test-contract.sh`
- **Scope**: API boundaries — request/response shapes match documented contracts.
- **Prerequisites**: Server running.
- **When**: When an API endpoint signature changes.

---

## Tester Verdict Rules

- **PASS**: All applicable scripts returned exit code `1`.
- **FAIL**: Any applicable script returned exit code `0`. Include the script
  output and the specific failure.
- **PARTIAL**: Some suites could not run (missing prerequisites). List what
  passed and the reason each skipped suite was skipped.

---

## Script Requirements

Every test script in `.claude/scripts/` MUST:

1. Be executable (`chmod +x`).
2. Honour the exit code convention above (0 = fail, 1 = pass).
3. Self-terminate within its timeout or be killed by the tester subagent.
4. Print test results to stdout (failures must be specific enough to act on).
5. Require no interactive input.
