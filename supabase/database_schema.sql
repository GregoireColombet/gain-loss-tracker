-- Stock Tracker Supabase Database Schema
-- Purpose: create the complete database structure required by the current application.
-- Run this file in the Supabase SQL Editor for a new project.
-- It is written to be mostly idempotent and includes the latest table structure,
-- indexes, Row Level Security policies, updated_at triggers, and schema version.

create extension if not exists pgcrypto;

-- =========================================================
-- Shared updated_at trigger helper
-- =========================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================
-- Transactions
-- Stores BUY / SELL stock transactions.
-- Column names match js/supabaseStorage.js.
-- =========================================================
create table if not exists public.transactions (
  id text primary key default ('tx_' || gen_random_uuid()::text),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null,
  company_name text not null,
  ticker text not null,
  transaction_date date not null,
  share_price numeric(20, 6) not null,
  quantity numeric(20, 6) not null,
  transaction_fee numeric(20, 6) not null default 0,
  created_at timestamptz not null default now()
);

-- Compatibility columns for projects created from earlier schema files.
alter table public.transactions add column if not exists user_id uuid default auth.uid() references auth.users(id) on delete cascade;
alter table public.transactions add column if not exists type text;
alter table public.transactions add column if not exists company_name text;
alter table public.transactions add column if not exists ticker text;
alter table public.transactions add column if not exists transaction_date date;
alter table public.transactions add column if not exists share_price numeric(20, 6);
alter table public.transactions add column if not exists quantity numeric(20, 6);
alter table public.transactions add column if not exists transaction_fee numeric(20, 6) default 0;
alter table public.transactions add column if not exists created_at timestamptz default now();

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='transactions' and column_name='fee') then
    execute 'update public.transactions set transaction_fee = coalesce(transaction_fee, fee, 0) where transaction_fee is null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='transactions' and column_name='price') then
    execute 'update public.transactions set share_price = coalesce(share_price, price) where share_price is null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='transactions' and column_name='date') then
    execute 'update public.transactions set transaction_date = coalesce(transaction_date, date::date) where transaction_date is null';
  end if;
end $$;

alter table public.transactions alter column user_id set not null;
alter table public.transactions alter column type set not null;
alter table public.transactions alter column company_name set not null;
alter table public.transactions alter column ticker set not null;
alter table public.transactions alter column transaction_date set not null;
alter table public.transactions alter column share_price set not null;
alter table public.transactions alter column quantity set not null;
alter table public.transactions alter column transaction_fee set not null;
alter table public.transactions alter column created_at set not null;

alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check check (type in ('BUY', 'SELL'));
alter table public.transactions drop constraint if exists transactions_share_price_check;
alter table public.transactions add constraint transactions_share_price_check check (share_price > 0);
alter table public.transactions drop constraint if exists transactions_quantity_check;
alter table public.transactions add constraint transactions_quantity_check check (quantity > 0);
alter table public.transactions drop constraint if exists transactions_transaction_fee_check;
alter table public.transactions add constraint transactions_transaction_fee_check check (transaction_fee >= 0);

create index if not exists transactions_user_date_idx on public.transactions (user_id, transaction_date, created_at);
create index if not exists transactions_user_ticker_idx on public.transactions (user_id, ticker);

alter table public.transactions enable row level security;

drop policy if exists "Users can read their own transactions" on public.transactions;
drop policy if exists "Users can insert their own transactions" on public.transactions;
drop policy if exists "Users can update their own transactions" on public.transactions;
drop policy if exists "Users can delete their own transactions" on public.transactions;

create policy "Users can read their own transactions"
on public.transactions for select to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own transactions"
on public.transactions for insert to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own transactions"
on public.transactions for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own transactions"
on public.transactions for delete to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on public.transactions to authenticated;

-- =========================================================
-- Fee settings
-- Stores per-user BUY/SELL fee rule defaults.
-- Column names match js/supabaseStorage.js.
-- =========================================================
create table if not exists public.fee_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  buy_threshold numeric(20, 6) not null default 1000,
  buy_flat_fee numeric(20, 6) not null default 1,
  buy_percentage_fee numeric(20, 10) not null default 0.001425,
  sell_threshold numeric(20, 6) not null default 1000,
  sell_flat_fee numeric(20, 6) not null default 1,
  sell_percentage_fee numeric(20, 10) not null default 0.001425,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fee_settings_user_id_unique unique (user_id)
);

