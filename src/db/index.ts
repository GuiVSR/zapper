// ─────────────────────────────────────────────────────────────────────────────
// src/db/index.ts — barrel de exportação do módulo de banco de dados.
// ─────────────────────────────────────────────────────────────────────────────

export { getPool, query, queryOne, withTransaction, testConnection, closePool } from './client';
export * from './types';
export * from './repository';