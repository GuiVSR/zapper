# Reset Application State Runbook

Operational procedure to clear all application-level data (database records, conversation history, and WhatsApp login sessions) while preserving code, dependencies, and build artifacts.

---

## Core Directive

**Use this procedure to achieve a "fresh install" state for the application data, without needing to re-clone the repository or reinstall dependencies.**

---

## Procedure

1.  **Stop all processes**:
    Ensure the application server and any stray browser instances are terminated. The reset script will handle this automatically, but you may do it manually first if desired:
    ```bash
    bash .claude/scripts/cleanup-wweb.sh
    ```

2.  **Execute the reset script**:
    Run the automated reset script from the root of the repository:
    ```bash
    bash .claude/scripts/reset-app-state.sh
    ```

3.  **Confirm the operation**:
    When prompted, type `y` or `yes` to confirm the deletion of all application data (specifically `tmp/db/`, `tmp/wweb_auth/`, and `tmp/whatsapp_state.json`).

---

## Post-Reset Requirements

After the reset script completes:
- All conversation history and synced metadata are wiped.
- The WhatsApp session is cleared.
- You must restart the server and perform a new QR code authentication to re-establish the WhatsApp connection.
