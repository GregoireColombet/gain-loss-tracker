const GEMINI_ERROR_MESSAGES = {
  400: {
    title: 'Invalid analysis request',
    message: 'The prompt or parameters sent to Google AI are invalid. Review the selected prompt and required fields.',
    retryable: false
  },
  401: {
    title: 'Google AI authentication failed',
    message: 'The Gemini API key is missing, invalid, or rejected. Check the GEMINI_API_KEY secret in Supabase.',
    retryable: false
  },
  403: {
    title: 'Google AI access denied',
    message: 'The configured Gemini model or API feature is not available for this API key or project.',
    retryable: false
  },
  404: {
    title: 'Gemini model not available',
    message: 'The configured Gemini model could not be found. Verify the model name, for example gemini-2.5-flash.',
    retryable: false
  },
  429: {
    title: 'Google AI rate limit reached',
    message: 'Too many analysis requests were sent. Wait a few minutes and try again.',
    retryable: true
  },
  500: {
    title: 'Google AI internal error',
    message: 'Google AI encountered an internal error while generating the report. Try again shortly.',
    retryable: true
  },
  503: {
    title: 'Google AI temporarily busy',
    message: 'Gemini 2.5 Flash is overloaded or temporarily unavailable. Try again in a few minutes.',
    retryable: true
  }
};

export class AnalysisGenerationError extends Error {
  constructor({ title, message, status, code, retryable = true, details = null, rawError = null, failedReport = null }) {
    super(message || title || 'Analysis generation failed.');
    this.name = 'AnalysisGenerationError';
    this.title = title || 'Analysis failed';
    this.userMessage = message || 'An unexpected analysis error occurred.';
    this.status = status || null;
    this.code = code || null;
    this.retryable = Boolean(retryable);
    this.details = details || null;
    this.rawError = rawError || null;
    this.failedReport = failedReport || null;
  }
}

export function createAnalysisError(errorLike, fallbackMessage = 'Analysis generation failed.') {
  if (errorLike instanceof AnalysisGenerationError) return errorLike;

  const status = extractErrorStatus(errorLike);
  const code = extractErrorCode(errorLike);
  const providerMessage = extractProviderMessage(errorLike);
  const mapped = GEMINI_ERROR_MESSAGES[status] || null;

  return new AnalysisGenerationError({
    title: mapped?.title || getDefaultTitle(status, code),
    message: mapped?.message || providerMessage || fallbackMessage,
    status,
    code,
    retryable: typeof mapped?.retryable === 'boolean' ? mapped.retryable : isProbablyRetryable(status),
    details: extractErrorDetails(errorLike),
    rawError: errorLike
  });
}

export function isRetryableAnalysisError(errorLike) {
  return createAnalysisError(errorLike).retryable;
}

export function getAnalysisErrorDisplay(errorLike) {
  const error = createAnalysisError(errorLike);
  return {
    title: error.title,
    message: error.userMessage,
    status: error.status,
    code: error.code,
    retryable: error.retryable,
    details: error.details,
    failedReport: error.failedReport || null
  };
}

export function getStatusCodeFromGeminiPayload(payload) {
  return Number(payload?.details?.error?.code || payload?.error?.code || payload?.status || 0) || null;
}

export function getErrorMessageFromGeminiPayload(payload) {
  return payload?.details?.error?.message || payload?.error?.message || payload?.message || payload?.error || '';
}

export function getErrorCodeFromGeminiPayload(payload) {
  return payload?.details?.error?.status || payload?.error?.status || payload?.code || '';
}

function extractErrorStatus(errorLike) {
  return Number(
    errorLike?.status ||
    errorLike?.context?.status ||
    errorLike?.details?.error?.code ||
    errorLike?.error?.code ||
    errorLike?.details?.status ||
    0
  ) || null;
}

function extractErrorCode(errorLike) {
  return String(
    errorLike?.code ||
    errorLike?.details?.error?.status ||
    errorLike?.error?.status ||
    errorLike?.details?.code ||
    ''
  );
}

function extractProviderMessage(errorLike) {
  return String(
    errorLike?.details?.error?.message ||
    errorLike?.error?.message ||
    errorLike?.message ||
    ''
  );
}

function extractErrorDetails(errorLike) {
  return errorLike?.details || errorLike?.error || errorLike?.rawError || null;
}

function getDefaultTitle(status, code) {
  if (status) return `Analysis failed (${status})`;
  if (code) return `Analysis failed (${code})`;
  return 'Analysis failed';
}

function isProbablyRetryable(status) {
  return !status || [408, 425, 429, 500, 502, 503, 504].includes(Number(status));
}
