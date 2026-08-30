# Database — Documentação do Schema

Banco de dados Postgres hospedado no Supabase.
Migration: `supabase/migrations/001_initial_schema.sql`

---

## Visão geral

```
sessions
   └── prompt_logs          (session_id → sessions.id)
           └── prompt_part_actions   (prompt_log_id → prompt_logs.id)
```

| Tabela | Propósito |
|---|---|
| `sessions` | Uma linha por conexão WhatsApp (do QR scan até o logout) |
| `prompt_logs` | Uma linha por draft gerado pela IA |
| `prompt_part_actions` | Uma linha por parte individual enviada/descartada em drafts multi-parte |

---

## `sessions`

Criada automaticamente no evento `onReady` do WhatsApp e fechada no `onDisconnected` ou shutdown do servidor.

| Campo | Tipo | Obrigatório | Default | Descrição |
|---|---|---|---|---|
| `id` | `uuid` | ✅ | `uuid_generate_v4()` | Chave primária gerada automaticamente |
| `operator_id` | `text` | ❌ | `null` | Número/ID WhatsApp do operador (ex: `5511999999999`) — preenchido quando disponível |
| `operator_name` | `text` | ❌ | `null` | Nome de exibição do operador (`pushname` do WhatsApp) |
| `connected_at` | `timestamptz` | ✅ | `now()` | Momento em que o cliente WhatsApp ficou `ready` |
| `disconnected_at` | `timestamptz` | ❌ | `null` | Momento do logout ou desconexão — `null` enquanto a sessão está ativa |
| `meta` | `jsonb` | ❌ | `{}` | Metadados livres — atualmente guarda `node_env`. Pode ser expandido com IP, versão do app, etc. |
| `created_at` | `timestamptz` | ✅ | `now()` | Inserção do registro |
| `updated_at` | `timestamptz` | ✅ | `now()` | Atualizado automaticamente via trigger em qualquer `UPDATE` |

**Trigger:** `trg_sessions_updated_at` — atualiza `updated_at` automaticamente em qualquer `UPDATE`.

---

## `prompt_logs`

Criada assim que a IA gera um draft. O campo `action` começa como `pending` e é atualizado quando o operador interage com o draft no frontend via `POST /api/draft-action`.

### Grupo: identificação

| Campo | Tipo | Obrigatório | Default | Descrição |
|---|---|---|---|---|
| `id` | `uuid` | ✅ | `uuid_generate_v4()` | Chave primária. Também é o `promptLogId` trafegado no evento socket `ai_draft` e no endpoint `/api/draft-action` |
| `session_id` | `uuid` | ❌ | `null` | FK para `sessions.id`. `SET NULL` se a sessão for deletada. `null` se o banco não estava disponível no momento da geração |

### Grupo: conversa

| Campo | Tipo | Obrigatório | Default | Descrição |
|---|---|---|---|---|
| `chat_id` | `text` | ✅ | — | ID do chat WhatsApp (ex: `5511999999999@c.us` para contatos, `120363...@g.us` para grupos) |
| `chat_name` | `text` | ❌ | `null` | Nome de exibição do contato ou grupo no momento da geração |

### Grupo: geração

| Campo | Tipo | Obrigatório | Default | Descrição |
|---|---|---|---|---|
| `llm_provider` | `text` | ✅ | — | Provedor LLM usado: `groq`, `gemini` ou `deepseek` |
| `llm_model` | `text` | ❌ | `null` | Modelo exato utilizado (ex: `llama-3.3-70b-versatile`, `gemini-2.5-flash`) |
| `parts_count` | `int` | ✅ | `1` | Número de partes em que o draft foi dividido |
| `draft_text` | `text` | ✅ | — | Texto completo do draft, com todas as partes unidas por `\n\n` |
| `draft_parts` | `text[]` | ✅ | `{}` | Array com cada parte individual exatamente como a IA gerou, antes de qualquer edição |
| `context_messages_count` | `int` | ✅ | `0` | Quantas mensagens do histórico foram enviadas como contexto para a IA |
| `auto_generated` | `boolean` | ✅ | `true` | `true` = gerado pelo pool automático (10s de silêncio). `false` = gerado pelo botão 🤖 sob demanda |
| `generated_at` | `timestamptz` | ✅ | `now()` | Momento exato em que o draft foi gerado pela IA |

### Grupo: ação do operador

Preenchido pelo endpoint `POST /api/draft-action` quando o operador interage com o draft.

