import {
  createBlankPromptDraft,
  deleteCustomPrompt,
  duplicateDefaultPrompt,
  loadAvailablePrompts,
  loadPromptForEditor,
  normalizePromptParameters,
  savePromptDefinition
} from '../ai/promptStorage.js';
import { getErrorMessage, setButtonProcessing } from '../utils/dom.js';

const PARAMETER_TYPES = ['text', 'textarea', 'number', 'date', 'select'];

let promptEditorState = {
  initialized: false,
  prompts: [],
  currentPrompt: createBlankPromptDraft(),
  isNewPrompt: true
};

export async function initializePromptEditor() {
  const form = document.querySelector('#promptEditorForm');
  if (!form || promptEditorState.initialized) return;

  promptEditorState.initialized = true;
  bindPromptEditorEvents(form);
  await refreshPromptEditorPromptList();
  await loadPromptIntoEditor('');
}

export async function refreshPromptEditorPromptList(preferredPromptId = '') {
  const promptSelect = document.querySelector('#promptEditorSelect');
  if (!promptSelect) return;

  promptEditorState.prompts = await loadAvailablePrompts();
  promptSelect.replaceChildren(
    createOption('', 'Create new blank prompt'),
    ...promptEditorState.prompts.map(prompt => createOption(prompt.id, `${prompt.title}${prompt.isCustom ? ' · Custom' : ' · Default'}`))
  );

  if (preferredPromptId && [...promptSelect.options].some(option => option.value === preferredPromptId)) {
    promptSelect.value = preferredPromptId;
  }
}

function bindPromptEditorEvents(form) {
  document.querySelector('#promptEditorSelect')?.addEventListener('change', event => loadPromptIntoEditor(event.currentTarget.value));
  document.querySelector('#promptEditorNewButton')?.addEventListener('click', () => loadPromptIntoEditor(''));
  document.querySelector('#promptEditorDuplicateButton')?.addEventListener('click', handleDuplicatePrompt);
  document.querySelector('#promptEditorDeleteButton')?.addEventListener('click', handleDeletePrompt);
  document.querySelector('#promptParameterAddButton')?.addEventListener('click', () => addParameterRow());
  form.addEventListener('submit', handlePromptSave);
  form.addEventListener('input', updatePromptEditorPreview);
  form.addEventListener('change', updatePromptEditorPreview);
}

async function loadPromptIntoEditor(promptId) {
  const selectedPrompt = promptId ? await loadPromptForEditor(promptId) : createBlankPromptDraft();
  promptEditorState.currentPrompt = selectedPrompt;
  promptEditorState.isNewPrompt = !promptId || !selectedPrompt.isCustom;
  renderPromptEditorForm(selectedPrompt);
}

function renderPromptEditorForm(prompt) {
  setInputValue('#promptEditorId', prompt.isCustom ? prompt.id : '');
  setInputValue('#promptEditorTitle', prompt.isDefault ? `${prompt.title} Custom Copy` : prompt.title);
  setInputValue('#promptEditorCategory', prompt.category || (prompt.isDefault ? 'Default copy' : 'Custom'));
  setInputValue('#promptEditorDescription', prompt.description || '');
  setInputValue('#promptEditorText', prompt.promptText || '');

  const defaultNotice = document.querySelector('#promptEditorDefaultNotice');
  if (defaultNotice) {
    defaultNotice.hidden = !prompt.isDefault;
    defaultNotice.textContent = prompt.isDefault
      ? 'Default prompts are read-only. Saving will create a custom editable copy.'
      : '';
  }

  const deleteButton = document.querySelector('#promptEditorDeleteButton');
  if (deleteButton) deleteButton.disabled = !prompt.isCustom;

  const duplicateButton = document.querySelector('#promptEditorDuplicateButton');
  if (duplicateButton) duplicateButton.disabled = !prompt.id;

  renderParameterRows(normalizePromptParameters(prompt.parameters || []));
  updatePromptEditorPreview();
}

function renderParameterRows(parameters) {
  const container = document.querySelector('#promptParameterRows');
  if (!container) return;

  container.replaceChildren(...parameters.map(createParameterRow));
  if (!parameters.length) {
    addParameterRow({ name: 'ticker', label: 'Ticker', type: 'text', placeholder: 'AAPL', required: true });
  }
}

function createParameterRow(parameter = {}) {
  const row = document.createElement('div');
  row.className = 'prompt-parameter-row';

  row.append(
    createSmallInput('name', parameter.name || '', 'name'),
    createSmallInput('label', parameter.label || '', 'Label'),
    createTypeSelect(parameter.type || 'text'),
    createSmallInput('placeholder', parameter.placeholder || '', 'Placeholder'),
    createSmallInput('options', Array.isArray(parameter.options) ? parameter.options.join(', ') : '', 'Options, comma separated'),
    createRequiredCheckbox(parameter.required),
    createRemoveButton()
  );

  row.addEventListener('input', updatePromptEditorPreview);
  row.addEventListener('change', updatePromptEditorPreview);
  return row;
}

function addParameterRow(parameter = {}) {
  const container = document.querySelector('#promptParameterRows');
  if (!container) return;
  container.append(createParameterRow(parameter));
}

