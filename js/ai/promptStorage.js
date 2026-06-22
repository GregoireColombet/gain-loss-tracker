import { supabaseClient, isSupabaseConfigured } from '../supabaseClient.js';
import { getCurrentUser } from '../authService.js';
import { ANALYSIS_PROMPTS, DEFAULT_GENERATION_CONFIG, PARAMETER_DEFINITIONS, findDefaultPromptById } from './promptRegistry.js';
import { loadPromptTemplate } from './promptTemplateRenderer.js';

const LOCAL_CUSTOM_PROMPTS_KEY = 'stockTrackerCustomPrompts';
const MAX_LOCAL_PROMPTS = 50;

export function createBlankPromptDraft() {
  return {
    id: '',
    title: '',
    category: 'Custom',
    description: '',
    promptText: '',
    parameters: [],
    generationConfig: { ...DEFAULT_GENERATION_CONFIG },
    isDefault: false,
    isCustom: true
  };
}

export async function loadAvailablePrompts() {
  const defaultPrompts = await loadDefaultPromptsWithText();
  const customPrompts = await loadCustomPrompts();
  return mergePromptDefinitions(defaultPrompts, customPrompts);
}

export async function findPromptDefinitionById(promptId) {
  const prompts = await loadAvailablePrompts();
  return prompts.find(prompt => prompt.id === promptId) || prompts[0] || null;
}

export async function loadPromptForEditor(promptId) {
  if (!promptId) return createBlankPromptDraft();

  const prompts = await loadAvailablePrompts();
  const selectedPrompt = prompts.find(prompt => prompt.id === promptId);
  if (!selectedPrompt) return createBlankPromptDraft();

  const promptText = await loadPromptTemplate(selectedPrompt);

  return {
    ...selectedPrompt,
    promptText,
    parameters: normalizePromptParameters(selectedPrompt.parameters),
    generationConfig: normalizeGenerationConfig(selectedPrompt.generationConfig)
  };
}

export async function savePromptDefinition(promptDraft) {
  const normalizedPrompt = normalizePromptForSave(promptDraft);
  if (!normalizedPrompt.title) throw new Error('Prompt title is required.');
  if (!normalizedPrompt.promptText) throw new Error('Prompt text is required.');

  const savedPrompt = await saveCustomPromptToSupabase(normalizedPrompt)
    .catch(error => {
      console.warn('Custom prompt saved locally, but Supabase persistence failed.', error);
      return null;
    });

  const promptToStore = savedPrompt || {
    ...normalizedPrompt,
    id: normalizedPrompt.id || createPromptId(normalizedPrompt.title)
  };

  upsertLocalCustomPrompt(promptToStore);
  return promptToStore;
}

export async function deleteCustomPrompt(promptId) {
  deleteLocalCustomPrompt(promptId);

  if (!isSupabaseConfigured() || !supabaseClient) return;
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const { error } = await supabaseClient
    .from('ai_prompts')
    .delete()
    .eq('id', promptId)
    .eq('user_id', currentUser.id);

  if (error) throw error;
}

export async function duplicateDefaultPrompt(promptId) {
  const draft = await loadPromptForEditor(promptId);
  return {
    ...draft,
    id: '',
    title: `${draft.title} Custom Copy`,
    isDefault: false,
    isCustom: true
  };
}

export async function loadDefaultPromptsWithText() {
  return Promise.all(ANALYSIS_PROMPTS.map(async prompt => ({
    ...prompt,
    isDefault: true,
    isCustom: false,
    promptText: await loadPromptTemplate(prompt)
  })));
}

export function getParameterDefinition(parameterName) {
  return PARAMETER_DEFINITIONS[parameterName] || {
    label: toTitleCase(parameterName),
    type: 'text',
    placeholder: '',
    required: false
  };
}

