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
    const { error } = await supabaseClient
      .from('analysis_reports')
      .insert({
        user_id: currentUser.id,
        ticker: report.ticker,
        company_name: report.companyName,
        prompt_id: report.promptId,
        parameters: report.parameters,
        result_markdown: report.resultMarkdown,
        created_at: report.createdAt
      });

    if (error) throw error;
  } catch (error) {
    // Keep the generated report visible even if the optional persistence table is not available yet.
    console.warn('AI report saved locally, but Supabase persistence failed.', error);
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
