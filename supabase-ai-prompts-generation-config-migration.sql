-- Adds per-prompt Gemini generation settings for custom AI prompts.

alter table ai_prompts
add column if not exists generation_config jsonb not null default
'{"temperature":0.3,"topP":0.8,"maxOutputTokens":4096}'::jsonb;

update ai_prompts
set generation_config = '{"temperature":0.3,"topP":0.8,"maxOutputTokens":4096}'::jsonb
where generation_config is null;
