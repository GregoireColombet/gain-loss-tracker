-- Full Supabase schema for Stock Tracker
-- Run this in Supabase SQL Editor after selecting the correct project.
-- It aligns BOTH transactions and fee_settings with the current JavaScript code.
-- It does not drop your transactions table.

create extension if not exists pgcrypto;

-- =========================
-- TRANSACTIONS
-- =========================
create table if not exists public.transactions (
  id text primary key default ('tx_' || gen_random_uuid()::text),
  user_id uuid not null default auth.uid(),
  type text not null,
  company_name text not null,
  ticker text not null,
  transaction_date date not null,
  share_price numeric(20, 6) not null,
  quantity numeric(20, 6) not null,
  transaction_fee numeric(20, 6) not null default 0,
  created_at timestamptz not null default now()
);

-- Add missing columns if an older table already exists.
alter table public.transactions add column if not exists user_id uuid default auth.uid();
alter table public.transactions add column if not exists type text;
alter table public.transactions add column if not exists company_name text;
alter table public.transactions add column if not exists ticker text;
alter table public.transactions add column if not exists transaction_date date;
alter table public.transactions add column if not exists share_price numeric(20, 6);
alter table public.transactions add column if not exists quantity numeric(20, 6);
alter table public.transactions add column if not exists transaction_fee numeric(20, 6) default 0;
alter table public.transactions add column if not exists created_at timestamptz default now();

-- Compatibility copy from older schemas, when those columns exist.
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

create index if not exists transactions_user_date_index
on public.transactions (user_id, transaction_date, created_at);

grant select, insert, update, delete on public.transactions to authenticated;

-- =========================
-- FEE SETTINGS
-- =========================
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
  if not exists (
    select 1 from pg_constraint where conname = 'fee_settings_user_id_unique'
  ) then
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

-- Verification queries you can run after this migration:
-- select column_name, data_type from information_schema.columns where table_schema='public' and table_name='transactions' order by ordinal_position;
-- select column_name, data_type from information_schema.columns where table_schema='public' and table_name='fee_settings' order by ordinal_position;
