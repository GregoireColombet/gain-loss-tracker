-- Run this once in Supabase SQL Editor.
-- This stores fee-rule defaults per authenticated user.
-- It does not modify existing transaction records.

create table if not exists public.fee_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  buy_threshold numeric not null default 0 check (buy_threshold >= 0),
  buy_flat_fee numeric not null default 0 check (buy_flat_fee >= 0),
  buy_percentage_fee numeric not null default 0 check (buy_percentage_fee >= 0 and buy_percentage_fee < 1),

  sell_threshold numeric not null default 0 check (sell_threshold >= 0),
  sell_flat_fee numeric not null default 0 check (sell_flat_fee >= 0),
  sell_percentage_fee numeric not null default 0 check (sell_percentage_fee >= 0 and sell_percentage_fee < 1),

  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),

  unique(user_id)
);

-- If an older fee_settings table exists with missing columns, add them safely.
alter table public.fee_settings add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.fee_settings add column if not exists buy_threshold numeric not null default 0 check (buy_threshold >= 0);
alter table public.fee_settings add column if not exists buy_flat_fee numeric not null default 0 check (buy_flat_fee >= 0);
alter table public.fee_settings add column if not exists buy_percentage_fee numeric not null default 0 check (buy_percentage_fee >= 0 and buy_percentage_fee < 1);
alter table public.fee_settings add column if not exists sell_threshold numeric not null default 0 check (sell_threshold >= 0);
alter table public.fee_settings add column if not exists sell_flat_fee numeric not null default 0 check (sell_flat_fee >= 0);
alter table public.fee_settings add column if not exists sell_percentage_fee numeric not null default 0 check (sell_percentage_fee >= 0 and sell_percentage_fee < 1);
alter table public.fee_settings add column if not exists created_at timestamp with time zone default now();
alter table public.fee_settings add column if not exists updated_at timestamp with time zone default now();

create unique index if not exists fee_settings_user_id_unique on public.fee_settings(user_id);

alter table public.fee_settings enable row level security;

drop policy if exists "Users can read their own fee settings" on public.fee_settings;
drop policy if exists "Users can insert their own fee settings" on public.fee_settings;
drop policy if exists "Users can update their own fee settings" on public.fee_settings;
drop policy if exists "Users can delete their own fee settings" on public.fee_settings;

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

grant select, insert, update, delete on public.fee_settings to authenticated;
