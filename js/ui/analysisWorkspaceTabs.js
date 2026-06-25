const STORAGE_KEY = 'stock-tracker-analysis-active-tab';
const VALID_TABS = new Set(['saved', 'generate', 'prompts']);

export function initializeAnalysisWorkspaceTabs() {
  const tabList = document.querySelector('#analysisWorkspaceTabs');
  if (!tabList) return;

  const savedTab = localStorage.getItem(STORAGE_KEY);
  activateAnalysisTab(VALID_TABS.has(savedTab) ? savedTab : 'saved');

  tabList.addEventListener('click', event => {
    const button = event.target.closest('[data-analysis-tab]');
    if (!button) return;

    activateAnalysisTab(button.dataset.analysisTab);
  });
}

export function activateAnalysisTab(tabName) {
  if (!VALID_TABS.has(tabName)) return;

  document.querySelectorAll('[data-analysis-tab]').forEach(button => {
    const isActive = button.dataset.analysisTab === tabName;
    button.setAttribute('aria-selected', String(isActive));
    button.tabIndex = isActive ? 0 : -1;
  });

  document.querySelectorAll('[data-analysis-tab-panel]').forEach(panel => {
    panel.hidden = panel.dataset.analysisTabPanel !== tabName;
  });

  localStorage.setItem(STORAGE_KEY, tabName);
}
