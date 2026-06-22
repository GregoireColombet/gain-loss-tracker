export const DEFAULT_GENERATION_CONFIG = {
  temperature: 0.3,
  topP: 0.8,
  maxOutputTokens: 4096
};

export const ANALYSIS_PROMPTS = [
  {
    id: 'stock-screener',
    title: 'Goldman Sachs Stock Screener',
    description: 'Screen top stock candidates for an investor profile using valuation, growth, debt, dividend, moat, risk, entry zones, and targets.',
    file: './ai/prompts/stock-screener.md',
    parameters: ['riskTolerance', 'investmentAmount', 'timeHorizon', 'preferredSectors', 'market', 'currency'],
    generationConfig: DEFAULT_GENERATION_CONFIG
  },
  {
    id: 'dcf-valuation',
    title: 'Morgan Stanley DCF Valuation',
    description: 'Build a DCF-style valuation memo with 5-year projections, WACC, terminal value, sensitivity, and valuation verdict.',
    file: './ai/prompts/dcf-valuation.md',
    parameters: ['companyName', 'ticker', 'market', 'currency', 'revenueGrowth', 'discountRate', 'terminalGrowthRate', 'forecastYears'],
    generationConfig: DEFAULT_GENERATION_CONFIG
  },
  {
    id: 'risk-assessment',
    title: 'Bridgewater Risk Assessment',
    description: 'Assess portfolio correlation, concentration, macro exposure, stress tests, liquidity, tail risks, hedging, and rebalancing.',
    file: './ai/prompts/risk-assessment.md',
    parameters: ['portfolioHoldings', 'portfolioValue', 'riskFocus', 'currency'],
    generationConfig: DEFAULT_GENERATION_CONFIG
  },
  {
    id: 'earnings-analyzer',
    title: 'JPMorgan Earnings Analyzer',
    description: 'Create a pre-earnings research brief with estimate history, consensus, key metrics, guidance, options move, and action plan.',
    file: './ai/prompts/earnings-analyzer.md',
    parameters: ['companyName', 'ticker', 'market', 'earningsDate', 'earningsPeriod'],
    generationConfig: DEFAULT_GENERATION_CONFIG
  },
  {
    id: 'portfolio-builder',
    title: 'BlackRock Portfolio Builder',
    description: 'Build a multi-asset portfolio with allocation, ETFs/funds, expected return, drawdown, rebalancing, DCA, and policy statement.',
    file: './ai/prompts/portfolio-builder.md',
    parameters: ['age', 'income', 'savings', 'portfolioGoal', 'riskTolerance', 'accountType', 'timeHorizon', 'currency', 'existingHoldings', 'monthlyContribution'],
    generationConfig: DEFAULT_GENERATION_CONFIG
  },
  {
    id: 'technical-analysis',
    title: 'Citadel Technical Analysis',
    description: 'Analyze trend, support/resistance, moving averages, RSI, MACD, Bollinger Bands, volume, patterns, Fibonacci, and trade setup.',
    file: './ai/prompts/technical-analysis.md',
    parameters: ['companyName', 'ticker', 'market', 'currentPosition', 'timeFrame', 'chartContext'],
    generationConfig: DEFAULT_GENERATION_CONFIG
  },
  {
    id: 'dividend-strategy',
    title: 'Harvard Endowment Dividend Strategy',
    description: 'Build a dividend income portfolio with yield, safety, growth history, payout ratios, income projection, DRIP, and tax notes.',
    file: './ai/prompts/dividend-strategy.md',
    parameters: ['investmentAmount', 'incomeGoal', 'accountType', 'taxBracket', 'market', 'currency'],
    generationConfig: DEFAULT_GENERATION_CONFIG
  },
  {
    id: 'competitive-analysis',
    title: 'Bain Competitive Analysis for Stocks',
    description: 'Compare companies in a sector using market cap, margins, moat, share trends, management, R&D, threats, SWOT, and catalysts.',
    file: './ai/prompts/competitive-analysis.md',
    parameters: ['sector', 'market', 'competitors', 'period'],
    generationConfig: DEFAULT_GENERATION_CONFIG
  },
  {
    id: 'pattern-finder',
    title: 'Renaissance Technologies Pattern Finder',
    description: 'Search for statistical patterns, seasonality, event correlations, insider/institutional activity, short interest, options signals, and earnings behavior.',
    file: './ai/prompts/pattern-finder.md',
    parameters: ['companyName', 'ticker', 'market', 'period', 'patternFocus'],
    generationConfig: DEFAULT_GENERATION_CONFIG
  },
  {
    id: 'impact-report',
    title: 'McKinsey Macro Economic Impact Report',
    description: 'Analyze macro conditions and portfolio impact across rates, inflation, GDP, currency, employment, Fed policy, geopolitics, and sector rotation.',
    file: './ai/prompts/impact-report.md',
    parameters: ['portfolioHoldings', 'economicConcern', 'currency', 'market'],
    generationConfig: DEFAULT_GENERATION_CONFIG
  }
];

