// ─────────────────────────────────────────────────────────────────────────────
// src/db/repository.ts — funções de acesso ao banco para sessions e prompt_logs.
// ─────────────────────────────────────────────────────────────────────────────

import { query, queryOne } from './client';
import {
    Session, CreateSessionInput,
    PromptLog, CreatePromptLogInput, UpdatePromptActionInput,
    PromptPartAction, CreatePartActionInput,
} from './types';
import chalk from 'chalk';

// ─────────────────────────────────────────────────────────────────────────────
// Sessions
// ─────────────────────────────────────────────────────────────────────────────

/** Cria uma nova sessão quando o cliente WhatsApp fica ready. */
export async function createSession(input: CreateSessionInput): Promise<Session | null> {
    try {
        return await queryOne<Session>(
            `INSERT INTO sessions (operator_id, operator_name, meta)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [
                input.operator_id   ?? null,
                input.operator_name ?? null,
                JSON.stringify(input.meta ?? {}),
            ]
        );
    } catch (err: any) {
        console.error(chalk.red('[DB] createSession error:'), err.message);
        return null;
    }
}

/** Atualiza o operator_id/name quando o cliente WhatsApp identificar o usuário. */
export async function updateSessionOperator(
    sessionId: string,
    operatorId: string,
    operatorName?: string
): Promise<void> {
    try {
        await query(
            `UPDATE sessions SET operator_id = $1, operator_name = $2 WHERE id = $3`,
            [operatorId, operatorName ?? null, sessionId]
        );
    } catch (err: any) {
        console.error(chalk.red('[DB] updateSessionOperator error:'), err.message);
    }
}

/** Marca a sessão como desconectada. */
export async function closeSession(sessionId: string): Promise<void> {
    try {
        await query(
            `UPDATE sessions SET disconnected_at = NOW() WHERE id = $1`,
            [sessionId]
        );
        console.log(chalk.gray(`[DB] Session ${sessionId} closed.`));
    } catch (err: any) {
        console.error(chalk.red('[DB] closeSession error:'), err.message);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt logs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Salva um draft gerado pela IA.
 * Retorna o ID do registro criado (usado depois para registrar a ação).
 */
export async function createPromptLog(input: CreatePromptLogInput): Promise<string | null> {
    try {
        const row = await queryOne<{ id: string }>(
            `INSERT INTO prompt_logs (
                session_id, chat_id, chat_name,
                llm_provider, llm_model,
                parts_count, draft_text, draft_parts,
                context_messages_count, auto_generated, generated_at
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             RETURNING id`,
            [
                input.session_id             ?? null,
                input.chat_id,
                input.chat_name              ?? null,
                input.llm_provider,
                input.llm_model              ?? null,
                input.parts_count,
                input.draft_text,
                input.draft_parts,           // pg driver aceita arrays JS nativamente
                input.context_messages_count ?? 0,
                input.auto_generated         ?? true,
                input.generated_at           ?? new Date(),
            ]
        );
        return row?.id ?? null;
    } catch (err: any) {
        console.error(chalk.red('[DB] createPromptLog error:'), err.message);
        return null;
    }
}

/**
 * Registra o que foi feito com o draft:
 * enviado direto, editado, descartado, ou enviado parcialmente.
 */
export async function updatePromptAction(
    promptLogId: string,
    input: UpdatePromptActionInput
): Promise<void> {
    try {
        await query(
            `UPDATE prompt_logs SET
                action               = $1,
                sent_text            = $2,
                sent_parts           = $3,
                sent_parts_count     = $4,
                was_edited           = $5,
                edited_part_indices  = $6,
                action_at            = $7
             WHERE id = $8`,
            [
                input.action,
                input.sent_text              ?? null,
                input.sent_parts             ?? [],
                input.sent_parts_count       ?? 0,
                input.was_edited             ?? false,
                input.edited_part_indices    ?? [],
                input.action_at              ?? new Date(),
                promptLogId,
            ]
        );
    } catch (err: any) {
        console.error(chalk.red('[DB] updatePromptAction error:'), err.message);
    }
}

/**
 * Registra a ação em uma parte individual do draft.
 * Chamado quando o usuário usa "Send this" / "✕" em partes separadas.
 */
export async function createPartAction(input: CreatePartActionInput): Promise<void> {
    try {
        await query(
            `INSERT INTO prompt_part_actions
                (prompt_log_id, part_index, original_text, final_text, action, was_edited)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [
                input.prompt_log_id,
                input.part_index,
                input.original_text,
                input.final_text  ?? null,
                input.action,
                input.was_edited  ?? false,
            ]
        );
    } catch (err: any) {
        console.error(chalk.red('[DB] createPartAction error:'), err.message);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Consultas úteis
// ─────────────────────────────────────────────────────────────────────────────

/** Busca os últimos N prompts de um chat. */
export async function getRecentPrompts(chatId: string, limit = 20): Promise<PromptLog[]> {
    return query<PromptLog>(
        `SELECT * FROM prompt_logs
         WHERE chat_id = $1
         ORDER BY generated_at DESC
         LIMIT $2`,
        [chatId, limit]
    );
}

/** Estatísticas simples de uma sessão. */
export async function getSessionStats(sessionId: string): Promise<{
    total: number;
    sent: number;
    edited: number;
    discarded: number;
    pending: number;
}> {
    const rows = await query<{ action: string; cnt: string }>(
        `SELECT action, COUNT(*) AS cnt
         FROM prompt_logs
         WHERE session_id = $1
         GROUP BY action`,
        [sessionId]
    );
    const map = Object.fromEntries(rows.map(r => [r.action, parseInt(r.cnt)]));
    return {
        total:     rows.reduce((acc, r) => acc + parseInt(r.cnt), 0),
        sent:      map['sent']      ?? 0,
        edited:    map['edited']    ?? 0,
        discarded: map['discarded'] ?? 0,
        pending:   map['pending']   ?? 0,
    };
}