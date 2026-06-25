# Fee settings Supabase review

## Issue found

The application JavaScript saves fee rules to columns named:

- `buy_threshold`
- `buy_flat_fee`
- `buy_percentage_fee`
- `sell_threshold`
- `sell_flat_fee`
- `sell_percentage_fee`

However, the older `supabase-schema.sql` defined a different table shape using:

- `buy_threshold_amount`
- `buy_percentage_fee_rate`
- `sell_threshold_amount`
- `sell_percentage_fee_rate`

Because the code and table schema did not match, Supabase could reject the save or save into a table structure that the current app did not read correctly.

## Fix applied

- `supabase-schema.sql` now uses the same column names as the code.
- `supabase-fee-settings-migration.sql` now recreates only `public.fee_settings` using the canonical schema.
- `js/supabaseStorage.js` now saves with `.upsert(...).select(...).maybeSingle()` so a real Supabase error is returned if the row is not saved.
- The Break-even tool now receives the real error message from Supabase.

## Important database action

Run the updated `supabase-fee-settings-migration.sql` in Supabase SQL Editor.

This drops/recreates only `public.fee_settings`.
It does not modify or delete `public.transactions`.

## Expected result

After saving fee rules while logged in, the `fee_settings` table should contain one row per user.
Changing fee rules affects only future transactions.
Existing transaction fees remain unchanged.