function createSmallInput(name, value, placeholder) {
  const input = document.createElement('input');
  input.name = name;
  input.value = value;
  input.placeholder = placeholder;
  return input;
}

function createTypeSelect(selectedType) {
  const select = document.createElement('select');
  select.name = 'type';
  select.append(...PARAMETER_TYPES.map(type => createOption(type, type)));
  select.value = selectedType;
  return select;
}

function createRequiredCheckbox(checked) {
  const label = document.createElement('label');
  label.className = 'prompt-parameter-required';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.name = 'required';
  input.checked = Boolean(checked);
  label.append(input, document.createTextNode(' Required'));
  return label;
}

function createRemoveButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary-button compact-button';
  button.textContent = 'Remove';
  button.addEventListener('click', event => {
    event.currentTarget.closest('.prompt-parameter-row')?.remove();
    updatePromptEditorPreview();
  });
  return button;
}

async function handlePromptSave(event) {
  event.preventDefault();

  const submitButton = event.currentTarget.querySelector('button[type="submit"]');
  setButtonProcessing(submitButton, true, 'Saving...');

  try {
    const promptDraft = collectPromptEditorDraft();
    const savedPrompt = await savePromptDefinition(promptDraft);
    setPromptEditorStatus('Prompt saved. It is now available in the analysis dropdown.', 'success');
    await refreshPromptEditorPromptList(savedPrompt.id);
    await loadPromptIntoEditor(savedPrompt.id);
    window.dispatchEvent(new CustomEvent('analysis-prompts-changed', { detail: { promptId: savedPrompt.id } }));
  } catch (error) {
    setPromptEditorStatus(`Prompt save failed: ${getErrorMessage(error)}`, 'error');
  } finally {
    setButtonProcessing(submitButton, false);
  }
}

async function handleDuplicatePrompt() {
  const promptId = document.querySelector('#promptEditorSelect')?.value;
  if (!promptId) return;

  try {
    const duplicate = await duplicateDefaultPrompt(promptId);
    promptEditorState.currentPrompt = duplicate;
    renderPromptEditorForm(duplicate);
    setPromptEditorStatus('Prompt duplicated. Review and save the custom copy.', 'info');
  } catch (error) {
    setPromptEditorStatus(`Unable to duplicate prompt: ${getErrorMessage(error)}`, 'error');
  }
}

async function handleDeletePrompt() {
  const promptId = document.querySelector('#promptEditorId')?.value;
  const title = document.querySelector('#promptEditorTitle')?.value || 'this custom prompt';
  if (!promptId) return;

  if (!confirm(`Delete ${title}? Reports already generated from this prompt will stay saved.`)) return;

  try {
    await deleteCustomPrompt(promptId);
    setPromptEditorStatus('Custom prompt deleted.', 'success');
    await refreshPromptEditorPromptList();
    await loadPromptIntoEditor('');
    window.dispatchEvent(new CustomEvent('analysis-prompts-changed'));
  } catch (error) {
    setPromptEditorStatus(`Unable to delete prompt: ${getErrorMessage(error)}`, 'error');
  }
}

function collectPromptEditorDraft() {
  return {
    id: document.querySelector('#promptEditorId')?.value || '',
    title: document.querySelector('#promptEditorTitle')?.value || '',
    category: document.querySelector('#promptEditorCategory')?.value || 'Custom',
    description: document.querySelector('#promptEditorDescription')?.value || '',
    promptText: document.querySelector('#promptEditorText')?.value || '',
    parameters: collectParameterRows(),
    isCustom: true,
    isDefault: false
  };
}

function collectParameterRows() {
  return [...document.querySelectorAll('.prompt-parameter-row')].map(row => {
    const parameter = {
      name: row.querySelector('[name="name"]')?.value || '',
      label: row.querySelector('[name="label"]')?.value || '',
      type: row.querySelector('[name="type"]')?.value || 'text',
      placeholder: row.querySelector('[name="placeholder"]')?.value || '',
      options: String(row.querySelector('[name="options"]')?.value || '').split(',').map(option => option.trim()).filter(Boolean),
      required: Boolean(row.querySelector('[name="required"]')?.checked)
    };
    return parameter;
  }).filter(parameter => parameter.name.trim());
}

function updatePromptEditorPreview() {
  const preview = document.querySelector('#promptEditorPreview');
  if (!preview) return;

  const draft = collectPromptEditorDraft();
  const parameterList = draft.parameters.length
    ? draft.parameters.map(parameter => `{{${parameter.name}}}`).join(', ')
    : 'No parameters defined';

  preview.textContent = `Title: ${draft.title || 'Untitled custom prompt'}\nParameters: ${parameterList}\n\n${draft.promptText || 'Write your prompt text here.'}`;
}

function setPromptEditorStatus(message, type = 'info') {
  const status = document.querySelector('#promptEditorStatus');
  if (!status) return;
  status.hidden = false;
  status.className = `message-box ${type}`;
  status.textContent = message;
}

function setInputValue(selector, value) {
  const input = document.querySelector(selector);
  if (!input) return;
  input.value = value || '';
}

function createOption(value, text) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = text;
  return option;
}
