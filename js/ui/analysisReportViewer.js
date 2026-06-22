const SUMMARY_PATTERNS = [
  { key: 'verdict', label: 'Verdict', pattern: /(verdict|recommendation|confidence rating|recommended play)\s*[:\-–]\s*([^\n|]+)/i },
  { key: 'fairValue', label: 'Fair value / target', pattern: /(fair value|price target|bull case.*target|target price)\s*[:\-–]\s*([^\n|]+)/i },
  { key: 'risk', label: 'Risk', pattern: /(risk rating|risk score|risk level)\s*[:\-–]\s*([^\n|]+)/i },
  { key: 'entry', label: 'Entry / action', pattern: /(entry price|entry zone|action plan|trade plan)\s*[:\-–]\s*([^\n|]+)/i }
];

export function renderAnalysisReportViewer(report, container = document.querySelector('#analysisReportViewer')) {
  if (!container) return;

  if (!report) {
    container.replaceChildren(createEmptyViewer());
    return;
  }

  const sections = splitMarkdownIntoSections(report.resultMarkdown || '');
  const summaryCards = buildSummaryCards(report, sections);
  const sectionNav = createSectionNavigation(sections);
  const reportContent = createReportContent(sections);

  const wrapper = document.createElement('div');
  wrapper.className = 'analysis-report-viewer-content';

  const header = document.createElement('div');
  header.className = 'analysis-report-header-card';
  header.append(
    createReportKicker(report),
    createElement('h2', report.promptTitle || 'AI analysis report'),
    createReportMeta(report)
  );

  const summaryGrid = document.createElement('div');
  summaryGrid.className = 'analysis-summary-grid';
  summaryGrid.append(...summaryCards);

  const body = document.createElement('div');
  body.className = 'analysis-report-body';
  body.append(sectionNav, reportContent);

  wrapper.append(header, summaryGrid, createFutureChartPlaceholder(report), body);
  container.replaceChildren(wrapper);
}

function createEmptyViewer() {
  const empty = document.createElement('div');
  empty.className = 'analysis-report-empty';
  empty.innerHTML = '<h2>No report selected</h2><p>Generate a new report or select View from the saved reports table.</p>';
  return empty;
}

function createReportKicker(report) {
  const kicker = document.createElement('p');
  kicker.className = 'analysis-report-kicker';
  const identity = [report.companyName, report.ticker].filter(Boolean).join(' · ');
  kicker.textContent = identity || 'Investment research';
  return kicker;
}

function createReportMeta(report) {
  const meta = document.createElement('div');
  meta.className = 'analysis-report-meta';

  const generatedAt = report.createdAt ? formatDateTime(report.createdAt) : 'Unknown date';
  meta.append(
    createMetaPill('Prompt', report.promptTitle || report.promptId || 'Analysis'),
    createMetaPill('Generated', generatedAt)
  );

  if (report.ticker) meta.append(createMetaPill('Ticker', report.ticker));
  if (report.companyName) meta.append(createMetaPill('Company', report.companyName));

  return meta;
}

function createMetaPill(label, value) {
  const pill = document.createElement('span');
  pill.className = 'analysis-meta-pill';
  pill.textContent = `${label}: ${value}`;
  return pill;
}

function buildSummaryCards(report, sections) {
  const markdown = report.resultMarkdown || '';
  const cards = [
    { label: 'Report type', value: report.promptTitle || report.promptId || 'AI analysis' },
    { label: 'Generated', value: report.createdAt ? formatDate(report.createdAt) : 'Unknown' }
  ];

  if (report.ticker || report.companyName) {
    cards.unshift({
      label: 'Subject',
      value: [report.companyName, report.ticker].filter(Boolean).join(' · ')
    });
  }

  SUMMARY_PATTERNS.forEach(patternDefinition => {
    const match = markdown.match(patternDefinition.pattern);
    if (match?.[2]) {
      cards.push({ label: patternDefinition.label, value: cleanSummaryValue(match[2]) });
    }
  });

  if (sections.length) {
    cards.push({ label: 'Sections', value: String(sections.length) });
  }

  return cards.slice(0, 6).map(createSummaryCard);
}

function createSummaryCard(card) {
  const element = document.createElement('article');
  element.className = 'analysis-summary-card';
  element.append(
    createElement('span', card.label),
    createElement('strong', card.value || 'Not specified')
  );
  return element;
}

