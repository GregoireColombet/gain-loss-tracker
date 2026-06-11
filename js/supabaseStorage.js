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
    transaction_fee: Number(transaction.transactionFee || 0)
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
