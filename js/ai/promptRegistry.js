export const ANALYSIS_PROMPTS = [
  {
    id: 'competitive-analysis',
    title: 'Competitive Analysis',
    description: 'Compare a company against direct competitors, market position, moat, strengths, and threats.',
    file: './ai/prompts/competitive-analysis.md',
    parameters: ['companyName', 'ticker', 'market', 'competitors', 'period']
  },
  {
    id: 'dcf-valuation',
    title: 'DCF Valuation',
    description: 'Estimate intrinsic value using revenue growth, margin, discount-rate, and terminal-value assumptions.',
    file: './ai/prompts/dcf-valuation.md',
    parameters: ['companyName', 'ticker', 'market', 'currency', 'revenueGrowth', 'discountRate', 'terminalGrowthRate', 'forecastYears']
  },
  {
    id: 'dividend-strategy',
    title: 'Dividend Strategy',
    description: 'Review dividend quality, payout safety, yield attractiveness, and dividend-growth outlook.',
    file: './ai/prompts/dividend-strategy.md',
    parameters: ['companyName', 'ticker', 'market', 'currency', 'period', 'incomeGoal']
  },
  {
    id: 'earnings-analyzer',
    title: 'Earnings Analyzer',
    description: 'Analyze recent earnings, guidance, surprises, margins, and management commentary.',
    file: './ai/prompts/earnings-analyzer.md',
    parameters: ['companyName', 'ticker', 'market', 'earningsPeriod', 'period']
  },
  {
    id: 'impact-report',
    title: 'Impact Report',
    description: 'Analyze the investment impact of a news event, macro event, or company announcement.',
    file: './ai/prompts/impact-report.md',
    parameters: ['companyName', 'ticker', 'market', 'eventDescription', 'timeHorizon']
  },
  {
    id: 'pattern-finder',
    title: 'Pattern Finder',
    description: 'Find recurring business, price, earnings, or sentiment patterns that may affect future performance.',
    file: './ai/prompts/pattern-finder.md',
    parameters: ['companyName', 'ticker', 'market', 'patternFocus', 'period']
  },
  {
    id: 'portfolio-builder',
    title: 'Portfolio Builder',
    description: 'Build or improve a portfolio around risk tolerance, time horizon, and sector allocation.',
    file: './ai/prompts/portfolio-builder.md',
    parameters: ['portfolioGoal', 'riskTolerance', 'timeHorizon', 'currency', 'existingHoldings', 'monthlyContribution']
  },
  {
    id: 'risk-assessment',
    title: 'Risk Assessment',
    description: 'Identify business, valuation, financial, macro, competitive, and execution risks.',
    file: './ai/prompts/risk-assessment.md',
    parameters: ['companyName', 'ticker', 'market', 'period', 'riskFocus']
  },
  {
    id: 'stock-screener',
    title: 'Stock Screener',
    description: 'Screen stocks by investment style, sector, valuation, quality, growth, dividend, or risk criteria.',
    file: './ai/prompts/stock-screener.md',
    parameters: ['market', 'sector', 'investmentStyle', 'riskTolerance', 'minimumMarketCap', 'currency']
  },
  {
    id: 'technical-analysis',
    title: 'Technical Analysis',
    description: 'Analyze price trend, momentum, support/resistance, volume, and trade setup context.',
    file: './ai/prompts/technical-analysis.md',
    parameters: ['companyName', 'ticker', 'market', 'timeFrame', 'chartContext']
  }
];

export const PARAMETER_DEFINITIONS = {
  companyName: { label: 'Company name', type: 'text', placeholder: 'Apple Inc.', required: true },
  ticker: { label: 'Ticker', type: 'text', placeholder: 'AAPL', required: true },
  market: { label: 'Market / exchange', type: 'text', placeholder: 'US / NASDAQ / NYSE', required: true },
  period: { label: 'Analysis period', type: 'text', placeholder: 'Last 5 years', required: false },
  currency: { label: 'Currency', type: 'text', placeholder: 'USD', required: false },
  competitors: { label: 'Competitors', type: 'text', placeholder: 'MSFT, GOOGL, META', required: false },
  revenueGrowth: { label: 'Revenue growth assumption', type: 'text', placeholder: '8% per year', required: false },
  discountRate: { label: 'Discount rate', type: 'text', placeholder: '10%', required: false },
  terminalGrowthRate: { label: 'Terminal growth rate', type: 'text', placeholder: '3%', required: false },
  forecastYears: { label: 'Forecast years', type: 'number', placeholder: '5', required: false },
  incomeGoal: { label: 'Income goal', type: 'text', placeholder: 'Stable dividend income', required: false },
  earningsPeriod: { label: 'Earnings period', type: 'text', placeholder: 'Latest quarter / FY2025 Q4', required: false },
  eventDescription: { label: 'Event description', type: 'textarea', placeholder: 'Describe the news, announcement, or macro event.', required: true },
  timeHorizon: { label: 'Time horizon', type: 'text', placeholder: '6 months / 3 years / long term', required: false },
  patternFocus: { label: 'Pattern focus', type: 'text', placeholder: 'earnings revisions, price action, sentiment, cyclicality', required: false },
  portfolioGoal: { label: 'Portfolio goal', type: 'text', placeholder: 'Long-term growth with moderate volatility', required: true },
  riskTolerance: { label: 'Risk tolerance', type: 'select', options: ['Low', 'Medium', 'High'], required: false },
  existingHoldings: { label: 'Existing holdings', type: 'textarea', placeholder: 'VOO 40%, AAPL 20%, cash 40%', required: false },
  monthlyContribution: { label: 'Monthly contribution', type: 'text', placeholder: '$500 / NT$20,000', required: false },
  riskFocus: { label: 'Risk focus', type: 'text', placeholder: 'valuation risk, debt risk, competition, regulation', required: false },
  sector: { label: 'Sector', type: 'text', placeholder: 'Technology / Healthcare / Any', required: false },
  investmentStyle: { label: 'Investment style', type: 'text', placeholder: 'Growth / Value / Dividend / Quality', required: false },
  minimumMarketCap: { label: 'Minimum market cap', type: 'text', placeholder: '$10B', required: false },
  timeFrame: { label: 'Technical time frame', type: 'text', placeholder: 'Daily / weekly / 6 months', required: false },
  chartContext: { label: 'Chart context', type: 'textarea', placeholder: 'Paste recent price action, support/resistance, or chart notes if available.', required: false }
};

export function findPromptById(promptId) {
  return ANALYSIS_PROMPTS.find(prompt => prompt.id === promptId) || ANALYSIS_PROMPTS[0];
}
