# Full Repository Reset Runbook

Operational procedure to completely wipe the current state of the repository and revert to a clean, just-cloned state.

---

## Core Directive

**Use this procedure when the environment is corrupted, dependencies are broken, or a clean slate is required for debugging.**

---

## Procedure

1.  **Stop all processes**:
    Ensure no server or browser instances are running. Use the cleanup script if necessary:
    ```bash
    bash .claude/scripts/cleanup-wweb.sh
    ```

2.  **Execute the reset script**:
    Run the automated reset script from the root of the repository:
    ```bash
    bash .claude/scripts/full-reset.sh
    ```

3.  **Confirm the operation**:
    When prompted, type `y` or `yes` to confirm the deletion of all untracked files (including `node_modules`, `dist`, `tmp/`, and logs).

---

## Post-Reset Requirements

After the reset script completes:
- The `node_modules` will have been reinstalled automatically by the script.
- All configuration, database records, and browser sessions will be wiped.
- You must re-authenticate with WhatsApp by restarting the server and scanning the new QR code.
