import { getAnalysisErrorDisplay } from '../ai/geminiErrorHandler.js';
import { createMetaPill } from './components.js';

export function renderAnalysisErrorCard(error, container = document.querySelector('#analysisReportViewer'), { onRetry } = {}) {
  if (!container) return;

  const display = getAnalysisErrorDisplay(error);
  const card = document.createElement('article');
  card.className = 'analysis-error-card';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'analysis-error-eyebrow';
  eyebrow.textContent = getErrorEyebrow(display);

  const title = document.createElement('h2');
  title.textContent = display.title;

  const message = document.createElement('p');
  message.className = 'analysis-error-message';
  message.textContent = display.message;

  const meta = document.createElement('div');
  meta.className = 'analysis-error-meta';
  if (display.status) meta.append(createMetaPill('HTTP', display.status, 'analysis-error-pill'));
  if (display.code) meta.append(createMetaPill('Code', display.code, 'analysis-error-pill'));
  meta.append(createMetaPill('Retryable', display.retryable ? 'Yes' : 'No', 'analysis-error-pill'));

  const actionList = document.createElement('ul');
  actionList.className = 'analysis-error-actions-list';
  getSuggestedActions(display).forEach(action => {
    const item = document.createElement('li');
    item.textContent = action;
    actionList.append(item);
  });

  card.append(eyebrow, title, message, meta, actionList);

  if (display.retryable && typeof onRetry === 'function') {
    const retryButton = document.createElement('button');
    retryButton.type = 'button';
    retryButton.textContent = 'Retry analysis';
    retryButton.addEventListener('click', onRetry);
    card.append(retryButton);
  }

  container.replaceChildren(card);
}

function getErrorEyebrow(display) {
  if ([429, 500, 503].includes(Number(display.status))) return 'Temporary Google AI problem';
  if ([401, 403, 404].includes(Number(display.status))) return 'Configuration problem';
  if (Number(display.status) === 400) return 'Prompt validation problem';
  return 'Analysis generation error';
}

function getSuggestedActions(display) {
  const status = Number(display.status);

  if (status === 503) {
    return ['Gemini 2.5 Flash is busy. Retry in 2–5 minutes.', 'Try a shorter prompt or fewer requested sections if this happens repeatedly.'];
  }

  if (status === 429) {
    return ['Wait a few minutes before retrying.', 'Avoid submitting several long reports at the same time.'];
  }

  if (status === 500) {
    return ['Retry shortly.', 'Check Supabase Edge Function logs if the problem repeats.'];
  }

  if (status === 400) {
    return ['Review required fields and prompt parameters.', 'Open the selected prompt preview to verify placeholders are filled correctly.'];
  }

  if (status === 401) {
    return ['Check the GEMINI_API_KEY Supabase secret.', 'Redeploy the generate-company-analysis Edge Function after changing secrets.'];
  }

  if (status === 403) {
    return ['Verify that your Google AI Studio key can access Gemini 2.5 Flash.', 'Check Google AI Studio project permissions and billing/quota settings.'];
  }

  if (status === 404) {
    return ['Verify the configured Gemini model name is gemini-2.5-flash.', 'Use the Google model list endpoint if your API key has different model access.'];
  }

  return ['Try again.', 'If it repeats, check Supabase Edge Function logs for the real provider error.'];
}

