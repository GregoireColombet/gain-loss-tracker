import { loadAvailablePrompts, getParameterDefinition, normalizePromptParameters } from '../ai/promptStorage.js';
import { loadPromptTemplate, renderPromptTemplate } from '../ai/promptTemplateRenderer.js';
import { generateCompanyAnalysis } from '../ai/analysisService.js';
import { renderAnalysisReportViewer } from './analysisReportViewer.js';
import { renderAnalysisErrorCard } from './analysisErrorCard.js';
import { createOption } from './components.js';
import { getErrorMessage, setButtonProcessing } from '../utils/dom.js';
import { getAnalysisErrorDisplay } from '../ai/geminiErrorHandler.js';

let aiPanelState = {
  transactions: [],
  prompts: [],
  selectedPrompt: null,
  initialized: false
};

export async function initializeAiAnalysisPanel({ getTransactions }) {
  const form = document.querySelector('#aiAnalysisForm');
  if (!form || aiPanelState.initialized) return;

  aiPanelState.initialized = true;
  aiPanelState.getTransactions = getTransactions;

  bindAiPanelEvents(form);
  refreshAiCompanyOptions(getTransactions());
  await refreshAiPromptOptions();
}

export function refreshAiCompanyOptions(transactions) {
  aiPanelState.transactions = Array.isArray(transactions) ? transactions : [];

  const companySelect = document.querySelector('#aiCompanySelect');
  if (!companySelect) return;

  const previousValue = companySelect.value;
  const uniqueCompanies = getUniqueCompanies(aiPanelState.transactions);

  companySelect.replaceChildren(
    createOption('', 'Manual company / ticker'),
    ...uniqueCompanies.map(company => createOption(company.ticker, `${company.companyName} (${company.ticker})`))
  );

  if ([...companySelect.options].some(option => option.value === previousValue)) {
    companySelect.value = previousValue;
  }
}

export async function refreshAiPromptOptions(preferredPromptId = '') {
  const promptSelect = document.querySelector('#aiPromptSelect');
  if (!promptSelect) return;

  const previousValue = preferredPromptId || promptSelect.value;
  aiPanelState.prompts = await loadAvailablePrompts();

  promptSelect.replaceChildren(
    ...aiPanelState.prompts.map(prompt => createOption(prompt.id, `${prompt.title}${prompt.isCustom ? ' · Custom' : ''}`))
  );

  if (previousValue && [...promptSelect.options].some(option => option.value === previousValue)) {
    promptSelect.value = previousValue;
  }

  await renderDynamicParameterFields();
}

function bindAiPanelEvents(form) {
  document.querySelector('#aiPromptSelect')?.addEventListener('change', renderDynamicParameterFields);
  document.querySelector('#aiCompanySelect')?.addEventListener('change', handleAiCompanySelection);
  form.addEventListener('submit', handleAiAnalysisSubmit);

  window.addEventListener('analysis-prompts-changed', event => {
    refreshAiPromptOptions(event.detail?.promptId || '').catch(error => {
      setAiStatus(`Unable to refresh prompts: ${getErrorMessage(error)}`, 'error');
    });
  });
}

function handleAiCompanySelection(event) {
  const selectedTicker = event.currentTarget.value;
  if (!selectedTicker) return;

  const selectedCompany = getUniqueCompanies(aiPanelState.transactions)
    .find(company => company.ticker === selectedTicker);
  if (!selectedCompany) return;

  setParameterFieldValue('companyName', selectedCompany.companyName);
  setParameterFieldValue('ticker', selectedCompany.ticker);
  renderSelectedPromptPreview();
}

async function renderDynamicParameterFields() {
  const promptSelect = document.querySelector('#aiPromptSelect');
  const descriptionElement = document.querySelector('#aiPromptDescription');
  const fieldsContainer = document.querySelector('#aiParameterFields');
  if (!promptSelect || !fieldsContainer) return;

  const selectedPrompt = aiPanelState.prompts.find(prompt => prompt.id === promptSelect.value) || aiPanelState.prompts[0] || null;
  aiPanelState.selectedPrompt = selectedPrompt;

  if (descriptionElement) {
    descriptionElement.textContent = selectedPrompt
      ? `${selectedPrompt.description || 'Custom analysis prompt.'}${selectedPrompt.isCustom ? ' This is a custom prompt.' : ''}`
      : 'No prompt available.';
  }

  const parameters = normalizePromptParameters(selectedPrompt?.parameters || []);
  fieldsContainer.replaceChildren(...parameters.map(createParameterField));
  await renderSelectedPromptPreview();
}

