# Transactions and Fees Audit

## Result
The code and database are now aligned for both:

- `public.transactions`
- `public.fee_settings`

## Canonical transaction columns used by the app

The JavaScript Supabase layer now reads/writes these exact columns:

```text
transactions.id
transactions.user_id
transactions.type
transactions.company_name
transactions.ticker
transactions.transaction_date
transactions.share_price
transactions.quantity
transactions.transaction_fee
transactions.created_at
```

## Canonical fee settings columns used by the app

```text
fee_settings.user_id
fee_settings.buy_threshold
fee_settings.buy_flat_fee
fee_settings.buy_percentage_fee
fee_settings.sell_threshold
fee_settings.sell_flat_fee
fee_settings.sell_percentage_fee
fee_settings.updated_at
```

## Important fixes made

1. Transaction saving now includes `user_id` explicitly.
2. Transaction saving no longer deletes all rows before inserting.
3. Transaction saving now upserts current records first, then deletes only stale rows.
4. Supabase errors include the real message, hint, details, and code.
5. Transaction schema grants `select`, `insert`, `update`, and `delete` to authenticated users.
6. Fee settings and transaction schemas now live in one full migration file: `supabase-full-schema.sql`.
7. `supabase-schema.sql` is now the same full schema, so you can run one file for the full database.

## Safe historical behavior

- Saved transaction fee amounts are stored permanently in `transactions.transaction_fee`.
- Changing buy/sell fee rules does not change old transaction records.
- New transactions use the current fee rule as a default, but the saved transaction stores the final fee amount.

## How to update Supabase

Run this file in Supabase SQL Editor:

```text
supabase-full-schema.sql
```

This file updates both transaction and fee settings database structure.

## Validation

Local validation passed:

```text
All portfolio calculation, propagation, validation, API-failure, sort, chart range grouping, default transaction fee-rule, and break-even fee tests passed.
```
