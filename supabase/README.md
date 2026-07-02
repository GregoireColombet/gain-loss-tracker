# Supabase Setup

This folder contains the current Supabase setup for the Stock Tracker application.

## Database

Run this file in the Supabase SQL Editor to create or align the database schema:

```text
supabase/database_schema.sql
```

It includes:

- `transactions`
- `fee_settings`
- `analysis_reports`
- `ai_prompts`
- `schema_version`
- indexes
- Row Level Security policies
- `updated_at` triggers

The root-level legacy SQL/migration files have been removed. Use `supabase/database_schema.sql` as the canonical database creation file.

## Edge Functions

Functions are stored using the Supabase CLI folder convention:

```text
supabase/functions/get-stock-price/index.ts
supabase/functions/generate-company-analysis/index.ts
```

Deploy them with:

```bash
supabase functions deploy get-stock-price --no-verify-jwt
supabase functions deploy generate-company-analysis --no-verify-jwt
```

Set secrets with:

```bash
supabase secrets set FINNHUB_API_KEY=your_finnhub_key
supabase secrets set GEMINI_API_KEY=your_gemini_api_key
```

## Function configuration

`supabase/config.toml` includes `verify_jwt = false` for both browser-called Edge Functions.
