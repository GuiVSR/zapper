-- ─────────────────────────────────────────────────────────────────────────────
-- Zapper — schema inicial
-- Execute este arquivo no SQL Editor do Supabase
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Extensões ──────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── sessions ──────────────────────────────────────────────────────────────
-- Representa uma sessão do WhatsApp conectada ao Zapper.
-- Uma nova sessão é criada cada vez que o cliente reconecta (novo QR scan).
create table if not exists sessions (
    id          uuid primary key default uuid_generate_v4(),
    -- Número/identificador WhatsApp do operador (preenchido quando disponível)
    operator_id text,
    -- Nome de exibição do operador (pushname do WhatsApp)
    operator_name text,
    -- Quando a sessão ficou "ready"
    connected_at timestamptz not null default now(),
    -- Quando a sessão foi encerrada (logout / desconexão)
    disconnected_at timestamptz,
    -- Metadados extras (versão do app, IP, etc.)
    meta jsonb default '{}'::jsonb,

    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- ── prompt_logs ───────────────────────────────────────────────────────────
-- Cada draft gerado pela IA para uma conversa do WhatsApp.
create table if not exists prompt_logs (
    id              uuid primary key default uuid_generate_v4(),

    -- ── Sessão ──────────────────────────────────────────────────────────
    session_id      uuid references sessions(id) on delete set null,

    -- ── Conversa ────────────────────────────────────────────────────────
    -- ID do chat do WhatsApp (ex: 5511999999999@c.us)
    chat_id         text not null,
    -- Nome de exibição do contato/grupo
    chat_name       text,

    -- ── Geração ─────────────────────────────────────────────────────────
    -- Provedor LLM usado (groq | gemini | deepseek)
    llm_provider    text not null,
    -- Modelo exato usado
    llm_model       text,
    -- Quantas partes o draft foi dividido
    parts_count     int not null default 1,
    -- Texto completo do draft (partes unidas por \n\n)
    draft_text      text not null,
    -- Array com cada parte individual do draft
    draft_parts     text[] not null default '{}',
    -- Quantas mensagens de histórico foram enviadas como contexto
    context_messages_count int not null default 0,
    -- Gerado pelo pool automático (true) ou sob demanda (false)
    auto_generated  boolean not null default true,
    -- Timestamp de quando o draft foi gerado (epoch unix, igual ao frontend)
    generated_at    timestamptz not null default now(),

    -- ── Ação tomada ──────────────────────────────────────────────────────
    -- 'pending'  — draft gerado, nenhuma ação ainda
    -- 'sent'     — enviado direto sem edição
    -- 'edited'   — o texto foi alterado antes de enviar
    -- 'discarded'— descartado sem envio
    -- 'partial'  — algumas partes enviadas, outras descartadas
    action          text not null default 'pending'
                        check (action in ('pending','sent','edited','discarded','partial')),
    -- Texto final que foi efetivamente enviado (pode diferir de draft_text se editado)
    sent_text       text,
    -- Array com as partes que foram efetivamente enviadas
    sent_parts      text[] default '{}',
    -- Quantas partes foram enviadas
    sent_parts_count int not null default 0,
    -- true se o usuário alterou alguma parte antes de enviar
    was_edited      boolean not null default false,
    -- Diff resumido: quais partes foram editadas (índices base-0)
    edited_part_indices int[] default '{}',
    -- Quando a ação foi realizada
    action_at       timestamptz,

    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- ── prompt_part_actions ───────────────────────────────────────────────────
-- Rastreia a ação tomada em cada parte individual do draft.
-- Útil quando o usuário envia/descarta partes separadamente.
create table if not exists prompt_part_actions (
    id              uuid primary key default uuid_generate_v4(),
    prompt_log_id   uuid not null references prompt_logs(id) on delete cascade,

    -- Índice da parte (0-based)
    part_index      int not null,
    -- Texto original gerado pela IA para esta parte
    original_text   text not null,
    -- Texto final enviado (null se descartado)
    final_text      text,
    -- 'sent' | 'edited' | 'discarded'
    action          text not null
                        check (action in ('sent','edited','discarded')),
    was_edited      boolean not null default false,
    action_at       timestamptz not null default now(),

    created_at      timestamptz not null default now()
);

-- ── Índices ───────────────────────────────────────────────────────────────
create index if not exists idx_prompt_logs_session_id  on prompt_logs(session_id);
create index if not exists idx_prompt_logs_chat_id     on prompt_logs(chat_id);
create index if not exists idx_prompt_logs_action      on prompt_logs(action);
create index if not exists idx_prompt_logs_generated_at on prompt_logs(generated_at desc);
create index if not exists idx_prompt_part_actions_log  on prompt_part_actions(prompt_log_id);

-- ── updated_at automático ─────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create or replace trigger trg_sessions_updated_at
    before update on sessions
    for each row execute function set_updated_at();

create or replace trigger trg_prompt_logs_updated_at
    before update on prompt_logs
    for each row execute function set_updated_at();