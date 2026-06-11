-- Run this once in Supabase SQL Editor if you want fee-rule settings to sync across devices.
-- This does not change the transactions table and does not modify historical transaction fees.

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

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fee_settings' and policyname = 'Users can read their own fee settings') then
    create policy "Users can read their own fee settings"
    on public.fee_settings
    for select
    to authenticated
    using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fee_settings' and policyname = 'Users can insert their own fee settings') then
    create policy "Users can insert their own fee settings"
    on public.fee_settings
    for insert
    to authenticated
    with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fee_settings' and policyname = 'Users can update their own fee settings') then
    create policy "Users can update their own fee settings"
    on public.fee_settings
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;
end $$;
