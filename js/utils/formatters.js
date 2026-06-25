export function formatMoney(value) {
  if (!Number.isFinite(value)) return 'API not reachable';
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function formatQuantity(value) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export function getGainLossClass(value) {
  if (!Number.isFinite(value)) return 'neutral-value';
  return value >= 0 ? 'positive-value' : 'negative-value';
}

export function formatDateTime(value) {
  if (!value) return '—';
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return String(value);

  return parsedDate.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
