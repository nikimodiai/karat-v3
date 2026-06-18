-- ── SOP Knowledge Base for the in-app "Ask Swarnix" RAG chatbot ──────────────
-- Stores the owner-facing SOP documents (see SOPs_Swarnix.md) as embedded
-- chunks so the n8n "SOP Chatbot" workflow can retrieve the most relevant
-- SOP(s) for an owner's question via vector similarity search, then hand them
-- to an AI agent node to compose the final answer.
--
-- Embedding model: Google gemini-embedding-2-preview, outputDimensionality=768
-- (same model already used for product image/visual search elsewhere in the app).
--
-- This knowledge base is shared across ALL stores (it documents the app itself,
-- not per-store data), so there is no owner_id column and RLS simply allows
-- read access to anyone with the anon key — the same way owner_faqs differs
-- in being per-store, this table is intentionally global.

create extension if not exists vector;

-- One row per SOP document (matches each "## heading" in SOPs_Swarnix.md).
create table if not exists public.sop_documents (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,        -- e.g. 'add-edit-product'
  title       text not null,               -- e.g. 'How to Add or Edit a Product in Swarnix'
  body        text not null,               -- full SOP markdown (in short / who can do this / steps / etc.)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One row per embedded chunk. Each SOP is short enough to embed as a single
-- chunk today (chunk_index = 0), but the table supports splitting a SOP into
-- multiple chunks later without a schema change.
create table if not exists public.sop_chunks (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.sop_documents(id) on delete cascade,
  chunk_index   int not null default 0,
  content       text not null,             -- the exact text that was embedded
  embedding     vector(768),
  created_at    timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists sop_chunks_embedding_idx
  on public.sop_chunks
  using hnsw (embedding vector_cosine_ops);

create index if not exists sop_chunks_document_id_idx
  on public.sop_chunks (document_id);

-- ── RLS ───────────────────────────────────────────────────────────────────
-- Shared knowledge base: any authenticated owner or logged-in staff (anon key,
-- scoped at the app layer) can read. Only the service role (used by n8n) can write.
alter table public.sop_documents enable row level security;
alter table public.sop_chunks    enable row level security;

drop policy if exists "anyone_can_read_sop_documents" on public.sop_documents;
create policy "anyone_can_read_sop_documents"
  on public.sop_documents for select
  to anon, authenticated
  using (true);

drop policy if exists "anyone_can_read_sop_chunks" on public.sop_chunks;
create policy "anyone_can_read_sop_chunks"
  on public.sop_chunks for select
  to anon, authenticated
  using (true);

-- No insert/update/delete policies for anon/authenticated — only the
-- service-role key (used by the n8n indexing workflow) can write, since
-- service-role bypasses RLS entirely.

-- ── Vector similarity search RPC ─────────────────────────────────────────
-- Called by the n8n "SOP Chatbot" workflow via PostgREST RPC:
--   POST /rest/v1/rpc/match_sop_chunks
--   { "query_embedding": [...768 floats...], "match_count": 4 }
create or replace function public.match_sop_chunks(
  query_embedding vector(768),
  match_count int default 4
)
returns table (
  chunk_id     uuid,
  document_id  uuid,
  slug         text,
  title        text,
  content      text,
  similarity   float
)
language sql
stable
as $$
  select
    c.id            as chunk_id,
    c.document_id   as document_id,
    d.slug          as slug,
    d.title         as title,
    c.content       as content,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.sop_chunks c
  join public.sop_documents d on d.id = c.document_id
  where c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_sop_chunks(vector(768), int) to anon, authenticated;

-- ── Conversation log (optional analytics / debugging) ────────────────────
-- Logs each Q&A turn from the "Ask Swarnix" widget. Not required for RAG to
-- function, but useful to see what owners are actually asking and whether
-- the bot is finding good matches.
create table if not exists public.sop_chat_logs (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid,                  -- store.owner_id, if known
  asked_by          text,                  -- staff username, or 'owner'
  question          text not null,
  detected_language text,
  matched_slugs     text[],
  answer            text,
  created_at        timestamptz not null default now()
);

alter table public.sop_chat_logs enable row level security;

drop policy if exists "owner_can_read_own_chat_logs" on public.sop_chat_logs;
create policy "owner_can_read_own_chat_logs"
  on public.sop_chat_logs for select
  to authenticated
  using (owner_id = auth.uid());

-- Inserts happen only via the n8n workflow using the service-role key
-- (bypasses RLS), so no insert policy is needed for anon/authenticated.
