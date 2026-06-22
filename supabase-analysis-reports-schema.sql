-- Optional persistence for AI analysis reports generated through the dashboard.
-- Run this once in Supabase SQL editor if you want reports stored in Supabase.

create table if not exists public.analysis_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text,
  company_name text,
  prompt_id text not null,
  parameters jsonb not null default '{}'::jsonb,
  result_markdown text not null,
  status text not null default 'completed' check (status in ('completed', 'failed')),
  error_code text,
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.analysis_reports enable row level security;

create policy "Users can read own analysis reports"
  on public.analysis_reports
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own analysis reports"
  on public.analysis_reports
  for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own analysis reports"
  on public.analysis_reports
  for delete
  using (auth.uid() = user_id);

create index if not exists analysis_reports_user_created_idx
  on public.analysis_reports (user_id, created_at desc);

create index if not exists analysis_reports_user_ticker_idx
  on public.analysis_reports (user_id, ticker);


-- Add these columns if your analysis_reports table already exists.
alter table public.analysis_reports
  add column if not exists status text not null default 'completed' check (status in ('completed', 'failed')),
  add column if not exists error_code text,
  add column if not exists error_message text;
