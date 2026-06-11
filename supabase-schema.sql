-- Supabase SQL Editor > New query > paste this file > Run

create extension if not exists pgcrypto;

create table if not exists public.transactions (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null default auth.uid(),
  type text not null check (type in ('BUY', 'SELL')),
  company_name text not null,
  ticker text not null,
  transaction_date date not null,
  share_price numeric(20, 6) not null check (share_price > 0),
  quantity numeric(20, 6) not null check (quantity > 0),
  transaction_fee numeric(20, 6) not null default 0 check (transaction_fee >= 0),
  created_at timestamptz not null default now()
);

alter table public.transactions enable row level security;

create policy "Users can read their own transactions"
on public.transactions
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own transactions"
on public.transactions
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own transactions"
on public.transactions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own transactions"
on public.transactions
for delete
to authenticated
using (auth.uid() = user_id);

create index if not exists transactions_user_date_index
on public.transactions (user_id, transaction_date, created_at);

-- Optional but recommended: sync fee rule defaults across devices.
create table if not exists public.fee_settings (
  id text primary key default 'default',
  user_id uuid not null default auth.uid(),
  buy_threshold_amount numeric(20, 6) not null default 1000 check (buy_threshold_amount > 0),
  buy_flat_fee numeric(20, 6) not null default 1 check (buy_flat_fee >= 0),
  buy_percentage_fee_rate numeric(20, 10) not null default 0.001425 check (buy_percentage_fee_rate >= 0 and buy_percentage_fee_rate < 1),
  sell_threshold_amount numeric(20, 6) not null default 1000 check (sell_threshold_amount > 0),
  sell_flat_fee numeric(20, 6) not null default 1 check (sell_flat_fee >= 0),
  sell_percentage_fee_rate numeric(20, 10) not null default 0.001425 check (sell_percentage_fee_rate >= 0 and sell_percentage_fee_rate < 1),
  updated_at timestamptz not null default now()
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
