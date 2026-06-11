-- Run this once in Supabase SQL Editor.
-- Canonical fee_settings table for saved BUY/SELL fee-rule defaults.
-- This migration intentionally drops/recreates ONLY public.fee_settings because older builds used incompatible column names.
-- It does NOT modify public.transactions or any transaction records.

drop table if exists public.fee_settings cascade;

create table public.fee_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  buy_threshold numeric(20, 6) not null default 1000 check (buy_threshold >= 0),
  buy_flat_fee numeric(20, 6) not null default 1 check (buy_flat_fee >= 0),
  buy_percentage_fee numeric(20, 10) not null default 0.001425 check (buy_percentage_fee >= 0 and buy_percentage_fee < 1),

  sell_threshold numeric(20, 6) not null default 1000 check (sell_threshold >= 0),
  sell_flat_fee numeric(20, 6) not null default 1 check (sell_flat_fee >= 0),
  sell_percentage_fee numeric(20, 10) not null default 0.001425 check (sell_percentage_fee >= 0 and sell_percentage_fee < 1),

  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint fee_settings_user_id_unique unique (user_id)
);

alter table public.fee_settings enable row level security;

create policy "Users can read their own fee settings"
on public.fee_settings
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own fee settings"
on public.fee_settings
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own fee settings"
on public.fee_settings
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update on public.fee_settings to authenticated;

-- Optional verification after running migration:
-- select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = 'fee_settings' order by ordinal_position;
