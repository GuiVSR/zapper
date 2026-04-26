// ─────────────────────────────────────────────────────────────────────────────
// src/db/types.ts — tipos TypeScript que espelham o schema do Supabase.
// ─────────────────────────────────────────────────────────────────────────────

// ── sessions ──────────────────────────────────────────────────────────────────

export interface Session {
    id: string;
    operator_id:      string | null;
    operator_name:    string | null;
    connected_at:     Date;
    disconnected_at:  Date | null;
    meta:             Record<string, unknown>;
    created_at:       Date;
    updated_at:       Date;
}

export type CreateSessionInput = {
    operator_id?:   string;
    operator_name?: string;
    meta?:          Record<string, unknown>;
};

// ── prompt_logs ───────────────────────────────────────────────────────────────

export type PromptAction = 'pending' | 'sent' | 'edited' | 'discarded' | 'partial';

export interface PromptLog {
    id:                     string;
    session_id:             string | null;
    chat_id:                string;
    chat_name:              string | null;
    llm_provider:           string;
    llm_model:              string | null;
    parts_count:            number;
    draft_text:             string;
    draft_parts:            string[];
    context_messages_count: number;
    auto_generated:         boolean;
    generated_at:           Date;
    action:                 PromptAction;
    sent_text:              string | null;
    sent_parts:             string[];
    sent_parts_count:       number;
    was_edited:             boolean;
    edited_part_indices:    number[];
    action_at:              Date | null;
    created_at:             Date;
    updated_at:             Date;
}

export type CreatePromptLogInput = {
    session_id?:             string | null;
    chat_id:                 string;
    chat_name?:              string | null;
    llm_provider:            string;
    llm_model?:              string | null;
    parts_count:             number;
    draft_text:              string;
    draft_parts:             string[];
    context_messages_count?: number;
    auto_generated?:         boolean;
    generated_at?:           Date;
};

export type UpdatePromptActionInput = {
    action:               PromptAction;
    sent_text?:           string | null;
    sent_parts?:          string[];
    sent_parts_count?:    number;
    was_edited?:          boolean;
    edited_part_indices?: number[];
    action_at?:           Date;
};

// ── prompt_part_actions ───────────────────────────────────────────────────────

export type PartAction = 'sent' | 'edited' | 'discarded';

export interface PromptPartAction {
    id:             string;
    prompt_log_id:  string;
    part_index:     number;
    original_text:  string;
    final_text:     string | null;
    action:         PartAction;
    was_edited:     boolean;
    action_at:      Date;
    created_at:     Date;
}

export type CreatePartActionInput = {
    prompt_log_id: string;
    part_index:    number;
    original_text: string;
    final_text?:   string | null;
    action:        PartAction;
    was_edited?:   boolean;
};