alter table public.fee_settings add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.fee_settings add column if not exists buy_threshold numeric(20, 6) default 1000;
alter table public.fee_settings add column if not exists buy_flat_fee numeric(20, 6) default 1;
alter table public.fee_settings add column if not exists buy_percentage_fee numeric(20, 10) default 0.001425;
alter table public.fee_settings add column if not exists sell_threshold numeric(20, 6) default 1000;
alter table public.fee_settings add column if not exists sell_flat_fee numeric(20, 6) default 1;
alter table public.fee_settings add column if not exists sell_percentage_fee numeric(20, 10) default 0.001425;
alter table public.fee_settings add column if not exists created_at timestamptz default now();
alter table public.fee_settings add column if not exists updated_at timestamptz default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fee_settings_user_id_unique') then
    alter table public.fee_settings add constraint fee_settings_user_id_unique unique (user_id);
  end if;
end $$;

alter table public.fee_settings alter column user_id set not null;
alter table public.fee_settings alter column buy_threshold set not null;
alter table public.fee_settings alter column buy_flat_fee set not null;
alter table public.fee_settings alter column buy_percentage_fee set not null;
alter table public.fee_settings alter column sell_threshold set not null;
alter table public.fee_settings alter column sell_flat_fee set not null;
alter table public.fee_settings alter column sell_percentage_fee set not null;
alter table public.fee_settings alter column created_at set not null;
alter table public.fee_settings alter column updated_at set not null;

alter table public.fee_settings drop constraint if exists fee_settings_buy_threshold_check;
alter table public.fee_settings add constraint fee_settings_buy_threshold_check check (buy_threshold >= 0);
alter table public.fee_settings drop constraint if exists fee_settings_buy_flat_fee_check;
alter table public.fee_settings add constraint fee_settings_buy_flat_fee_check check (buy_flat_fee >= 0);
alter table public.fee_settings drop constraint if exists fee_settings_buy_percentage_fee_check;
alter table public.fee_settings add constraint fee_settings_buy_percentage_fee_check check (buy_percentage_fee >= 0 and buy_percentage_fee < 1);
alter table public.fee_settings drop constraint if exists fee_settings_sell_threshold_check;
alter table public.fee_settings add constraint fee_settings_sell_threshold_check check (sell_threshold >= 0);
alter table public.fee_settings drop constraint if exists fee_settings_sell_flat_fee_check;
alter table public.fee_settings add constraint fee_settings_sell_flat_fee_check check (sell_flat_fee >= 0);
alter table public.fee_settings drop constraint if exists fee_settings_sell_percentage_fee_check;
alter table public.fee_settings add constraint fee_settings_sell_percentage_fee_check check (sell_percentage_fee >= 0 and sell_percentage_fee < 1);

drop trigger if exists set_fee_settings_updated_at on public.fee_settings;
create trigger set_fee_settings_updated_at
before update on public.fee_settings
for each row execute function public.set_updated_at();

alter table public.fee_settings enable row level security;

drop policy if exists "Users can read their own fee settings" on public.fee_settings;
drop policy if exists "Users can insert their own fee settings" on public.fee_settings;
drop policy if exists "Users can update their own fee settings" on public.fee_settings;

create policy "Users can read their own fee settings"
on public.fee_settings for select to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own fee settings"
on public.fee_settings for insert to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own fee settings"
on public.fee_settings for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update on public.fee_settings to authenticated;

-- =========================================================
-- AI analysis reports
-- Stores completed and failed Gemini-generated reports.
-- Column names match js/ai/analysisService.js.
-- =========================================================
create table if not exists public.analysis_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text,
  company_name text,
  prompt_id text not null,
  parameters jsonb not null default '{}'::jsonb,
  generation_config jsonb,
  result_markdown text not null default '',
  status text not null default 'completed',
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.analysis_reports add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.analysis_reports add column if not exists ticker text;
alter table public.analysis_reports add column if not exists company_name text;
alter table public.analysis_reports add column if not exists prompt_id text;
alter table public.analysis_reports add column if not exists parameters jsonb default '{}'::jsonb;
alter table public.analysis_reports add column if not exists generation_config jsonb;
alter table public.analysis_reports add column if not exists result_markdown text default '';
alter table public.analysis_reports add column if not exists status text default 'completed';
alter table public.analysis_reports add column if not exists error_code text;
alter table public.analysis_reports add column if not exists error_message text;
alter table public.analysis_reports add column if not exists created_at timestamptz default now();
alter table public.analysis_reports add column if not exists updated_at timestamptz default now();

alter table public.analysis_reports alter column user_id set not null;
alter table public.analysis_reports alter column prompt_id set not null;
alter table public.analysis_reports alter column parameters set not null;
alter table public.analysis_reports alter column result_markdown set not null;
alter table public.analysis_reports alter column status set not null;
alter table public.analysis_reports alter column created_at set not null;
alter table public.analysis_reports alter column updated_at set not null;

alter table public.analysis_reports drop constraint if exists analysis_reports_status_check;
alter table public.analysis_reports add constraint analysis_reports_status_check check (status in ('completed', 'failed', 'generating'));

