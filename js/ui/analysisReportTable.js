import { deleteAnalysisReport, loadAnalysisReports } from '../ai/analysisService.js';
import { renderAnalysisReportViewer } from './analysisReportViewer.js';

const SORTABLE_COLUMNS = new Set(['createdAt', 'promptTitle', 'companyName', 'ticker']);

let reportTableState = {
  reports: [],
  sortKey: 'createdAt',
  sortDirection: 'desc',
  selectedReportId: null,
  initialized: false
};

export function initializeAnalysisReportTable() {
  if (reportTableState.initialized) return;
  reportTableState.initialized = true;
  bindReportTableEvents();
  refreshAnalysisReportTable();
}

export async function refreshAnalysisReportTable(selectedReport = null) {
  reportTableState.reports = await loadAnalysisReports();

  if (selectedReport) {
    reportTableState.selectedReportId = selectedReport.id;
  } else if (!reportTableState.selectedReportId && reportTableState.reports[0]) {
    reportTableState.selectedReportId = reportTableState.reports[0].id;
  }

  renderReportTable();
  const selected = selectedReport || findSelectedReport();
  renderAnalysisReportViewer(selected || null);
}

function bindReportTableEvents() {
  const table = document.querySelector('#analysisReportsTable');
  table?.addEventListener('click', handleReportTableClick);

  window.addEventListener('analysis-report-saved', event => {
    refreshAnalysisReportTable(event.detail?.report || null);
  });
}

function handleReportTableClick(event) {
  const header = event.target.closest('[data-sort-key]');
  if (header) {
    updateSort(header.dataset.sortKey);
    renderReportTable();
    return;
  }

  const viewButton = event.target.closest('[data-view-report-id]');
  if (viewButton) {
    reportTableState.selectedReportId = viewButton.dataset.viewReportId;
    renderReportTable();
    renderAnalysisReportViewer(findSelectedReport() || null);
    document.querySelector('#analysisReportViewer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  const deleteButton = event.target.closest('[data-delete-report-id]');
  if (deleteButton) {
    handleDeleteReport(deleteButton.dataset.deleteReportId);
  }
}

async function handleDeleteReport(reportId) {
  const report = reportTableState.reports.find(item => item.id === reportId);
  const label = report?.ticker || report?.companyName || report?.promptTitle || 'this report';

  if (!confirm(`Delete ${label}? This cannot be undone.`)) return;

  await deleteAnalysisReport(reportId);

  if (reportTableState.selectedReportId === reportId) {
    reportTableState.selectedReportId = null;
  }

  await refreshAnalysisReportTable();
}

function updateSort(sortKey) {
  if (!SORTABLE_COLUMNS.has(sortKey)) return;

  if (reportTableState.sortKey === sortKey) {
    reportTableState.sortDirection = reportTableState.sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    reportTableState.sortKey = sortKey;
    reportTableState.sortDirection = sortKey === 'createdAt' ? 'desc' : 'asc';
  }
}

function renderReportTable() {
  const body = document.querySelector('#analysisReportsTableBody');
  const empty = document.querySelector('#analysisReportsEmpty');
  const table = document.querySelector('#analysisReportsTable');
  if (!body || !table) return;

  const sortedReports = getSortedReports(reportTableState.reports);
  body.replaceChildren(...sortedReports.map(createReportRow));

  if (empty) empty.hidden = sortedReports.length > 0;
  table.hidden = sortedReports.length === 0;
  renderSortIndicators();
}

function createReportRow(report) {
  const row = document.createElement('tr');
  if (report.id === reportTableState.selectedReportId) row.classList.add('selected-row');

  row.append(
    createCell(formatDateTime(report.createdAt)),
    createCell(report.promptTitle || report.promptId || 'Analysis'),
    createCell(report.companyName || '—'),
    createCell(report.ticker || '—'),
    createCell(getPrimaryParameterSummary(report)),
    createActionsCell(report)
  );

  return row;
}

function createActionsCell(report) {
  const cell = document.createElement('td');
  cell.className = 'table-actions';

  const viewButton = document.createElement('button');
  viewButton.type = 'button';
  viewButton.className = 'secondary-button compact-button';
  viewButton.dataset.viewReportId = report.id;
  viewButton.textContent = 'View';

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'danger-button compact-button';
  deleteButton.dataset.deleteReportId = report.id;
  deleteButton.textContent = 'Delete';

  cell.append(viewButton, deleteButton);
  return cell;
}

function getPrimaryParameterSummary(report) {
  const parameters = report.parameters || {};
  const values = [
    parameters.market,
    parameters.currency,
    parameters.timeHorizon,
    parameters.period,
    parameters.sector,
    parameters.riskTolerance
  ].filter(Boolean);

  return values.slice(0, 3).join(' · ') || '—';
}

function createCell(text) {
  const cell = document.createElement('td');
  cell.textContent = text;
  return cell;
}

function getSortedReports(reports) {
  const directionMultiplier = reportTableState.sortDirection === 'asc' ? 1 : -1;

  return [...reports].sort((firstReport, secondReport) => {
    const firstValue = getSortValue(firstReport, reportTableState.sortKey);
    const secondValue = getSortValue(secondReport, reportTableState.sortKey);

    if (reportTableState.sortKey === 'createdAt') {
      return (new Date(firstValue).getTime() - new Date(secondValue).getTime()) * directionMultiplier;
    }

    return String(firstValue).localeCompare(String(secondValue), undefined, {
      sensitivity: 'base',
      numeric: true
    }) * directionMultiplier;
  });
}

function getSortValue(report, sortKey) {
  if (sortKey === 'companyName') return report.companyName || report.parameters?.companyName || '';
  if (sortKey === 'ticker') return report.ticker || report.parameters?.ticker || '';
  return report[sortKey] || '';
}

function renderSortIndicators() {
  document.querySelectorAll('#analysisReportsTable [data-sort-key]').forEach(header => {
    const isActive = header.dataset.sortKey === reportTableState.sortKey;
    const direction = reportTableState.sortDirection === 'asc' ? '↑' : '↓';
    header.querySelector('.sort-indicator')?.remove();

    const indicator = document.createElement('span');
    indicator.className = 'sort-indicator';
    indicator.textContent = isActive ? direction : '↕';
    header.append(indicator);
  });
}

function findSelectedReport() {
  return reportTableState.reports.find(report => report.id === reportTableState.selectedReportId) || reportTableState.reports[0] || null;
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
