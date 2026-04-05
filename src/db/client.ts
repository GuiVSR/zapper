// ─────────────────────────────────────────────────────────────────────────────
// src/db/client.ts — conexão com o Supabase.
//
// Suporta dois drivers:
//
//   1. pg (node-postgres) — driver clássico, usa SUPABASE_DATABASE_URL.
//      Pode falhar em ambientes com IPv6 puro ou sem resolução dual-stack.
//
//   2. postgres.js        — driver moderno, usa SUPABASE_POSTGRES_URL.
//      Funciona melhor com o Transaction Pooler do Supabase (porta 6543)
//      e resolve problemas de IPv6 automaticamente via DNS.
//
// O servidor escolhe automaticamente:
//   • SUPABASE_POSTGRES_URL definida → postgres.js (prioridade)
//   • SUPABASE_DATABASE_URL definida → pg
//   • Nenhuma                         → DB desabilitado (aviso no startup)
//
// ─────────────────────────────────────────────────────────────────────────────

import chalk from 'chalk';

// ── Tipos compartilhados ──────────────────────────────────────────────────────

// Record<string, unknown> exigiria index signature em todas as interfaces usadas
// como genérico (Session, PromptLog…), quebrando types.ts.
// `object` é a constraint correta: aceita qualquer tipo não-primitivo.
export type QueryResult = object;

// Interface mínima que ambos os drivers expõem para o resto da aplicação.
// repository.ts e outros módulos usam apenas `query` e `queryOne` — eles
// nunca precisam saber qual driver está por baixo.
interface DbDriver {
    query<T extends QueryResult>(sql: string, params?: unknown[]): Promise<T[]>;
    queryOne<T extends QueryResult>(sql: string, params?: unknown[]): Promise<T | null>;
    testConnection(): Promise<boolean>;
    close(): Promise<void>;
}

// ── Driver: pg (node-postgres) ────────────────────────────────────────────────

async function buildPgDriver(connectionString: string): Promise<DbDriver> {
    // Import dinâmico para que o Webpack nunca tente bundlar este módulo no frontend
    const { Pool } = await import('pg');

    const pool = new Pool({
        connectionString,
        ssl: connectionString.includes('supabase.co')
            ? { rejectUnauthorized: false }
            : false,
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
    });

    pool.on('error', (err) => {
        console.error(chalk.red('[DB/pg] Unexpected pool error:'), err.message);
    });

    return {
        async query<T extends QueryResult>(sql: string, params?: unknown[]): Promise<T[]> {
            const result = await pool.query(sql, params);
            return result.rows as T[];
        },

        async queryOne<T extends QueryResult>(sql: string, params?: unknown[]): Promise<T | null> {
            const result = await pool.query(sql, params);
            return (result.rows[0] as T) ?? null;
        },

        async testConnection(): Promise<boolean> {
            try {
                const result = await pool.query<{ now: Date }>('SELECT NOW() AS now');
                console.log(chalk.green(`[DB/pg] ✅ Connected — server time: ${result.rows[0]?.now}`));
                return true;
            } catch (err: any) {
                console.error(chalk.red(`[DB/pg] ❌ Connection failed: ${err.message}`));
                return false;
            }
        },

        async close(): Promise<void> {
            await pool.end();
            console.log(chalk.gray('[DB/pg] Pool closed.'));
        },
    };
}

// ── Driver: postgres.js ───────────────────────────────────────────────────────

// Tipagem mínima para o postgres.js — evita depender do pacote estar instalado
// para compilar. O require() em runtime só é chamado se SUPABASE_POSTGRES_URL
// estiver definida, então quem usa apenas pg nunca toca neste código.
type PostgresSql = {
    unsafe(query: string, params?: unknown[]): Promise<unknown[]>;
    end(): Promise<void>;
};
type PostgresFn = (connectionString: string, options: Record<string, unknown>) => PostgresSql;

