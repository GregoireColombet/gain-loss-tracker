import { getTodayDateString } from './dates.js';

export { getTodayDateString };
export function findFirstElement(selectorList) {
  for (const selector of selectorList) {
    const element = document.querySelector(selector);
    if (element) return element;
  }
  return null;
}

export function setButtonProcessing(buttonElement, isProcessing, processingText = 'Saving...') {
  if (!buttonElement) return;
  if (isProcessing) {
    buttonElement.dataset.originalText = buttonElement.textContent;
    buttonElement.textContent = processingText;
    buttonElement.disabled = true;
    return;
  }
  buttonElement.textContent = buttonElement.dataset.originalText || buttonElement.textContent;
  buttonElement.disabled = false;
  delete buttonElement.dataset.originalText;
}


export function getErrorMessage(error) {
  return error instanceof Error && error.message
    ? error.message
    : 'Unexpected error. Please check the browser console for details.';
}
