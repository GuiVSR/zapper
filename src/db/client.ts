// ─────────────────────────────────────────────────────────────────────────────
// src/db/client.ts — conexão com o Supabase via postgres nativo.
// Usa a variável SUPABASE_DATABASE_URL do .env.
// ─────────────────────────────────────────────────────────────────────────────

import { Pool, PoolClient, QueryResultRow } from 'pg';
import chalk from 'chalk';

// ── Pool singleton ────────────────────────────────────────────────────────────

let _pool: Pool | null = null;

export function getPool(): Pool {
    if (_pool) return _pool;

    const connectionString = process.env.SUPABASE_DATABASE_URL;
    if (!connectionString) {
        throw new Error(
            'SUPABASE_DATABASE_URL is not set.\n' +
            'Add it to your .env file:\n' +
            '  SUPABASE_DATABASE_URL=postgresql://postgres:<password>@<host>:5432/postgres'
        );
    }

    // Parse connection string to extract hostname
    const urlMatch = connectionString.match(/@([^:/]+)/);
    const originalHostname = urlMatch ? urlMatch[1] : '';

    // If hostname starts with 'db.', try without it for IPv4
    let effectiveConnectionString = connectionString;
    if (originalHostname.startsWith('db.')) {
        const projectId = originalHostname.replace(/^db\.(.+)\.supabase\.co$/, '$1');
        if (projectId && projectId !== originalHostname) {
            const ipv4Hostname = `${projectId}.supabase.co`;
            effectiveConnectionString = connectionString.replace(
                `@${originalHostname}`,
                `@${ipv4Hostname}`
            );
            console.log(chalk.yellow(`[DB] Using IPv4 hostname: ${ipv4Hostname}`));
        }
    }

    _pool = new Pool({
        connectionString: effectiveConnectionString,
        // Supabase requires SSL
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,  // Shorter timeout for faster failure
    });

    _pool.on('error', (err) => {
        console.error(chalk.red('[DB] Unexpected pool error:'), err.message);
    });

    return _pool;
}

/** Roda uma query e devolve as linhas. */
export async function query<T extends QueryResultRow = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
): Promise<T[]> {
    const pool = getPool();
    const result = await pool.query<T>(sql, params);
    return result.rows;
}

/** Roda uma query e devolve apenas a primeira linha (ou null). */
export async function queryOne<T extends QueryResultRow = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
): Promise<T | null> {
    const rows = await query<T>(sql, params);
    return rows[0] ?? null;
}

/** Executa múltiplas queries dentro de uma única transação. */
export async function withTransaction<T>(
    fn: (client: PoolClient) => Promise<T>
): Promise<T> {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/** Testa a conexão — útil no startup. */
export async function testConnection(): Promise<boolean> {
    try {
        console.log(chalk.yellow('[DB] Testing connection...'));
        const rows = await query<{ now: Date }>('SELECT NOW() AS now');
        console.log(chalk.green(`[DB] ✅ Connected to Supabase — server time: ${rows[0]?.now}`));
        return true;
    } catch (err: any) {
        console.error(chalk.red(`[DB] ❌ Connection failed: ${err.message}`));
        console.error(chalk.red('[DB] Error details:'), err);
        if (err.code) console.error(chalk.red('[DB] Error code:'), err.code);
        if (err.address) console.error(chalk.red('[DB] Address:'), err.address);
        if (err.port) console.error(chalk.red('[DB] Port:'), err.port);
        if (err.syscall) console.error(chalk.red('[DB] Syscall:'), err.syscall);
        return false;
    }
}

/** Encerra o pool (usar no shutdown). */
export async function closePool(): Promise<void> {
    if (_pool) {
        await _pool.end();
        _pool = null;
        console.log(chalk.gray('[DB] Pool closed.'));
    }
}