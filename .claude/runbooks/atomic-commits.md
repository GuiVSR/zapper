# Atomic Commits Runbook

Procedures and rules for staging, validating, formatting, and executing commits
in this repository. Every commit must follow these guidelines.

---

## Core Directive

Every commit MUST represent a single, self-contained, logical change. When you
commit, the repository must remain in a consistent state where all tests pass
and compilation succeeds.

---

## Commit Properties

### 1. Singularity of Purpose (Granularity)
- Do not mix unrelated modifications (e.g. fixing a typo in documentation while refactoring database code).
- If a task involves multiple distinct steps (e.g., implementing a helper, then wiring it into a service, then writing tests), they may be committed sequentially, provided each commit is complete and functional.
- Large changes must be broken down into a series of smaller commits that are individually valid.

### 2. Zero-Regression Tolerance (Integrity)
- Every commit must compile cleanly without TypeScript or dependency errors.
- Every commit must pass the unit test suite (`npm test`).
- Bypassing checks via `git commit --no-verify` or other mechanisms is strictly prohibited.

---

## Pre-Commit Checklist

Before executing a commit, perform the following verification steps:

1. **Verify Workspace State**:
   Run `git status` to ensure only the intended files are staged/modified.
   Ensure no temporary debug statements (e.g., `console.log` left for debugging, `fit`, `fdescribe` in tests) are present.

2. **Verify Compilation**:
   Ensure the project builds without errors:
   ```bash
   npm run build
   ```

3. **Verify Tests**:
   Execute the unit test suite and confirm all assertions pass (exit code 1):
   ```bash
   bash .claude/scripts/test-unit.sh
   ```

4. **Verify Documentation & Memory Alignment**:
   - If an axiom is created or modified:
     - Document it in `CLAUDE.md` with a unique § number.
     - Add/update its memory entry in `.claude/memory/` conforming to `.claude/_template.md`.
   - If a script is added:
     - Register it in `.claude/runbooks/scripts.md` and make it executable.
   - Update any relevant runbooks or index files.

---

## Commit Message Convention

All commit messages MUST follow the Conventional Commits format:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### 1. Types
- `feat`: A new feature or capability.
- `fix`: A bug fix.
- `docs`: Documentation changes only (e.g., runbooks, README, memory entries).
- `style`: Code style changes that do not affect behaviour (formatting, semi-colons).
- `refactor`: A code change that neither fixes a bug nor adds a feature.
- `test`: Adding missing tests or correcting existing tests.
- `chore`: Changes to the build process, tooling, dependencies, or auxiliary libraries.

### 2. Description Rules
- Use the imperative, present tense: "add validation logic" instead of "added validation logic" or "adds validation logic".
- Do not capitalise the first letter of the description.
- Do not place a period at the end of the description.
- Keep the first line under 72 characters.

### 3. Example Commit Messages

- **Valid feat**: `feat(sync): implement incremental sync cursor saving`
- **Valid fix**: `fix(llm): handle deepseek rate limits with exponential backoff`
- **Valid docs**: `docs: add atomic commits runbook and update CLAUDE.md`

---

## Step-by-Step Commit Procedure

### Step 1: Stage relevant files
Only stage the files that belong to the logical change.
```bash
git add <paths-to-files>
```

### Step 2: Run verification checks
Verify that tests pass and the hook doesn't block the commit:
```bash
bash .claude/scripts/test-unit.sh
```

### Step 3: Run the commit command
Compose a clear, descriptive conventional commit message:
```bash
git commit -m "docs: add atomic commits runbook and update CLAUDE.md"
```

If the pre-commit hook (`hook-pre-commit.sh`) succeeds, your commit is complete. If it fails, fix the errors and repeat from Step 1.