create index if not exists analysis_reports_user_created_idx on public.analysis_reports (user_id, created_at desc);
create index if not exists analysis_reports_user_ticker_idx on public.analysis_reports (user_id, ticker);
create index if not exists analysis_reports_user_prompt_idx on public.analysis_reports (user_id, prompt_id);

drop trigger if exists set_analysis_reports_updated_at on public.analysis_reports;
create trigger set_analysis_reports_updated_at
before update on public.analysis_reports
for each row execute function public.set_updated_at();

alter table public.analysis_reports enable row level security;

drop policy if exists "Users can read own analysis reports" on public.analysis_reports;
drop policy if exists "Users can insert own analysis reports" on public.analysis_reports;
drop policy if exists "Users can update own analysis reports" on public.analysis_reports;
drop policy if exists "Users can delete own analysis reports" on public.analysis_reports;
drop policy if exists "Users can read their own analysis reports" on public.analysis_reports;
drop policy if exists "Users can insert their own analysis reports" on public.analysis_reports;
drop policy if exists "Users can update their own analysis reports" on public.analysis_reports;
drop policy if exists "Users can delete their own analysis reports" on public.analysis_reports;

create policy "Users can read their own analysis reports"
on public.analysis_reports for select to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own analysis reports"
on public.analysis_reports for insert to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own analysis reports"
on public.analysis_reports for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own analysis reports"
on public.analysis_reports for delete to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on public.analysis_reports to authenticated;

-- =========================================================
-- AI prompts
-- Stores user-created and edited prompt templates.
-- Default prompt markdown files remain in the deployed application.
-- Column names match js/ai/promptStorage.js.
-- =========================================================
create table if not exists public.ai_prompts (
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

alter table public.ai_prompts add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.ai_prompts add column if not exists title text;
alter table public.ai_prompts add column if not exists category text;
alter table public.ai_prompts add column if not exists description text;
alter table public.ai_prompts add column if not exists prompt_text text;
alter table public.ai_prompts add column if not exists parameters jsonb default '[]'::jsonb;
alter table public.ai_prompts add column if not exists generation_config jsonb default '{"temperature":0.3,"topP":0.8,"maxOutputTokens":4096}'::jsonb;
alter table public.ai_prompts add column if not exists is_default boolean default false;
alter table public.ai_prompts add column if not exists created_at timestamptz default now();
alter table public.ai_prompts add column if not exists updated_at timestamptz default now();

update public.ai_prompts
set generation_config = '{"temperature":0.3,"topP":0.8,"maxOutputTokens":4096}'::jsonb
where generation_config is null;

alter table public.ai_prompts alter column user_id set not null;
alter table public.ai_prompts alter column title set not null;
alter table public.ai_prompts alter column prompt_text set not null;
alter table public.ai_prompts alter column parameters set not null;
alter table public.ai_prompts alter column generation_config set not null;
alter table public.ai_prompts alter column is_default set not null;
alter table public.ai_prompts alter column created_at set not null;
alter table public.ai_prompts alter column updated_at set not null;

create index if not exists ai_prompts_user_id_idx on public.ai_prompts (user_id);
create index if not exists ai_prompts_updated_at_idx on public.ai_prompts (user_id, updated_at desc);

drop trigger if exists set_ai_prompts_updated_at on public.ai_prompts;
create trigger set_ai_prompts_updated_at
before update on public.ai_prompts
for each row execute function public.set_updated_at();

alter table public.ai_prompts enable row level security;

drop policy if exists "Users can read their own AI prompts" on public.ai_prompts;
drop policy if exists "Users can insert their own AI prompts" on public.ai_prompts;
drop policy if exists "Users can update their own AI prompts" on public.ai_prompts;
drop policy if exists "Users can delete their own AI prompts" on public.ai_prompts;

create policy "Users can read their own AI prompts"
on public.ai_prompts for select to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own AI prompts"
on public.ai_prompts for insert to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own AI prompts"
on public.ai_prompts for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own AI prompts"
on public.ai_prompts for delete to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on public.ai_prompts to authenticated;

-- =========================================================
-- Schema version
-- Helps verify app/database compatibility.
-- =========================================================
create table if not exists public.schema_version (
  version text primary key,
  installed_at timestamptz not null default now()
);

insert into public.schema_version (version)
values ('v1.5.0')
on conflict (version) do nothing;

-- =========================================================
-- Verification queries
-- =========================================================
-- select table_name from information_schema.tables where table_schema = 'public' order by table_name;
-- select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = 'transactions' order by ordinal_position;
-- select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = 'analysis_reports' order by ordinal_position;
-- select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = 'ai_prompts' order by ordinal_position;
