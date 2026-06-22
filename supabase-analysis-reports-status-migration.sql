-- Adds status/error tracking for generated and failed AI reports.
alter table public.analysis_reports
  add column if not exists status text not null default 'completed' check (status in ('completed', 'failed')),
  add column if not exists error_code text,
  add column if not exists error_message text;
