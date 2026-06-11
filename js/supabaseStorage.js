import { supabaseClient, isSupabaseConfigured } from './supabaseClient.js';

function mapDatabaseRowToTransaction(row) {
  return {
    id: row.id,
    type: row.type,
    companyName: row.company_name,
    ticker: row.ticker,
    date: row.transaction_date,
    sharePrice: Number(row.share_price),
    quantity: Number(row.quantity),
    transactionFee: Number(row.transaction_fee || 0),
    createdAt: row.created_at
  };
}

function mapTransactionToDatabaseRow(transaction) {
  return {
    id: transaction.id,
    type: transaction.type,
    company_name: transaction.companyName,
    ticker: transaction.ticker.toUpperCase(),
    transaction_date: transaction.date,
    share_price: Number(transaction.sharePrice),
    quantity: Number(transaction.quantity),
    transaction_fee: Number(transaction.transactionFee || 0),
    created_at: transaction.createdAt || new Date().toISOString()
  };
}

export async function loadTransactionsFromSupabase() {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await supabaseClient
    .from('transactions')
    .select('*')
    .order('transaction_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data.map(mapDatabaseRowToTransaction);
}

export async function saveTransactionsToSupabase(transactions) {
  if (!isSupabaseConfigured()) return false;

  const databaseRows = transactions.map(mapTransactionToDatabaseRow);

  const { error: deleteError } = await supabaseClient
    .from('transactions')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (deleteError) throw deleteError;

  if (databaseRows.length === 0) return true;

  const { error: insertError } = await supabaseClient
    .from('transactions')
    .insert(databaseRows);

  if (insertError) throw insertError;
  return true;
}

function mapFeeSettingsRowToFeeRules(row) {
  if (!row) return null;
  return {
    buyFeeRule: {
      thresholdAmount: Number(row.buy_threshold_amount),
      flatFee: Number(row.buy_flat_fee),
      percentageFeeRate: Number(row.buy_percentage_fee_rate)
    },
    sellFeeRule: {
      thresholdAmount: Number(row.sell_threshold_amount),
      flatFee: Number(row.sell_flat_fee),
      percentageFeeRate: Number(row.sell_percentage_fee_rate)
    }
  };
}

function mapFeeRulesToSettingsRow(feeRules) {
  return {
    id: 'default',
    buy_threshold_amount: Number(feeRules.buyFeeRule.thresholdAmount),
    buy_flat_fee: Number(feeRules.buyFeeRule.flatFee),
    buy_percentage_fee_rate: Number(feeRules.buyFeeRule.percentageFeeRate),
    sell_threshold_amount: Number(feeRules.sellFeeRule.thresholdAmount),
    sell_flat_fee: Number(feeRules.sellFeeRule.flatFee),
    sell_percentage_fee_rate: Number(feeRules.sellFeeRule.percentageFeeRate),
    updated_at: new Date().toISOString()
  };
}

export async function loadFeeRulesFromSupabase() {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await supabaseClient
    .from('fee_settings')
    .select('*')
    .eq('id', 'default')
    .maybeSingle();

  if (error) throw error;
  return mapFeeSettingsRowToFeeRules(data);
}

export async function saveFeeRulesToSupabase(feeRules) {
  if (!isSupabaseConfigured()) return false;

  const { error } = await supabaseClient
    .from('fee_settings')
    .upsert(mapFeeRulesToSettingsRow(feeRules), { onConflict: 'id' });

  if (error) throw error;
  return true;
}