function cleanSummaryValue(value) {
  return String(value).replace(/[*_`]/g, '').replace(/<[^>]*>/g, '').trim().slice(0, 120);
}

function createFutureChartPlaceholder(report) {
  const chartReadyPrompts = new Set(['dcf-valuation', 'technical-analysis', 'risk-assessment', 'portfolio-builder', 'dividend-strategy']);
  const placeholder = document.createElement('div');
  placeholder.className = 'analysis-chart-placeholder';

  if (chartReadyPrompts.has(report.promptId)) {
    placeholder.textContent = 'Chart-ready report type: future graph widgets can be added here without changing the report table or markdown viewer.';
  } else {
    placeholder.hidden = true;
  }

  return placeholder;
}

function createSectionNavigation(sections) {
  const nav = document.createElement('aside');
  nav.className = 'analysis-section-nav';

  const title = createElement('h3', 'Report sections');
  nav.append(title);

  if (!sections.length) {
    nav.append(createElement('p', 'No headings detected.'));
    return nav;
  }

  const list = document.createElement('ul');
  sections.forEach((section, index) => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = `#analysis-section-${index}`;
    link.textContent = section.title;
    item.append(link);
    list.append(item);
  });

  nav.append(list);
  return nav;
}

function createReportContent(sections) {
  const content = document.createElement('div');
  content.className = 'analysis-rendered-markdown';

  if (!sections.length) {
    content.append(createParagraph('The report did not contain readable Markdown sections.'));
    return content;
  }

  sections.forEach((section, index) => {
    const article = document.createElement('article');
    article.className = 'analysis-report-section';
    article.id = `analysis-section-${index}`;
    article.append(createElement(section.level <= 2 ? 'h2' : 'h3', section.title));
    renderMarkdownLines(section.lines, article);
    content.append(article);
  });

  return content;
}

function splitMarkdownIntoSections(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const sections = [];
  let currentSection = null;

  lines.forEach(line => {
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      currentSection = {
        level: headingMatch[1].length,
        title: cleanInlineMarkdown(headingMatch[2]),
        lines: []
      };
      sections.push(currentSection);
      return;
    }

    if (!currentSection) {
      currentSection = { level: 2, title: 'Executive summary', lines: [] };
      sections.push(currentSection);
    }

    currentSection.lines.push(line);
  });

  return sections.filter(section => section.title || section.lines.some(line => line.trim()));
}

function renderMarkdownLines(lines, container) {
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const { table, nextIndex } = parseMarkdownTable(lines, index);
      container.append(table);
      index = nextIndex;
      continue;
    }

    if (/^[-*]\s+/.test(trimmedLine)) {
      const { list, nextIndex } = parseList(lines, index);
      container.append(list);
      index = nextIndex;
      continue;
    }

    if (/^\d+\.\s+/.test(trimmedLine)) {
      const { list, nextIndex } = parseList(lines, index, true);
      container.append(list);
      index = nextIndex;
      continue;
    }

    if (/^```/.test(trimmedLine)) {
      const { block, nextIndex } = parseCodeBlock(lines, index);
      container.append(block);
      index = nextIndex;
      continue;
    }

    container.append(createParagraph(cleanInlineMarkdown(trimmedLine)));
    index += 1;
  }
}

function isTableStart(lines, index) {
  return lines[index]?.includes('|') && lines[index + 1]?.match(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/);
}

function parseMarkdownTable(lines, startIndex) {
  const tableLines = [];
  let index = startIndex;

  while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
    tableLines.push(lines[index]);
    index += 1;
  }

  const table = document.createElement('table');
  table.className = 'analysis-markdown-table';

  const headerCells = splitTableRow(tableLines[0]);
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerCells.forEach(cell => headerRow.append(createElement('th', cleanInlineMarkdown(cell))));
  thead.append(headerRow);

  const tbody = document.createElement('tbody');
  tableLines.slice(2).forEach(rowLine => {
    const row = document.createElement('tr');
    splitTableRow(rowLine).forEach(cell => row.append(createElement('td', cleanInlineMarkdown(cell))));
    tbody.append(row);
  });

  table.append(thead, tbody);
  return { table, nextIndex: index };
}

function splitTableRow(row) {
  return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
}

function parseList(lines, startIndex, ordered = false) {
  const list = document.createElement(ordered ? 'ol' : 'ul');
  let index = startIndex;
  const pattern = ordered ? /^\d+\.\s+/ : /^[-*]\s+/;

  while (index < lines.length && pattern.test(lines[index].trim())) {
    const item = document.createElement('li');
    item.textContent = cleanInlineMarkdown(lines[index].trim().replace(pattern, ''));
    list.append(item);
    index += 1;
  }

  return { list, nextIndex: index };
}

function parseCodeBlock(lines, startIndex) {
  const codeLines = [];
  let index = startIndex + 1;

  while (index < lines.length && !/^```/.test(lines[index].trim())) {
    codeLines.push(lines[index]);
    index += 1;
  }

  const pre = document.createElement('pre');
  pre.className = 'analysis-code-block';
  const code = document.createElement('code');
  code.textContent = codeLines.join('\n');
  pre.append(code);

  return { block: pre, nextIndex: index + 1 };
}

function createParagraph(text) {
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  return paragraph;
}

function cleanInlineMarkdown(value) {
  return String(value || '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^>\s*/, '')
    .trim();
}

function createElement(tagName, text) {
  const element = document.createElement(tagName);
  element.textContent = text;
  return element;
}

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(value) {
  return new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
