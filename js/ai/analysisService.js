import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseClient, isSupabaseConfigured } from '../supabaseClient.js';
import { getCurrentUser } from '../authService.js';
import { findDefaultPromptById } from './promptRegistry.js';
import { findPromptDefinitionById, loadAvailablePrompts } from './promptStorage.js';
import { loadPromptTemplate, renderPromptTemplate } from './promptTemplateRenderer.js';
import { AnalysisGenerationError, createAnalysisError, getErrorCodeFromGeminiPayload, getErrorMessageFromGeminiPayload, getStatusCodeFromGeminiPayload, isRetryableAnalysisError } from './geminiErrorHandler.js';

const ANALYSIS_FUNCTION_NAME = 'generate-company-analysis';
const LOCAL_ANALYSIS_STORAGE_KEY = 'stockTrackerAnalysisReports';
const MAX_LOCAL_REPORTS = 25;
const MAX_ANALYSIS_RETRY_ATTEMPTS = 3;
const ANALYSIS_RETRY_DELAYS_MS = [2000, 5000, 10000];

export async function generateCompanyAnalysis(promptId, parameters = {}) {
  if (!isSupabaseConfigured() || !supabaseClient) {
    throw new Error('Supabase must be configured before AI analysis can run.');
  }

  const promptDefinition = await findPromptDefinitionById(promptId);
  if (!promptDefinition) throw new Error('Selected analysis prompt was not found.');
  const promptTemplate = await loadPromptTemplate(promptDefinition);
  const promptText = renderPromptTemplate(promptTemplate, parameters);

  try {
    const data = await invokeAnalysisFunctionWithRetry({ promptId, promptText, parameters });
    const result = data?.result || data?.analysis || data?.text || '';

    if (!String(result).trim()) {
      throw new AnalysisGenerationError({
        title: 'Empty AI response',
        message: 'Google AI returned an empty analysis. Try again or reduce the prompt complexity.',
        retryable: true
      });
    }

    const report = createAnalysisReport({
      promptId,
      promptTitle: promptDefinition.title,
      parameters,
      resultMarkdown: result,
      status: 'completed'
    });

    await saveAnalysisReport(report);
    return report;
  } catch (error) {
    const analysisError = createAnalysisError(error);
    const failedReport = createAnalysisReport({
      promptId,
      promptTitle: promptDefinition.title,
      parameters,
      resultMarkdown: '',
      status: 'failed',
      errorCode: analysisError.status || analysisError.code || 'UNKNOWN',
      errorMessage: analysisError.userMessage
    });

    await saveAnalysisReport(failedReport);
    analysisError.failedReport = failedReport;
    throw analysisError;
  }
}

async function invokeAnalysisFunctionWithRetry(requestBody) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ANALYSIS_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await invokeAnalysisFunction(requestBody, attempt);
    } catch (error) {
      lastError = createAnalysisError(error);

      if (!isRetryableAnalysisError(lastError) || attempt === MAX_ANALYSIS_RETRY_ATTEMPTS) {
        throw lastError;
      }

      await delay(ANALYSIS_RETRY_DELAYS_MS[attempt - 1] || 10000);
    }
  }

  throw lastError;
}