export const PARAMETER_DEFINITIONS = {
  companyName: { label: 'Company name', type: 'text', placeholder: 'Apple Inc.', required: true },
  ticker: { label: 'Ticker', type: 'text', placeholder: 'AAPL', required: true },
  market: { label: 'Market / exchange / region', type: 'text', placeholder: 'US / NASDAQ / NYSE / Global', required: false },
  period: { label: 'Analysis period', type: 'text', placeholder: 'Last 5 years / 10 years / 2020-2026', required: false },
  currency: { label: 'Currency', type: 'text', placeholder: 'USD', required: false },
  competitors: { label: 'Competitors to include', type: 'text', placeholder: 'MSFT, GOOGL, META', required: false },
  revenueGrowth: { label: 'Revenue growth assumption', type: 'text', placeholder: '8% per year', required: false },
  discountRate: { label: 'Discount rate / WACC assumption', type: 'text', placeholder: '10%', required: false },
  terminalGrowthRate: { label: 'Terminal growth rate', type: 'text', placeholder: '3%', required: false },
  forecastYears: { label: 'Forecast years', type: 'number', placeholder: '5', required: false },
  incomeGoal: { label: 'Monthly income goal', type: 'text', placeholder: '$500 per month', required: false },
  earningsPeriod: { label: 'Earnings period', type: 'text', placeholder: 'FY2026 Q2 / upcoming quarter', required: false },
  earningsDate: { label: 'Earnings date if known', type: 'date', required: false },
  timeHorizon: { label: 'Time horizon', type: 'text', placeholder: '12 months / 5 years / long term', required: false },
  patternFocus: { label: 'Pattern focus', type: 'text', placeholder: 'seasonality, earnings gaps, options activity, short interest', required: false },
  portfolioGoal: { label: 'Goals', type: 'textarea', placeholder: 'Retirement, income, capital growth, house deposit, wealth preservation', required: true },
  riskTolerance: { label: 'Risk tolerance', type: 'select', options: ['Low', 'Medium', 'High'], required: false },
  existingHoldings: { label: 'Existing holdings', type: 'textarea', placeholder: 'VOO 40%, AAPL 20%, cash 40%', required: false },
  monthlyContribution: { label: 'Monthly contribution', type: 'text', placeholder: '$500 / NT$20,000', required: false },
  riskFocus: { label: 'Risk focus / main concern', type: 'textarea', placeholder: 'Concentration, recession, interest rates, single-stock risk, liquidity', required: false },
  sector: { label: 'Industry or sector', type: 'text', placeholder: 'Semiconductors / Healthcare / Banks / AI infrastructure', required: true },
  preferredSectors: { label: 'Preferred sectors', type: 'text', placeholder: 'Technology, healthcare, energy, any', required: false },
  investmentStyle: { label: 'Investment style', type: 'text', placeholder: 'Growth / Value / Dividend / Quality', required: false },
  investmentAmount: { label: 'Investment amount', type: 'text', placeholder: '$10,000 / NT$300,000', required: false },
  minimumMarketCap: { label: 'Minimum market cap', type: 'text', placeholder: '$10B', required: false },
  timeFrame: { label: 'Technical time frame', type: 'text', placeholder: 'Daily / weekly / 6 months', required: false },
  chartContext: { label: 'Chart context', type: 'textarea', placeholder: 'Paste recent price action, support/resistance, or chart notes if available.', required: false },
  currentPosition: { label: 'Current position if any', type: 'text', placeholder: 'No position / Long 20 shares at $180 / Watching for entry', required: false },
  portfolioHoldings: { label: 'Portfolio holdings', type: 'textarea', placeholder: 'AAPL 25%, MSFT 20%, VOO 40%, cash 15%', required: true },
  portfolioValue: { label: 'Total portfolio value', type: 'text', placeholder: '$50,000 / NT$1,500,000', required: false },
  accountType: { label: 'Account type', type: 'text', placeholder: '401k / IRA / taxable / brokerage / retirement account', required: false },
  taxBracket: { label: 'Tax bracket', type: 'text', placeholder: '15% / 24% / not sure', required: false },
  age: { label: 'Age', type: 'number', placeholder: '35', required: false },
  income: { label: 'Income', type: 'text', placeholder: '$80,000 per year', required: false },
  savings: { label: 'Savings / investable assets', type: 'text', placeholder: '$25,000 saved, $10,000 available to invest', required: false },
  economicConcern: { label: 'Biggest economic concern', type: 'textarea', placeholder: 'Inflation, recession, rates, US dollar, geopolitical risk, China slowdown', required: true }
};

export function findDefaultPromptById(promptId) {
  return ANALYSIS_PROMPTS.find(prompt => prompt.id === promptId) || ANALYSIS_PROMPTS[0];
}

export function findPromptById(promptId) {
  return findDefaultPromptById(promptId);
}
