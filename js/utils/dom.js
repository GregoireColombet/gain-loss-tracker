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

export function getTodayDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getErrorMessage(error) {
  return error instanceof Error && error.message
    ? error.message
    : 'Unexpected error. Please check the browser console for details.';
}
