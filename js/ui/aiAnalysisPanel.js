import { ANALYSIS_PROMPTS, PARAMETER_DEFINITIONS, findPromptById } from '../ai/promptRegistry.js';
import { generateCompanyAnalysis } from '../ai/analysisService.js';
import { renderAnalysisReportViewer } from './analysisReportViewer.js';
import { getErrorMessage, setButtonProcessing } from '../utils/dom.js';

let aiPanelState = {
  transactions: [],
  initialized: false
};

export function initializeAiAnalysisPanel({ getTransactions }) {
  const form = document.querySelector('#aiAnalysisForm');
  if (!form || aiPanelState.initialized) return;

  aiPanelState.initialized = true;
  aiPanelState.getTransactions = getTransactions;

  populatePromptSelect();
  bindAiPanelEvents(form);
  refreshAiCompanyOptions(getTransactions());
  renderDynamicParameterFields();
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

function populatePromptSelect() {
  const promptSelect = document.querySelector('#aiPromptSelect');
  if (!promptSelect) return;

  promptSelect.replaceChildren(
    ...ANALYSIS_PROMPTS.map(prompt => createOption(prompt.id, prompt.title))
  );
}

function bindAiPanelEvents(form) {
  document.querySelector('#aiPromptSelect')?.addEventListener('change', renderDynamicParameterFields);
  document.querySelector('#aiCompanySelect')?.addEventListener('change', handleAiCompanySelection);
  form.addEventListener('submit', handleAiAnalysisSubmit);
}

function handleAiCompanySelection(event) {
  const selectedTicker = event.currentTarget.value;
  if (!selectedTicker) return;

  const selectedCompany = getUniqueCompanies(aiPanelState.transactions)
    .find(company => company.ticker === selectedTicker);
  if (!selectedCompany) return;

  setParameterFieldValue('companyName', selectedCompany.companyName);
  setParameterFieldValue('ticker', selectedCompany.ticker);
}

function renderDynamicParameterFields() {
  const promptSelect = document.querySelector('#aiPromptSelect');
  const descriptionElement = document.querySelector('#aiPromptDescription');
  const fieldsContainer = document.querySelector('#aiParameterFields');
  if (!promptSelect || !fieldsContainer) return;

  const selectedPrompt = findPromptById(promptSelect.value);
  if (descriptionElement) descriptionElement.textContent = selectedPrompt.description;

  fieldsContainer.replaceChildren(
    ...selectedPrompt.parameters.map(parameterName => createParameterField(parameterName))
  );
}

function createParameterField(parameterName) {
  const definition = PARAMETER_DEFINITIONS[parameterName] || {
    label: parameterName,
    type: 'text',
    placeholder: '',
    required: false
  };

  const label = document.createElement('label');
  label.dataset.aiParameter = parameterName;
  label.textContent = definition.label;

  let input;
  if (definition.type === 'textarea') {
    input = document.createElement('textarea');
    input.rows = 3;
  } else if (definition.type === 'select') {
    input = document.createElement('select');
    input.append(...(definition.options || []).map(option => createOption(option, option)));
  } else {
    input = document.createElement('input');
    input.type = definition.type || 'text';
  }

  input.name = parameterName;
  input.placeholder = definition.placeholder || '';
  input.required = Boolean(definition.required);
  label.append(input);

  return label;
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
    const parameters = Object.fromEntries(formData.entries());
    delete parameters.promptId;

    const extraInstructions = String(formData.get('extraInstructions') || '').trim();
    if (extraInstructions) parameters.extraInstructions = extraInstructions;

    const report = await generateCompanyAnalysis(promptId, parameters);
    renderAnalysisReportViewer(report, resultElement);
    window.dispatchEvent(new CustomEvent('analysis-report-saved', { detail: { report } }));
    setAiStatus('Analysis generated and saved.', 'success');
  } catch (error) {
    setAiStatus(`Analysis failed: ${getErrorMessage(error)}`, 'error');
  } finally {
    setButtonProcessing(submitButton, false);
    if (statusElement) statusElement.hidden = false;
  }
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

function createOption(value, text) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = text;
  return option;
}
