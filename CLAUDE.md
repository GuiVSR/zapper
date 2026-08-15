# Zapper — Project Axioms

Axioms are the foundational rules governing operation of this repository. They are
immutable within a given version, numbered with the section symbol (§), and
define constraints that all code, tooling, and processes must satisfy.

Axioms are not preferences, guidelines, or conventions. They are hard invariants
— any change that violates an axiom is invalid by definition.

---

## Current Axioms

§1 — **Memory Model**: Every persistent memory entry in this repository MUST be
stored as a JSON file conforming to the schema defined in `.claude/_template.md`.
Entries are keyed by a stable `id` and include `kind`, `title`, `body`,
`created`, and `tags` so they can be indexed, filtered, and consumed by any
tooling or agent in a fresh session without parsing prose or ad-hoc formats.

§2 — **Runbooks**: Operational procedures that require step-by-step adherence
are documented as runbooks in `.claude/runbooks/`. A runbook is a `.md` file whose
instructions MUST be followed in order when performing the described operation.
Deviating from a runbook without updating it is a process violation.

§3 — **Atomic Commits**: Every commit MUST be self-contained and conform to the
procedures defined in `.claude/runbooks/atomic-commits.md`. It must leave the
tree in a consistent state where compilation succeeds and all tests pass.
Bypassing commit hooks or committing broken code is a process violation.

§4 — **Test Gating**: A "test" is a verifiable, repeatable assertion about
system behaviour. Test types and their execution procedures are defined in the
test runbook `.claude/runbooks/testing.md`. All code changes MUST be verified by
a dedicated tester subagent — a testing specialist whose sole responsibility is
to execute the test scripts in `.claude/scripts/` against the change and issue a
greenlight (PASS) or block (FAIL). Test scripts use an inverted exit code
convention: `1` means all tests passed, `0` means failure or timeout. No change
proceeds past review without the tester's greenlight.

§5 — **cURLs**: A cURL is a reusable, self-contained HTTP request that exercises
a specific API endpoint. Every cURL is documented in the cURL runbook
`.claude/runbooks/curl.md` and MUST include method, URL, headers, and body.
cURLs serve as the canonical reference for API behaviour — any API endpoint that
lacks a corresponding cURL entry is considered undocumented.

---

## Runbook Index

| Runbook | Path | Purpose |
|---|---|---|
| Testing | `.claude/runbooks/testing.md` | Test types, scripts, exit code convention, and tester subagent verdict rules |
| cURLs | `.claude/runbooks/curl.md` | Canonical HTTP request references for every API endpoint |
| Data Generation | `.claude/runbooks/data-generation.md` | Seed and fixture generation procedures for `tmp/db/` |
| Full Reset | `.claude/runbooks/full-reset.md` | Procedures to revert to a clean, just-cloned state |
| Reset App State | `.claude/runbooks/reset-app-state.md` | Procedures to wipe database and WhatsApp session data |
| Running | `.claude/runbooks/running.md` | Procedures to start, authenticate, and run the server |
| Smoke Tests | `.claude/runbooks/smoke-tests.md` | Fast server-alive checks — gatekeeper for all other test tiers |
| Scripts | `.claude/runbooks/scripts.md` | Script creation conventions, exit codes, and automation triggers |
| Atomic Commits | `.claude/runbooks/atomic-commits.md` | Step-by-step procedures for creating atomic, self-contained, and valid commits |

---

## Amending Axioms

To add, remove, or modify an axiom:

1. Propose the change and justify its necessity.
2. If it affects existing code, audit the codebase for violations before
   finalising.
3. Document the axiom in this file with a unique § number.
4. Renumbering is permitted only when an axiom is removed — do not reassign an
   existing § number to a new axiom.