function createParameterField(parameterDefinition) {
  const definition = typeof parameterDefinition === 'string'
    ? getParameterDefinition(parameterDefinition)
    : parameterDefinition;
  const parameterName = typeof parameterDefinition === 'string' ? parameterDefinition : parameterDefinition.name;

  const label = document.createElement('label');
  label.dataset.aiParameter = parameterName;
  label.textContent = definition.label || parameterName;

  let input;
  if (definition.type === 'textarea') {
    input = document.createElement('textarea');
    input.rows = 3;
  } else if (definition.type === 'select') {
    input = document.createElement('select');
    input.append(createOption('', 'Select...'), ...(definition.options || []).map(option => createOption(option, option)));
  } else {
    input = document.createElement('input');
    input.type = definition.type || 'text';
  }

  input.name = parameterName;
  input.placeholder = definition.placeholder || '';
  input.required = Boolean(definition.required);
  input.addEventListener('input', debounce(renderSelectedPromptPreview, 250));
  input.addEventListener('change', renderSelectedPromptPreview);
  label.append(input);

  return label;
}

async function renderSelectedPromptPreview() {
  const previewElement = document.querySelector('#aiPromptPreview');
  const detailsElement = document.querySelector('#aiPromptPreviewDetails');
  if (!previewElement || !aiPanelState.selectedPrompt) return;

  try {
    const form = document.querySelector('#aiAnalysisForm');
    const parameters = form ? collectPromptParameters(new FormData(form)) : {};
    const template = await loadPromptTemplate(aiPanelState.selectedPrompt);
    const renderedPreview = renderPromptTemplate(template, parameters);
    previewElement.textContent = renderedPreview;
    if (detailsElement) {
      detailsElement.querySelector('summary').textContent = `Read selected prompt: ${aiPanelState.selectedPrompt.title}`;
    }
  } catch (error) {
    previewElement.textContent = `Unable to load selected prompt: ${getErrorMessage(error)}`;
  }
}

async function handleAiAnalysisSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  const resultElement = document.querySelector('#analysisReportViewer');
  const statusElement = document.querySelector('#aiAnalysisStatus');

  setAiStatus('Generating analysis with Gemini...', 'info');
  setButtonProcessing(submitButton, true, 'Generating...');

  try {
    const formData = new FormData(form);
    const promptId = String(formData.get('promptId') || '').trim();
    const parameters = collectPromptParameters(formData);

    const report = await generateCompanyAnalysis(promptId, parameters);
    renderAnalysisReportViewer(report, resultElement);
    window.dispatchEvent(new CustomEvent('analysis-report-saved', { detail: { report } }));
    setAiStatus('Analysis generated and saved.', 'success');
  } catch (error) {
    const display = getAnalysisErrorDisplay(error);
    renderAnalysisErrorCard(error, resultElement, {
      onRetry: () => form.requestSubmit()
    });

    if (display.failedReport) {
      window.dispatchEvent(new CustomEvent('analysis-report-saved', { detail: { report: display.failedReport } }));
    }

    setAiStatus(`${display.title}: ${display.message}`, 'error');
  } finally {
    setButtonProcessing(submitButton, false);
    if (statusElement) statusElement.hidden = false;
  }
}

function collectPromptParameters(formData) {
  const parameters = Object.fromEntries(formData.entries());
  delete parameters.promptId;
  delete parameters.selectedCompany;

  const extraInstructions = String(formData.get('extraInstructions') || '').trim();
  if (extraInstructions) parameters.extraInstructions = extraInstructions;

  return parameters;
}

function setAiStatus(message, type = 'info') {
  const statusElement = document.querySelector('#aiAnalysisStatus');
  if (!statusElement) return;

  statusElement.hidden = false;
  statusElement.className = `message-box ${type}`;
  statusElement.textContent = message;
}

function setParameterFieldValue(parameterName, value) {
  const input = document.querySelector(`#aiParameterFields [name="${parameterName}"]`);
  if (input) input.value = value;
}

function getUniqueCompanies(transactions) {
  const companyMap = new Map();

  transactions.forEach(transaction => {
    const ticker = String(transaction.ticker || '').trim().toUpperCase();
    if (!ticker) return;

    companyMap.set(ticker, {
      ticker,
      companyName: String(transaction.companyName || ticker).trim()
    });
  });

  return [...companyMap.values()].sort((firstCompany, secondCompany) =>
    firstCompany.companyName.localeCompare(secondCompany.companyName, undefined, {
      sensitivity: 'base',
      numeric: true
    })
  );
}


function debounce(callback, waitMs) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => callback(...args), waitMs);
  };
}
