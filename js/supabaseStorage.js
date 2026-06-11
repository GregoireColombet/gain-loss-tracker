import { supabaseClient, isSupabaseConfigured } from './supabaseClient.js';

function buildSupabaseError(context, error) {
  if (!error) return new Error(context);
  const detailParts = [error.message, error.details, error.hint, error.code].filter(Boolean);
  return new Error(`${context}: ${detailParts.join(' | ')}`);
}

function mapDatabaseRowToTransaction(row) {
  return {
    id: row.id,
    type: row.type,
    companyName: row.company_name,
    ticker: row.ticker,
    date: row.transaction_date,
    sharePrice: Number(row.share_price),
    quantity: Number(row.quantity),
    transactionFee: Number(row.transaction_fee ?? row.fee ?? 0),
    createdAt: row.created_at
  };
}

async function getAuthenticatedUserId(context = 'Supabase operation') {
  const { data, error } = await supabaseClient.auth.getUser();
  if (error) throw buildSupabaseError(`${context} failed because the current user could not be read`, error);
  if (!data.user) throw new Error(`${context} failed because no Supabase user is logged in.`);
  return data.user.id;
}

function mapTransactionToDatabaseRow(transaction, userId) {
  return {
    id: transaction.id,
    user_id: userId,
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

  const userId = await getAuthenticatedUserId('Load transactions');
  const { data, error } = await supabaseClient
    .from('transactions')
    .select('id,type,company_name,ticker,transaction_date,share_price,quantity,transaction_fee,created_at,user_id')
    .eq('user_id', userId)
    .order('transaction_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw buildSupabaseError('Unable to load transactions from Supabase transactions', error);
  return (data || []).map(mapDatabaseRowToTransaction);
}

export async function saveTransactionsToSupabase(transactions) {
  if (!isSupabaseConfigured()) return false;

  const userId = await getAuthenticatedUserId('Save transactions');
  const databaseRows = transactions.map(transaction => mapTransactionToDatabaseRow(transaction, userId));
  const localIds = databaseRows.map(row => row.id);

  if (databaseRows.length > 0) {
    const { error: upsertError } = await supabaseClient
      .from('transactions')
      .upsert(databaseRows, { onConflict: 'id' });

    if (upsertError) throw buildSupabaseError('Unable to save transactions to Supabase transactions', upsertError);
  }

  const { data: existingRows, error: loadExistingError } = await supabaseClient
    .from('transactions')
    .select('id')
    .eq('user_id', userId);

  if (loadExistingError) throw buildSupabaseError('Unable to verify saved Supabase transactions before cleanup', loadExistingError);

  const staleIds = (existingRows || [])
    .map(row => row.id)
    .filter(id => !localIds.includes(id));

  if (staleIds.length > 0) {
    const { error: deleteError } = await supabaseClient
      .from('transactions')
      .delete()
      .in('id', staleIds)
      .eq('user_id', userId);

    if (deleteError) throw buildSupabaseError('Unable to delete removed transactions from Supabase transactions', deleteError);
  }

  return true;
}

function mapFeeSettingsRowToFeeRules(row) {
  if (!row) return null;
  return {
    buyFeeRule: {
      thresholdAmount: Number(row.buy_threshold),
      flatFee: Number(row.buy_flat_fee),
      percentageFeeRate: Number(row.buy_percentage_fee)
    },
    sellFeeRule: {
      thresholdAmount: Number(row.sell_threshold),
      flatFee: Number(row.sell_flat_fee),
      percentageFeeRate: Number(row.sell_percentage_fee)
    }
  };
}

async function mapFeeRulesToSettingsRow(feeRules) {
  const userId = await getAuthenticatedUserId('Save fee rules');
  return {
    user_id: userId,
    buy_threshold: Number(feeRules.buyFeeRule.thresholdAmount),
    buy_flat_fee: Number(feeRules.buyFeeRule.flatFee),
    buy_percentage_fee: Number(feeRules.buyFeeRule.percentageFeeRate),
    sell_threshold: Number(feeRules.sellFeeRule.thresholdAmount),
    sell_flat_fee: Number(feeRules.sellFeeRule.flatFee),
    sell_percentage_fee: Number(feeRules.sellFeeRule.percentageFeeRate),
    updated_at: new Date().toISOString()
  };
}

export async function loadFeeRulesFromSupabase() {
  if (!isSupabaseConfigured()) return null;

  const userId = await getAuthenticatedUserId('Load fee rules');

  const { data, error } = await supabaseClient
    .from('fee_settings')
    .select('user_id,buy_threshold,buy_flat_fee,buy_percentage_fee,sell_threshold,sell_flat_fee,sell_percentage_fee,updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw buildSupabaseError('Unable to load fee rules from Supabase fee_settings', error);
  return mapFeeSettingsRowToFeeRules(data);
}

export async function saveFeeRulesToSupabase(feeRules) {
  if (!isSupabaseConfigured()) return false;

  const settingsRow = await mapFeeRulesToSettingsRow(feeRules);

  const { data, error } = await supabaseClient
    .from('fee_settings')
    .upsert(settingsRow, { onConflict: 'user_id' })
    .select('user_id,buy_threshold,buy_flat_fee,buy_percentage_fee,sell_threshold,sell_flat_fee,sell_percentage_fee,updated_at')
    .maybeSingle();

  if (error) throw buildSupabaseError('Unable to save fee rules to Supabase fee_settings', error);
  if (!data) throw new Error('Unable to save fee rules to Supabase fee_settings: no row was returned after save. Check RLS policies and authenticated user.');

  return mapFeeSettingsRowToFeeRules(data);
}
