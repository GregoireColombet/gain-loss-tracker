import { createImpactPreview } from '../calculations.js';
import { formatMoney, formatQuantity } from '../uiHelpers.js';

export function renderImpactDialog({ oldTransactions, newTransactions, actionLabel, impactDialog, impactContent }) {
  const impactPreview = createImpactPreview(oldTransactions, newTransactions);

  impactContent.innerHTML = `
    <p><strong>${actionLabel} impact preview</strong></p>
    <ul>
      <li>Total currently invested: ${formatMoney(impactPreview.oldPortfolio.totalCurrentlyInvested)} → ${formatMoney(impactPreview.newPortfolio.totalCurrentlyInvested)}</li>
      <li>Change in invested amount: ${formatMoney(impactPreview.totalCurrentlyInvestedChange)}</li>
      <li>Realized gain/loss: ${formatMoney(impactPreview.oldPortfolio.totalRealizedGainLoss)} → ${formatMoney(impactPreview.newPortfolio.totalRealizedGainLoss)}</li>
      <li>Change in realized gain/loss: ${formatMoney(impactPreview.realizedGainLossChange)}</li>
      <li>Total fees: ${formatMoney(impactPreview.oldPortfolio.totalFees)} → ${formatMoney(impactPreview.newPortfolio.totalFees)}</li>
      <li>Change in total fees: ${formatMoney(impactPreview.totalFeesChange)}</li>
    </ul>
    ${renderTickerImpactPreview(impactPreview)}
    <p>Fee edits are treated as part of the permanent transaction record. A buy fee changes average cost; a sell fee changes realized gain/loss. All later transactions for the same ticker are recalculated before saving.</p>
  `;

  impactDialog.showModal();
}

function renderTickerImpactPreview(impactPreview) {
  const affectedTickers = Array.from(new Set([
    ...Object.keys(impactPreview.oldPortfolio.holdingsByTicker),
    ...Object.keys(impactPreview.newPortfolio.holdingsByTicker)
  ])).filter(ticker => {
    const oldHolding = impactPreview.oldPortfolio.holdingsByTicker[ticker] || {};
    const newHolding = impactPreview.newPortfolio.holdingsByTicker[ticker] || {};
    return oldHolding.averagePrice !== newHolding.averagePrice ||
      oldHolding.remainingQuantity !== newHolding.remainingQuantity ||
      oldHolding.realizedGainLoss !== newHolding.realizedGainLoss;
  });

  if (!affectedTickers.length) return '';

  const rows = affectedTickers.map(ticker => {
    const oldHolding = impactPreview.oldPortfolio.holdingsByTicker[ticker] || { averagePrice: 0, remainingQuantity: 0, realizedGainLoss: 0 };
    const newHolding = impactPreview.newPortfolio.holdingsByTicker[ticker] || { averagePrice: 0, remainingQuantity: 0, realizedGainLoss: 0 };
    return `
      <tr>
        <td data-label="Ticker">${ticker}</td>
        <td data-label="Average price">${formatMoney(oldHolding.averagePrice)} → ${formatMoney(newHolding.averagePrice)}</td>
        <td data-label="Remaining qty">${formatQuantity(oldHolding.remainingQuantity)} → ${formatQuantity(newHolding.remainingQuantity)}</td>
        <td data-label="Realized gain/loss">${formatMoney(oldHolding.realizedGainLoss)} → ${formatMoney(newHolding.realizedGainLoss)}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="table-scroll-wrapper">
      <table>
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Average price</th>
            <th>Remaining quantity</th>
            <th>Realized gain/loss</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}