async function invokeAnalysisFunction(requestBody, attemptNumber = 1) {
  const endpoint = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/${ANALYSIS_FUNCTION_NAME}`;
  const session = await supabaseClient.auth.getSession().catch(() => ({ data: { session: null } }));
  const accessToken = session?.data?.session?.access_token || SUPABASE_ANON_KEY;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'x-client-info': `stock-tracker-analysis-attempt-${attemptNumber}`
    },
    body: JSON.stringify(requestBody)
  });

  const data = await readJsonResponse(response);

  if (!response.ok || data?.success === false || data?.error) {
    throw createAnalysisError({
      status: getStatusCodeFromGeminiPayload(data) || response.status,
      code: getErrorCodeFromGeminiPayload(data) || response.statusText,
      message: getErrorMessageFromGeminiPayload(data) || data?.message || data?.error || response.statusText,
      details: data,
      rawError: data
    });
  }

  return data;
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch (error) {
    return {
      success: false,
      message: text,
      parseError: error instanceof Error ? error.message : String(error)
    };
  }
}

function createAnalysisReport({ promptId, promptTitle, parameters = {}, resultMarkdown = '', status = 'completed', errorCode = '', errorMessage = '' }) {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    promptId,
    promptTitle,
    ticker: parameters.ticker || '',
    companyName: parameters.companyName || '',
    parameters,
    resultMarkdown,
    status,
    errorCode: String(errorCode || ''),
    errorMessage: String(errorMessage || ''),
    createdAt: new Date().toISOString()
  };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function saveAnalysisReport(report) {
  saveAnalysisReportToLocalStorage(report);

  if (!isSupabaseConfigured() || !supabaseClient) return;

  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  try {
    const { data, error } = await supabaseClient
      .from('analysis_reports')
      .insert(buildSupabaseAnalysisReportPayload(report, currentUser.id))
      .select('id')
      .single();

    if (error?.code === 'PGRST204') {
      await saveAnalysisReportUsingLegacyColumns(report, currentUser.id);
      return;
    }

    if (error) throw error;

    if (data?.id) {
      report.supabaseId = data.id;
      updateLocalAnalysisReport(report);
    }
  } catch (error) {
    // Keep the generated report visible even if the optional persistence table is not available yet.
    console.warn('AI report saved locally, but Supabase persistence failed.', error);
  }
}


function buildSupabaseAnalysisReportPayload(report, userId) {
  return {
    user_id: userId,
    ticker: report.ticker,
    company_name: report.companyName,
    prompt_id: report.promptId,
    parameters: report.parameters,
    result_markdown: report.resultMarkdown || '',
    status: report.status || 'completed',
    error_code: report.errorCode || null,
    error_message: report.errorMessage || null,
    created_at: report.createdAt
  };
}

async function saveAnalysisReportUsingLegacyColumns(report, userId) {
  const { data, error } = await supabaseClient
    .from('analysis_reports')
    .insert({
      user_id: userId,
      ticker: report.ticker,
      company_name: report.companyName,
      prompt_id: report.promptId,
      parameters: {
        ...(report.parameters || {}),
        analysisStatus: report.status || 'completed',
        analysisErrorCode: report.errorCode || '',
        analysisErrorMessage: report.errorMessage || ''
      },
      result_markdown: report.resultMarkdown || '',
      created_at: report.createdAt
    })
    .select('id')
    .single();

  if (error) throw error;

  if (data?.id) {
    report.supabaseId = data.id;
    updateLocalAnalysisReport(report);
  }
}


export async function loadAnalysisReports() {
  const { reports } = await loadAnalysisReportsWithStatus();
  return reports;
}

export async function loadAnalysisReportsWithStatus() {
  const localReports = loadLocalAnalysisReports();
  const status = {
    source: 'local',
    localCount: localReports.length,
    remoteCount: 0,
    userEmail: '',
    warning: '',
    error: null
  };

  if (!isSupabaseConfigured() || !supabaseClient) {
    status.warning = 'Supabase is not configured. Showing local saved reports only.';
    return { reports: localReports, status };
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    status.warning = 'You are not signed in. Supabase analysis reports cannot be loaded yet.';
    return { reports: localReports, status };
  }

  status.userEmail = currentUser.email || '';

  try {
    const { data, error } = await selectSupabaseAnalysisReports(currentUser.id);

    if (error) throw error;

    const promptMap = await loadPromptTitleMap();
    const remoteReports = (data || []).map(row => mapSupabaseAnalysisReport(row, promptMap));
    status.source = 'supabase';
    status.remoteCount = remoteReports.length;

    if (remoteReports.length === 0) {
      status.warning = 'Supabase returned 0 reports for the signed-in user. If you see rows in the table, verify their user_id matches this user and that SELECT RLS policy is enabled.';
    }

    return { reports: mergeReports(remoteReports, localReports), status };
  } catch (error) {
    console.warn('Unable to load Supabase AI reports. Falling back to local reports.', error);
    status.error = error;
    status.warning = `Unable to load Supabase analysis reports: ${getSupabaseErrorMessage(error)}. Showing local saved reports only.`;
    return { reports: localReports, status };
  }
}

export async function deleteAnalysisReport(reportId) {
  deleteLocalAnalysisReport(reportId);

  if (!isSupabaseConfigured() || !supabaseClient) return;

  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  try {
    const { error } = await supabaseClient
      .from('analysis_reports')
      .delete()
      .eq('id', reportId);

    if (error) throw error;
  } catch (error) {
    console.warn('Unable to delete AI report from Supabase. Local copy was removed.', error);
  }
}

export function loadLocalAnalysisReports() {
  try {
    const storedReports = localStorage.getItem(LOCAL_ANALYSIS_STORAGE_KEY);
    const parsedReports = storedReports ? JSON.parse(storedReports) : [];
    return Array.isArray(parsedReports) ? parsedReports : [];
  } catch (error) {
    console.error('Unable to read local AI analysis reports.', error);
    return [];
  }
}

function saveAnalysisReportToLocalStorage(report) {
  const reports = [report, ...loadLocalAnalysisReports()].slice(0, MAX_LOCAL_REPORTS);
  localStorage.setItem(LOCAL_ANALYSIS_STORAGE_KEY, JSON.stringify(reports, null, 2));
}


function updateLocalAnalysisReport(updatedReport) {
  const reports = loadLocalAnalysisReports();
  const nextReports = reports.map(report => report.id === updatedReport.id ? updatedReport : report);
  localStorage.setItem(LOCAL_ANALYSIS_STORAGE_KEY, JSON.stringify(nextReports, null, 2));
}

function deleteLocalAnalysisReport(reportId) {
  const reports = loadLocalAnalysisReports().filter(report => report.id !== reportId && report.supabaseId !== reportId);
  localStorage.setItem(LOCAL_ANALYSIS_STORAGE_KEY, JSON.stringify(reports, null, 2));
}


async function selectSupabaseAnalysisReports(userId) {
  const extendedResult = await supabaseClient
    .from('analysis_reports')
    .select('id, user_id, ticker, company_name, prompt_id, parameters, result_markdown, status, error_code, error_message, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (!extendedResult.error?.message?.includes('status') && extendedResult.error?.code !== 'PGRST204') {
    return extendedResult;
  }

  return supabaseClient
    .from('analysis_reports')
    .select('id, user_id, ticker, company_name, prompt_id, parameters, result_markdown, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
}

function getSupabaseErrorMessage(error) {
  if (!error) return 'Unknown error';
  return error.message || error.details || String(error);
}

function mapSupabaseAnalysisReport(row, promptMap = new Map()) {
  const promptDefinition = promptMap.get(row.prompt_id) || findDefaultPromptById(row.prompt_id);

  return {
    id: row.id,
    supabaseId: row.id,
    promptId: row.prompt_id,
    promptTitle: promptDefinition.title,
    ticker: row.ticker || row.parameters?.ticker || '',
    companyName: row.company_name || row.parameters?.companyName || '',
    parameters: row.parameters || {},
    resultMarkdown: row.result_markdown || '',
    status: row.status || row.parameters?.analysisStatus || 'completed',
    errorCode: row.error_code || row.parameters?.analysisErrorCode || '',
    errorMessage: row.error_message || row.parameters?.analysisErrorMessage || '',
    createdAt: row.created_at
  };
}

async function loadPromptTitleMap() {
  try {
    const prompts = await loadAvailablePrompts();
    return new Map(prompts.map(prompt => [prompt.id, prompt]));
  } catch (error) {
    console.warn('Unable to load prompt titles for reports.', error);
    return new Map();
  }
}

function mergeReports(primaryReports, fallbackReports) {
  const seenKeys = new Set();
  const mergedReports = [];

  [...primaryReports, ...fallbackReports].forEach(report => {
    const key = report.supabaseId || report.id || `${report.promptId}-${report.createdAt}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    mergedReports.push(report);
  });

  return mergedReports.sort((firstReport, secondReport) =>
    new Date(secondReport.createdAt || 0).getTime() - new Date(firstReport.createdAt || 0).getTime()
  );
}