| Campo | Tipo | Obrigatório | Default | Descrição |
|---|---|---|---|---|
| `action` | `text` | ✅ | `pending` | Estado atual do draft. Valores possíveis descritos abaixo |
| `sent_text` | `text` | ❌ | `null` | Texto final efetivamente enviado ao cliente (partes unidas por `\n\n`). `null` se descartado |
| `sent_parts` | `text[]` | ❌ | `{}` | Array com as partes que foram enviadas, no estado final (após edição, se houver) |
| `sent_parts_count` | `int` | ✅ | `0` | Número de partes efetivamente enviadas |
| `was_edited` | `boolean` | ✅ | `false` | `true` se o operador alterou o texto de pelo menos uma parte antes de enviar |
| `edited_part_indices` | `int[]` | ❌ | `{}` | Índices (base-0) das partes que foram editadas. Ex: `{0, 2}` significa que as partes 1 e 3 foram alteradas |
| `action_at` | `timestamptz` | ❌ | `null` | Momento em que o operador realizou a ação |

#### Valores possíveis de `action`

| Valor | Quando é definido |
|---|---|
| `pending` | Draft gerado — operador ainda não interagiu |
| `sent` | Operador clicou em **✅ Send** sem alterar nenhuma parte |
| `edited` | Operador alterou o texto de ao menos uma parte antes de enviar |
| `discarded` | Operador clicou em **✕ Discard all** ou em **✏️ Edit in input** |
| `partial` | Draft multi-parte em que algumas partes foram enviadas e outras descartadas individualmente |

### Grupo: controle

| Campo | Tipo | Obrigatório | Default | Descrição |
|---|---|---|---|---|
| `created_at` | `timestamptz` | ✅ | `now()` | Inserção do registro |
| `updated_at` | `timestamptz` | ✅ | `now()` | Atualizado automaticamente via trigger em qualquer `UPDATE` |

**Trigger:** `trg_prompt_logs_updated_at` — atualiza `updated_at` automaticamente em qualquer `UPDATE`.

**Índices:**

| Nome | Campo(s) | Motivo |
|---|---|---|
| `idx_prompt_logs_session_id` | `session_id` | Filtrar todos os drafts de uma sessão |
| `idx_prompt_logs_chat_id` | `chat_id` | Filtrar histórico de um contato específico |
| `idx_prompt_logs_action` | `action` | Filtrar por status (ex: todos os `pending`) |
| `idx_prompt_logs_generated_at` | `generated_at DESC` | Ordenar por mais recentes |

---

## `prompt_part_actions`

Detalha a ação tomada em cada parte individual de um draft multi-parte. Populada quando o operador usa **✅ Send this** ou **✕** em partes separadas, ou quando envia/descarta todas de uma vez com detalhes por parte.

| Campo | Tipo | Obrigatório | Default | Descrição |
|---|---|---|---|---|
| `id` | `uuid` | ✅ | `uuid_generate_v4()` | Chave primária |
| `prompt_log_id` | `uuid` | ✅ | — | FK para `prompt_logs.id`. `CASCADE DELETE` — se o log pai for deletado, os detalhes também são |
| `part_index` | `int` | ✅ | — | Índice base-0 da parte dentro do draft (ex: `0` = primeira parte, `1` = segunda) |
| `original_text` | `text` | ✅ | — | Texto exato gerado pela IA para esta parte, antes de qualquer edição |
| `final_text` | `text` | ❌ | `null` | Texto final enviado. `null` se a parte foi descartada |
| `action` | `text` | ✅ | — | O que foi feito com esta parte: `sent`, `edited` ou `discarded` |
| `was_edited` | `boolean` | ✅ | `false` | `true` se `final_text` difere de `original_text` |
| `action_at` | `timestamptz` | ✅ | `now()` | Momento em que a ação foi realizada |
| `created_at` | `timestamptz` | ✅ | `now()` | Inserção do registro |

#### Valores possíveis de `action`

| Valor | Quando é definido |
|---|---|
| `sent` | Parte enviada sem alteração (`final_text == original_text`) |
| `edited` | Parte enviada após edição (`final_text != original_text`) |
| `discarded` | Parte removida com **✕** sem envio (`final_text` é `null`) |

**Índice:**

| Nome | Campo | Motivo |
|---|---|---|
| `idx_prompt_part_actions_log` | `prompt_log_id` | Buscar todas as partes de um log específico |

---

## Relacionamentos

```
sessions (1) ──────────────────── (N) prompt_logs
                                          │
                                          │ on delete cascade
                                          │
                              (N) prompt_part_actions
```

- Um `session` pode ter muitos `prompt_logs`
- Um `prompt_log` pode ter muitos `prompt_part_actions`
- Deletar uma `session` seta `session_id = null` nos logs (preserva o histórico)
- Deletar um `prompt_log` remove em cascata todos os seus `prompt_part_actions`

---

## Adicionando campos futuros

Para adicionar um novo campo, crie um novo arquivo em `supabase/migrations/` com numeração sequencial e execute no SQL Editor do Supabase. Exemplo:

```sql
-- supabase/migrations/002_add_chat_name_to_sessions.sql
alter table sessions add column if not exists chat_platform text default 'whatsapp';
```

Não edite o arquivo `001_initial_schema.sql` após a primeira execução — sempre crie uma nova migration.