export function normalizePromptParameters(parameters) {
  if (!Array.isArray(parameters)) return [];

  return parameters.map(parameter => {
    if (typeof parameter === 'string') {
      const definition = getParameterDefinition(parameter);
      return {
        name: parameter,
        label: definition.label || toTitleCase(parameter),
        type: definition.type || 'text',
        placeholder: definition.placeholder || '',
        options: definition.options || [],
        required: Boolean(definition.required)
      };
    }

    const name = String(parameter?.name || '').trim();
    return {
      name,
      label: String(parameter?.label || toTitleCase(name)).trim(),
      type: String(parameter?.type || 'text').trim(),
      placeholder: String(parameter?.placeholder || '').trim(),
      options: Array.isArray(parameter?.options) ? parameter.options.map(String) : parseOptions(parameter?.options),
      required: Boolean(parameter?.required)
    };
  }).filter(parameter => parameter.name);
}


export function normalizeGenerationConfig(config = {}) {
  const source = config && typeof config === 'object' ? config : {};

  return {
    temperature: clampNumber(source.temperature, DEFAULT_GENERATION_CONFIG.temperature, 0, 2),
    topP: clampNumber(source.topP, DEFAULT_GENERATION_CONFIG.topP, 0, 1),
    maxOutputTokens: clampInteger(source.maxOutputTokens, DEFAULT_GENERATION_CONFIG.maxOutputTokens, 512, 8192)
  };
}

export function parameterObjectsToNames(parameters) {
  return normalizePromptParameters(parameters).map(parameter => parameter.name);
}

function normalizePromptForSave(promptDraft) {
  const title = String(promptDraft.title || '').trim();
  const id = String(promptDraft.id || '').trim() || createPromptId(title);
  const parameters = normalizePromptParameters(promptDraft.parameters);

  return {
    id,
    title,
    category: String(promptDraft.category || 'Custom').trim(),
    description: String(promptDraft.description || '').trim(),
    promptText: String(promptDraft.promptText || '').trim(),
    parameters,
    generationConfig: normalizeGenerationConfig(promptDraft.generationConfig),
    isDefault: false,
    isCustom: true,
    updatedAt: new Date().toISOString()
  };
}

async function saveCustomPromptToSupabase(prompt) {
  if (!isSupabaseConfigured() || !supabaseClient) return null;

  const currentUser = await getCurrentUser();
  if (!currentUser) return null;

  const payload = {
    id: prompt.id,
    user_id: currentUser.id,
    title: prompt.title,
    category: prompt.category,
    description: prompt.description,
    prompt_text: prompt.promptText,
    parameters: prompt.parameters,
    generation_config: prompt.generationConfig,
    is_default: false,
    updated_at: prompt.updatedAt
  };

  const { data, error } = await supabaseClient
    .from('ai_prompts')
    .upsert(payload, { onConflict: 'id' })
    .select('id, title, category, description, prompt_text, parameters, generation_config, created_at, updated_at')
    .single();

  if (error?.code === 'PGRST204' || error?.message?.includes('generation_config')) {
    return saveCustomPromptUsingLegacyColumns(prompt, currentUser.id);
  }

  if (error) throw error;
  return mapSupabasePrompt(data);
}

async function saveCustomPromptUsingLegacyColumns(prompt, userId) {
  const { data, error } = await supabaseClient
    .from('ai_prompts')
    .upsert({
      id: prompt.id,
      user_id: userId,
      title: prompt.title,
      category: prompt.category,
      description: prompt.description,
      prompt_text: prompt.promptText,
      parameters: prompt.parameters,
      is_default: false,
      updated_at: prompt.updatedAt
    }, { onConflict: 'id' })
    .select('id, title, category, description, prompt_text, parameters, created_at, updated_at')
    .single();

  if (error) throw error;
  return mapSupabasePrompt({ ...data, generation_config: prompt.generationConfig });
}

