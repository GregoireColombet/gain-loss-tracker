import { validateTransaction } from '../validation.js';
import { showMessage } from '../uiHelpers.js';

export function clearFieldError(fieldElement) {
  if (!fieldElement) return;
  fieldElement.classList.remove('input-error');
  fieldElement.removeAttribute('aria-invalid');
  const labelElement = fieldElement.closest('label');
  const errorElement = labelElement?.querySelector('.field-error-message');
  errorElement?.remove();
}

export function setFieldError(fieldElement, message) {
  if (!fieldElement) return;
  fieldElement.classList.add('input-error');
  fieldElement.setAttribute('aria-invalid', 'true');
  const labelElement = fieldElement.closest('label');
  if (!labelElement) return;
  let errorElement = labelElement.querySelector('.field-error-message');
  if (!errorElement) {
    errorElement = document.createElement('span');
    errorElement.className = 'field-error-message';
    labelElement.appendChild(errorElement);
  }
  errorElement.textContent = message;
}

export function clearFormValidation(formElement) {
  if (!formElement) return;
  formElement.querySelectorAll('.input-error').forEach(clearFieldError);
  formElement.querySelectorAll('.field-error-message').forEach(element => element.remove());
}

export function bindLiveValidationCleanup(formElement) {
  if (!formElement) return;
  formElement.addEventListener('input', event => {
    if (event.target.matches('input, select')) clearFieldError(event.target);
  });
  formElement.addEventListener('change', event => {
    if (event.target.matches('input, select')) clearFieldError(event.target);
  });
}

export function scrollToFirstInvalidField(formElement) {
  const firstInvalidField = formElement?.querySelector('.input-error');
  firstInvalidField?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  firstInvalidField?.focus({ preventScroll: true });
}

export function getRequiredTransactionFieldErrors(formElement) {
  const fieldErrors = [];
  const requiredFields = [
    { field: formElement?.elements.type, message: 'Action is required.' },
    { field: formElement?.elements.companyName, message: 'Company name is required.' },
    { field: formElement?.elements.ticker, message: 'Ticker is required.' },
    { field: formElement?.elements.date, message: 'Date is required.' },
    { field: formElement?.elements.sharePrice, message: 'Share price must be greater than 0.' },
    { field: formElement?.elements.quantity, message: 'Quantity must be greater than 0.' },
    { field: formElement?.elements.transactionFee, message: 'Transaction fee cannot be negative.' }
  ];

  requiredFields.forEach(({ field, message }) => {
    if (!field) return;
    const rawValue = String(field.value || '').trim();
    if (field.name === 'sharePrice' || field.name === 'quantity') {
      const numericValue = Number(rawValue);
      if (!rawValue || !Number.isFinite(numericValue) || numericValue <= 0) fieldErrors.push({ field, message });
      return;
    }
    if (field.name === 'transactionFee') {
      const numericValue = Number(rawValue || 0);
      if (!Number.isFinite(numericValue) || numericValue < 0) fieldErrors.push({ field, message });
      return;
    }
    if (!rawValue) fieldErrors.push({ field, message });
  });

  return fieldErrors;
}

export function applyFieldErrors(formElement, fieldErrors, messageTarget, failurePrefix = 'Save failed') {
  clearFormValidation(formElement);
  fieldErrors.forEach(({ field, message }) => setFieldError(field, message));
  if (fieldErrors.length) {
    showMessage(messageTarget, `${failurePrefix}. ${fieldErrors.length} field(s) require attention.`, 'error');
    scrollToFirstInvalidField(formElement);
    return true;
  }
  return false;
}

export function validateTransactionFormUi(formElement, transaction, existingTransactions, transactionIdToIgnore = null, messageTarget) {
  const fieldErrors = getRequiredTransactionFieldErrors(formElement);
  if (applyFieldErrors(formElement, fieldErrors, messageTarget)) return true;

  const logicalErrors = validateTransaction(transaction, existingTransactions, transactionIdToIgnore);
  if (logicalErrors.length) {
    showMessage(messageTarget, logicalErrors.join(' '), 'error');
    return true;
  }

  return false;
}
