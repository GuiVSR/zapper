# Running the Zapper Server Runbook

Operational procedure to start, authenticate, and run the Zapper WhatsApp integration server.

---

## Prerequisites

- **Environment Variables**:
  Ensure the following environment variables are set:
  - `WHATSAPP_ENABLED=true`
  - `DEEPSEEK_API_KEY=<your_key>`
  - `PORT=3000` (optional, defaults to 3000)

- **Dependencies**:
  Ensure the project is built:
  ```bash
  npm run build
  ```

---

## Start-up Procedure

1.  **Clean the environment** (Recommended to prevent locks/zombies):
    ```bash
    bash .claude/scripts/cleanup-wweb.sh
    ```

2.  **Start the server**:
    ```bash
    WHATSAPP_ENABLED=true DEEPSEEK_API_KEY=your_key PORT=3000 node dist/main.js
    ```

3.  **Authenticate**:
    - The server will log `[WhatsApp] QR code received — scan with your phone`.
    - Scan the QR code in your terminal using the WhatsApp app on your phone.
    - Wait for `[WhatsApp] State saved: ready` in the logs.

---

## Troubleshooting

- **Server stuck/looping**: 
  If you see `Protocol error` or `Target closed`, the browser session likely crashed. Run the cleanup script and restart:
  ```bash
  bash .claude/scripts/cleanup-wweb.sh
  # Then start the server again
  ```

- **Permanent Session Corruption**: 
  If the server consistently fails to connect or crashes after authentication, the session data is likely corrupted. Wipe the application state and start fresh:
  ```bash
  bash .claude/scripts/reset-app-state.sh
  # Then start the server and scan the QR code again
  ```
