const DEFAULT_BUY_FEE_RULE = Object.freeze({
  thresholdAmount: 1000,
  flatFee: 1,
  percentageFeeRate: 0.001425
});

const DEFAULT_SELL_FEE_RULE = Object.freeze({
  thresholdAmount: 1000,
  flatFee: 1,
  percentageFeeRate: 0.001425
});

export function normalizeFeeRule(rawRule = {}, defaultRule = DEFAULT_SELL_FEE_RULE) {
  const thresholdAmount = Number(rawRule.thresholdAmount);
  const flatFee = Number(rawRule.flatFee);
  const percentageFeeRate = Number(rawRule.percentageFeeRate);

  return {
    thresholdAmount: Number.isFinite(thresholdAmount) && thresholdAmount > 0
      ? thresholdAmount
      : defaultRule.thresholdAmount,
    flatFee: Number.isFinite(flatFee) && flatFee >= 0
      ? flatFee
      : defaultRule.flatFee,
    percentageFeeRate: Number.isFinite(percentageFeeRate) && percentageFeeRate >= 0 && percentageFeeRate < 1
      ? percentageFeeRate
      : defaultRule.percentageFeeRate
  };
}

export function normalizeBuyFeeRule(rawRule = {}) {
  return normalizeFeeRule(rawRule, DEFAULT_BUY_FEE_RULE);
}

export function normalizeSellFeeRule(rawRule = {}) {
  return normalizeFeeRule(rawRule, DEFAULT_SELL_FEE_RULE);
}

export function calculateTransactionFee(transactionAmount, feeRule) {
  const normalizedRule = normalizeFeeRule(feeRule);
  if (!Number.isFinite(transactionAmount) || transactionAmount <= 0) return 0;

  if (transactionAmount < normalizedRule.thresholdAmount) {
    return normalizedRule.flatFee;
  }

  return transactionAmount * normalizedRule.percentageFeeRate;
}

export function calculateBuyFee(grossBuyAmount, buyFeeRule) {
  return calculateTransactionFee(grossBuyAmount, normalizeBuyFeeRule(buyFeeRule));
}

export function calculateSellFee(grossSellAmount, sellFeeRule) {
  return calculateTransactionFee(grossSellAmount, normalizeSellFeeRule(sellFeeRule));
}

export function calculateFeeForTransaction(type, sharePrice, quantity, feeRules) {
  const grossTransactionAmount = Number(sharePrice) * Number(quantity);
  if (!Number.isFinite(grossTransactionAmount) || grossTransactionAmount <= 0) return 0;

  if (type === 'BUY') {
    return calculateBuyFee(grossTransactionAmount, feeRules.buyFeeRule);
  }

  if (type === 'SELL') {
    return calculateSellFee(grossTransactionAmount, feeRules.sellFeeRule);
  }

  return 0;
}

export function calculateMinimumBreakEvenSellPrice(averageBuyPrice, quantityToSell, sellFeeRule) {
  const normalizedRule = normalizeSellFeeRule(sellFeeRule);

  if (!Number.isFinite(averageBuyPrice) || averageBuyPrice <= 0) {
    return createInvalidBreakEvenResult('Average buy price must be greater than 0.');
  }

  if (!Number.isFinite(quantityToSell) || quantityToSell <= 0) {
    return createInvalidBreakEvenResult('Quantity to sell must be greater than 0.');
  }

  const costBasisAmount = averageBuyPrice * quantityToSell;
  const flatFeeGrossAmount = costBasisAmount + normalizedRule.flatFee;

  if (flatFeeGrossAmount < normalizedRule.thresholdAmount) {
    return createBreakEvenResult(flatFeeGrossAmount, quantityToSell, normalizedRule, 'flat');
  }

  const thresholdNetAmount = normalizedRule.thresholdAmount - calculateSellFee(normalizedRule.thresholdAmount, normalizedRule);
  if (thresholdNetAmount >= costBasisAmount) {
    return createBreakEvenResult(normalizedRule.thresholdAmount, quantityToSell, normalizedRule, 'percentage');
  }

  const percentageGrossAmount = costBasisAmount / (1 - normalizedRule.percentageFeeRate);
  return createBreakEvenResult(percentageGrossAmount, quantityToSell, normalizedRule, 'percentage');
}

function createBreakEvenResult(grossSellAmount, quantityToSell, sellFeeRule, feeMode) {
  const sellFeeAmount = calculateSellFee(grossSellAmount, sellFeeRule);
  const minimumSellPrice = grossSellAmount / quantityToSell;
  const netAmountAfterFee = grossSellAmount - sellFeeAmount;

  return {
    isValid: true,
    feeMode,
    minimumSellPrice,
    grossSellAmount,
    sellFeeAmount,
    netAmountAfterFee,
    sellFeeRule: normalizeSellFeeRule(sellFeeRule)
  };
}

function createInvalidBreakEvenResult(message) {
  return {
    isValid: false,
    message,
    minimumSellPrice: null,
    grossSellAmount: null,
    sellFeeAmount: null,
    netAmountAfterFee: null
  };
}

export function getDefaultBuyFeeRule() {
  return { ...DEFAULT_BUY_FEE_RULE };
}

export function getDefaultSellFeeRule() {
  return { ...DEFAULT_SELL_FEE_RULE };
}

export function getDefaultFeeRules() {
  return {
    buyFeeRule: getDefaultBuyFeeRule(),
    sellFeeRule: getDefaultSellFeeRule()
  };
}
