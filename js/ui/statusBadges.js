export function createTransactionTypeBadgeHtml(type) {
  const normalizedType = String(type || '').toUpperCase();
  const badgeClass = normalizedType === 'SELL'
    ? 'transaction-type-badge sell'
    : 'transaction-type-badge buy';

  return `<span class="${badgeClass}">${normalizedType || 'BUY'}</span>`;
}

export function createAnalysisStatusBadge(status) {
  const normalizedStatus = status || 'completed';
  const badge = document.createElement('span');
  badge.className = `analysis-status-badge ${normalizedStatus === 'failed' ? 'failed' : 'completed'}`;
  badge.textContent = normalizedStatus === 'failed' ? 'Failed' : 'Completed';
  return badge;
}