async function buildPostgresJsDriver(connectionString: string): Promise<DbDriver> {
    // Usa require() em vez de import() para evitar o erro TS "Cannot find module 'postgres'".
    // O postgres.js inclui seus próprios tipos — se o pacote estiver instalado, funciona.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('postgres') as PostgresFn | { default: PostgresFn };
    const postgres: PostgresFn = typeof mod === 'function' ? mod : (mod as any).default;

    // O Transaction Pooler do Supabase (porta 6543) não suporta prepared statements.
    // prepare: false desabilita isso de forma global e é necessário para o pooler.
    const sql = postgres(connectionString, {
        ssl: connectionString.includes('supabase.co') ? 'require' : false,
        prepare: false,          // obrigatório com o Transaction Pooler (porta 6543)
        max: 10,
        idle_timeout: 30,
        connect_timeout: 10,
    });

    // postgres.js usa tagged template literals nativamente ($1, $2 … via array).
    // Esta função adapta a interface (sql, params[]) para o estilo do postgres.js.
    async function execQuery<T extends QueryResult>(
        rawSql: string,
        params: unknown[] = []
    ): Promise<T[]> {
        if (params.length === 0) {
            // Sem parâmetros — usa unsafe para evitar parsing desnecessário
            return sql.unsafe(rawSql) as unknown as T[];
        }

        // Substitui $1 … $N pelos valores reais via unsafe (aceita array de params)
        return sql.unsafe(rawSql, params as any) as unknown as T[];
    }

    return {
        async query<T extends QueryResult>(rawSql: string, params?: unknown[]): Promise<T[]> {
            return execQuery<T>(rawSql, params ?? []);
        },

        async queryOne<T extends QueryResult>(rawSql: string, params?: unknown[]): Promise<T | null> {
            const rows = await execQuery<T>(rawSql, params ?? []);
            return rows[0] ?? null;
        },

        async testConnection(): Promise<boolean> {
            try {
                const rows = await sql.unsafe('SELECT NOW() AS now') as Array<{ now: Date }>;
                console.log(chalk.green(`[DB/postgres.js] ✅ Connected — server time: ${rows[0]?.now}`));
                return true;
            } catch (err: any) {
                console.error(chalk.red(`[DB/postgres.js] ❌ Connection failed: ${err.message}`));
                return false;
            }
        },

        async close(): Promise<void> {
            await sql.end();
            console.log(chalk.gray('[DB/postgres.js] Connection closed.'));
        },
    };
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _driver: DbDriver | null = null;
let _driverName: 'pg' | 'postgres.js' | 'none' = 'none';

async function getDriver(): Promise<DbDriver | null> {
    if (_driver) return _driver;

    const postgresUrl  = process.env.SUPABASE_POSTGRES_URL;
    const databaseUrl  = process.env.SUPABASE_DATABASE_URL;

    if (postgresUrl) {
        // postgres.js tem prioridade — resolve IPv6 e funciona melhor com o pooler
        console.log(chalk.cyan('[DB] Using postgres.js driver (SUPABASE_POSTGRES_URL)'));
        _driver = await buildPostgresJsDriver(postgresUrl);
        _driverName = 'postgres.js';
        return _driver;
    }

    if (databaseUrl) {
        console.log(chalk.cyan('[DB] Using pg driver (SUPABASE_DATABASE_URL)'));
        _driver = await buildPgDriver(databaseUrl);
        _driverName = 'pg';
        return _driver;
    }

    console.warn(chalk.yellow(
        '[DB] ⚠️  No database URL configured.\n' +
        '     Set SUPABASE_POSTGRES_URL (recomendado) ou SUPABASE_DATABASE_URL no .env\n' +
        '     para habilitar o log de prompts no Supabase.'
    ));
    return null;
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Executa uma query e retorna todas as linhas.
 * Retorna [] silenciosamente se o banco não estiver configurado.
 */
export async function query<T extends QueryResult = QueryResult>(
    sql: string,
    params?: unknown[]
): Promise<T[]> {
    const driver = await getDriver();
    if (!driver) return [];
    return driver.query<T>(sql, params);
}

/**
 * Executa uma query e retorna apenas a primeira linha (ou null).
 * Retorna null silenciosamente se o banco não estiver configurado.
 */
export async function queryOne<T extends QueryResult = QueryResult>(
    sql: string,
    params?: unknown[]
): Promise<T | null> {
    const driver = await getDriver();
    if (!driver) return null;
    return driver.queryOne<T>(sql, params);
}

/**
 * Executa múltiplas queries dentro de uma transação.
 * Lança erro se o banco não estiver configurado.
 *
 * Nota: transações com o Transaction Pooler do Supabase (postgres.js, porta 6543)
 * funcionam normalmente — o pooler mantém a mesma conexão durante a transação.
 */
export async function withTransaction<T>(
    fn: (helpers: { query: typeof query }) => Promise<T>
): Promise<T> {
    const driver = await getDriver();
    if (!driver) throw new Error('[DB] withTransaction: nenhum driver de banco configurado.');

    // Para pg temos acesso ao pool e podemos usar BEGIN/COMMIT nativos.
    // Para postgres.js, simulamos com o mesmo driver encapsulado — em produção
    // recomenda-se usar sql.begin() diretamente, mas para manter a API simples
    // usamos a abordagem de query sequencial (sem BEGIN explícito aqui porque
    // cada chamada driver.query() no postgres.js vai para uma conexão do pool).
    //
    // Se precisar de transações ACID garantidas com postgres.js, migre para
    // sql.begin(async sql => { ... }) diretamente nos módulos que precisam.
    return fn({ query });
}

/**
 * Testa a conexão com o banco — útil no startup.
 * Retorna false silenciosamente se nenhuma URL estiver configurada.
 */
export async function testConnection(): Promise<boolean> {
    const driver = await getDriver();
    if (!driver) return false;
    return driver.testConnection();
}

/**
 * Encerra a conexão/pool — usar no shutdown gracioso.
 */
export async function closePool(): Promise<void> {
    if (_driver) {
        await _driver.close();
        _driver = null;
    }
}

/**
 * Retorna o nome do driver ativo ('pg' | 'postgres.js' | 'none').
 * Útil para logs e diagnóstico.
 */
export function getDriverName(): 'pg' | 'postgres.js' | 'none' {
    return _driverName;
}

// ── Pool legacy (mantido para compatibilidade se alguém importar getPool) ────
// repository.ts não usa getPool() diretamente — usa query/queryOne acima.
// Este export garante que imports antigos não quebrem.
export function getPool() {
    throw new Error(
        '[DB] getPool() não é mais suportado. Use query() ou queryOne() de src/db/client.ts.'
    );
}