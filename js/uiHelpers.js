import { formatMoney, formatQuantity, getGainLossClass } from './utils/formatters.js';

export { formatMoney, formatQuantity, getGainLossClass };

export function showMessage(element, message, type = 'info') {
  if (!element) {
    console.error(`User message target is missing. Message: ${message}`);
    return;
  }
  element.textContent = message;
  element.className = `message-box ${type}`;
  element.hidden = false;
}

export function hideMessage(element) {
  if (!element) return;
  element.hidden = true;
  element.textContent = '';
}

export function setSelectOptions(selectElement, holdings) {
  if (!selectElement) return;
  selectElement.innerHTML = '<option value="">Select company or ticker</option>';
  holdings.forEach(holding => {
    const option = document.createElement('option');
    option.value = holding.ticker;
    option.textContent = `${holding.companyName} (${holding.ticker})`;
    selectElement.appendChild(option);
  });
}