async function loadCustomPrompts() {
  const localPrompts = loadLocalCustomPrompts();

  if (!isSupabaseConfigured() || !supabaseClient) return localPrompts;
  const currentUser = await getCurrentUser();
  if (!currentUser) return localPrompts;

  try {
    const { data, error } = await selectCustomPrompts(currentUser.id);

    if (error) throw error;

    const remotePrompts = (data || []).map(mapSupabasePrompt);
    remotePrompts.forEach(upsertLocalCustomPrompt);
    return mergeCustomPrompts(remotePrompts, localPrompts);
  } catch (error) {
    console.warn('Unable to load custom prompts from Supabase. Falling back to local custom prompts.', error);
    return localPrompts;
  }
}

async function selectCustomPrompts(userId) {
  const extendedResult = await supabaseClient
    .from('ai_prompts')
    .select('id, title, category, description, prompt_text, parameters, generation_config, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (!extendedResult.error?.message?.includes('generation_config') && extendedResult.error?.code !== 'PGRST204') {
    return extendedResult;
  }

  return supabaseClient
    .from('ai_prompts')
    .select('id, title, category, description, prompt_text, parameters, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
}

function mapSupabasePrompt(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category || 'Custom',
    description: row.description || '',
    promptText: row.prompt_text || '',
    parameters: normalizePromptParameters(row.parameters || []),
    generationConfig: normalizeGenerationConfig(row.generation_config),
    isDefault: false,
    isCustom: true,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function loadLocalCustomPrompts() {
  try {
    const value = localStorage.getItem(LOCAL_CUSTOM_PROMPTS_KEY);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.map(prompt => ({
      ...prompt,
      parameters: normalizePromptParameters(prompt.parameters || []),
      generationConfig: normalizeGenerationConfig(prompt.generationConfig)
    })) : [];
  } catch (error) {
    console.error('Unable to read local custom prompts.', error);
    return [];
  }
}

function upsertLocalCustomPrompt(prompt) {
  const prompts = loadLocalCustomPrompts();
  const filteredPrompts = prompts.filter(item => item.id !== prompt.id);
  const nextPrompts = [prompt, ...filteredPrompts].slice(0, MAX_LOCAL_PROMPTS);
  localStorage.setItem(LOCAL_CUSTOM_PROMPTS_KEY, JSON.stringify(nextPrompts, null, 2));
}

function deleteLocalCustomPrompt(promptId) {
  const prompts = loadLocalCustomPrompts().filter(prompt => prompt.id !== promptId);
  localStorage.setItem(LOCAL_CUSTOM_PROMPTS_KEY, JSON.stringify(prompts, null, 2));
}

function mergePromptDefinitions(defaultPrompts, customPrompts) {
  return [
    ...defaultPrompts,
    ...customPrompts.sort((a, b) => String(a.title).localeCompare(String(b.title), undefined, { sensitivity: 'base' }))
  ];
}

function mergeCustomPrompts(primaryPrompts, fallbackPrompts) {
  const seenIds = new Set();
  const merged = [];

  [...primaryPrompts, ...fallbackPrompts].forEach(prompt => {
    if (!prompt.id || seenIds.has(prompt.id)) return;
    seenIds.add(prompt.id);
    merged.push(prompt);
  });

  return merged;
}

function createPromptId(title) {
  const slug = String(title || 'custom-prompt')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'custom-prompt';
  return `${slug}-${Date.now().toString(36)}`;
}


function clampNumber(value, fallback, minimum, maximum) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(Math.max(numericValue, minimum), maximum);
}

function clampInteger(value, fallback, minimum, maximum) {
  return Math.round(clampNumber(value, fallback, minimum, maximum));
}

function parseOptions(value) {
  return String(value || '')
    .split(',')
    .map(option => option.trim())
    .filter(Boolean);
}

function toTitleCase(value) {
  return String(value || '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/[-_]+/g, ' ')
    .replace(/^./, character => character.toUpperCase())
    .trim();
}
