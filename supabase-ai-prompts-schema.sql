-- Optional table for editable and user-created AI analysis prompts.
-- Default prompt files remain in the deployed app. This table stores user custom prompts only.

create table if not exists ai_prompts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text,
  description text,
  prompt_text text not null,
  parameters jsonb not null default '[]'::jsonb,
  generation_config jsonb not null default '{"temperature":0.3,"topP":0.8,"maxOutputTokens":4096}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_prompts_user_id_idx on ai_prompts(user_id);
create index if not exists ai_prompts_updated_at_idx on ai_prompts(updated_at desc);

alter table ai_prompts enable row level security;

drop policy if exists "Users can read their own AI prompts" on ai_prompts;
drop policy if exists "Users can insert their own AI prompts" on ai_prompts;
drop policy if exists "Users can update their own AI prompts" on ai_prompts;
drop policy if exists "Users can delete their own AI prompts" on ai_prompts;

create policy "Users can read their own AI prompts"
on ai_prompts
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own AI prompts"
on ai_prompts
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own AI prompts"
on ai_prompts
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own AI prompts"
on ai_prompts
for delete
to authenticated
using (auth.uid() = user_id);
