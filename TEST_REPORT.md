# Validation report

## Test dataset

`data/test-transactions.json` contains 9 records across two tickers.

Main scenarios covered:

- Two BUY records on the same ticker produce weighted average cost.
- SELL records reduce quantity and calculate realized gain/loss from the current average price.
- After all shares of one ticker are sold, a later BUY starts a new average-cost cycle.
- Editing an old BUY propagates through later transactions in the same still-active cycle only.
- Future BUY records cannot validate an earlier SELL.
- Deleting an early BUY is blocked if it makes later SELL records invalid.
- Live price failure does not modify transaction records, average price, quantity, or realized gain/loss.
- Manual current price can be used as fallback for unrealized gain/loss.

## Expected values from test dataset

ABC:

- First cycle average: `(100 × 10 + 50 × 10) / 20 = 75`
- First sell realized: `(90 - 75) × 5 - 2 = 73`
- Second sell realized: `(80 - 75) × 15 - 3 = 72`
- First cycle fully sold, realized total: `145`
- New buy after full sell starts a new cycle: average price `200`
- Final sell realized: `(180 - 200) × 1 - 1 = -21`
- ABC realized total: `124`
- ABC remaining quantity: `3`
- ABC average price: `200`

XYZ:

- First sell realized: `(40 - 30) × 1 - 0.5 = 9.5`
- Remaining before second buy: `2 @ 30`
- New average after second buy: `(30 × 2 + 60 × 2) / 4 = 45`
- XYZ remaining quantity: `4`
- XYZ realized total: `9.5`

Portfolio:

- Current invested amount: `ABC 3 × 200 + XYZ 4 × 45 = 780`
- Realized gain/loss: `124 + 9.5 = 133.5`
- With current prices `ABC = 220`, `XYZ = 50`:
  - ABC unrealized: `(220 - 200) × 3 = 60`
  - XYZ unrealized: `(50 - 45) × 4 = 20`
  - Total unrealized: `80`
  - Overall gain/loss: `213.5`

## How to run tests

From the project root:

```bash
node tests/validation-test.mjs
```

Expected result:

```text
All portfolio calculation, propagation, validation, API-failure, and sort tests passed.
```

## UI validation

Checked that every queried element in `app.js` exists in `index.html`, and every queried element in `edit.js` exists in `edit.html`.

Checked page wiring:

- `index.html` loads `./js/app.js`
- `edit.html` loads `./js/edit.js`
- both pages load `./css/style.css`

Checked important UI flows:

- dashboard add transaction form
- sell ticker selector
- JSON import/export
- manual current price fallback
- Supabase auth panel
- edit page transaction table
- edit impact preview dialog
- delete confirmation

## Fixes added during validation

1. Same-day transactions now sort by:
   - transaction date
   - `createdAt`
   - `id`

2. Deleting a transaction now validates the full remaining dataset before allowing the deletion.

3. JSON import now validates the full imported dataset before saving it.

These fixes prevent invalid later SELL transactions from being silently created by deleting/importing older records.


## Modification propagation check

When `tx_abc_001` changes from `100` to `120`, the first ABC cycle average changes from `75` to `85`.

- First sell becomes `(90 - 85) × 5 - 2 = 23`
- Second sell becomes `(80 - 85) × 15 - 3 = -78`
- First cycle realized becomes `-55`
- Later ABC buy after full liquidation stays a new cycle at average `200`
- Final ABC sell stays `-21`
- ABC realized total becomes `-76`
- Realized change from original `124` is `-200`

This confirms the edit propagates through later same-stock transactions until the old position is fully sold, and it does not affect the later new cycle.

## Break-even sell price calculator validation

Added dashboard calculator for the minimum sell price needed to avoid losing money after sell fees.

Fee rule supported:

- If gross sell amount is under the threshold, use a flat fee.
- If gross sell amount is equal to or over the threshold, use a percentage fee.

Validated cases:

- Flat fee break-even calculation below the threshold.
- Percentage fee break-even calculation above the threshold.
- Boundary behavior at the threshold.
- Calculator does not modify transactions, average cost, realized gain/loss, or Supabase records.

Command:

```bash
node tests/validation-test.mjs
```

Expected result:

```text
All portfolio calculation, propagation, validation, API-failure, sort, and break-even fee tests passed.
```


## Fee editing propagation update

Validated that transaction fees are editable after saving. Buy fees are included in the average cost basis, sell fees are deducted from realized gain/loss, and editing an old fee recalculates later transactions for the same ticker before saving. The impact dialog now displays total fee changes and per-ticker average price / remaining quantity / realized gain-loss changes.
