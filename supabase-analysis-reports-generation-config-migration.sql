-- Optional: records the generation settings used for each saved AI report.

alter table analysis_reports
add column if not exists generation_config jsonb;
