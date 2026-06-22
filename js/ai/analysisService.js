import { supabaseClient, isSupabaseConfigured } from '../supabaseClient.js';
import { getCurrentUser } from '../authService.js';
import { findPromptById } from './promptRegistry.js';
import { loadPromptTemplate, renderPromptTemplate } from './promptTemplateRenderer.js';

const ANALYSIS_FUNCTION_NAME = 'generate-company-analysis';
const LOCAL_ANALYSIS_STORAGE_KEY = 'stockTrackerAnalysisReports';
const MAX_LOCAL_REPORTS = 25;

export async function generateCompanyAnalysis(promptId, parameters = {}) {
  if (!isSupabaseConfigured() || !supabaseClient) {
    throw new Error('Supabase must be configured before AI analysis can run.');
  }

  const promptDefinition = findPromptById(promptId);
  const promptTemplate = await loadPromptTemplate(promptDefinition);
  const promptText = renderPromptTemplate(promptTemplate, parameters);

  const { data, error } = await supabaseClient.functions.invoke(ANALYSIS_FUNCTION_NAME, {
    body: {
      promptId,
      promptText,
      parameters
    }
  });

  if (error) {
    throw new Error(error.message || 'AI analysis function is not reachable.');
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  const result = data?.result || data?.analysis || data?.text || '';
  if (!String(result).trim()) {
    throw new Error('AI analysis returned an empty result.');
  }

  const report = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    promptId,
    promptTitle: promptDefinition.title,
    ticker: parameters.ticker || '',
    companyName: parameters.companyName || '',
    parameters,
    resultMarkdown: result,
    createdAt: new Date().toISOString()
  };

  await saveAnalysisReport(report);
  return report;
}

export async function saveAnalysisReport(report) {
  saveAnalysisReportToLocalStorage(report);

  if (!isSupabaseConfigured() || !supabaseClient) return;

  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  try {
    const { data, error } = await supabaseClient
      .from('analysis_reports')
      .insert({
        user_id: currentUser.id,
        ticker: report.ticker,
        company_name: report.companyName,
        prompt_id: report.promptId,
        parameters: report.parameters,
        result_markdown: report.resultMarkdown,
        created_at: report.createdAt
      })
      .select('id')
      .single();

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
    const { data, error } = await supabaseClient
      .from('analysis_reports')
      .select('id, user_id, ticker, company_name, prompt_id, parameters, result_markdown, created_at')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const remoteReports = (data || []).map(mapSupabaseAnalysisReport);
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


function getSupabaseErrorMessage(error) {
  if (!error) return 'Unknown error';
  return error.message || error.details || String(error);
}

function mapSupabaseAnalysisReport(row) {
  const promptDefinition = findPromptById(row.prompt_id);

  return {
    id: row.id,
    supabaseId: row.id,
    promptId: row.prompt_id,
    promptTitle: promptDefinition.title,
    ticker: row.ticker || row.parameters?.ticker || '',
    companyName: row.company_name || row.parameters?.companyName || '',
    parameters: row.parameters || {},
    resultMarkdown: row.result_markdown || '',
    createdAt: row.created_at
  };
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
