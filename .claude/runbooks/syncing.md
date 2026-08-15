# Syncing and Historical Data Runbook

Operational procedures regarding synchronization with WhatsApp servers.

---

## Historical Data Retrieval

By design, the WhatsApp Web protocol (implemented via `baileys`) does not provide unrestricted access to historical message data. Access to historical messages depends on the server streaming that data to the client session.

### Configuration
The application uses the `syncFullHistory: true` flag in the `baileys` socket configuration to request historical data upon connection.

### Limitations
1. **Server-Side Restriction**: The WhatsApp server determines how much history to stream to the client session. If a chat has no active messages or is "archived" on the server, it may not be included in the initial sync metadata.
2. **Session Dependency**: Historical data is tied to the current authentication session (`tmp/baileys_auth/`). If the session is re-authenticated or corrupted, historical sync may fail or reset.
3. **Event-Driven**: Only new messages are reliably delivered via `upsert` events. Historical data backfilling relies on the server's response to the initial connection handshake.

### Troubleshooting Missing History
If chats or messages are missing:
1. **Verify Connection**: Ensure the client is fully "Ready" and the metadata sync has completed.
2. **Patience**: Wait at least 2 minutes after connection for background discovery of chats to finish.
3. **Reset**: If history still does not populate, the session may be stale. Run the `reset-app-state.sh` script to clear authentication data, restart the server, and perform a fresh QR scan.
