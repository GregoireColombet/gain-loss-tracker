# Stock Gain/Loss Tracker

A personal and educational stock transaction tracker built with HTML, CSS, JavaScript modules, Supabase, localStorage fallback, JSON import/export, and an unofficial Yahoo Finance quote endpoint.

## Features

- Buy and sell transaction entry
- Average-cost method
- Realized gain/loss
- Unrealized gain/loss using live Yahoo Finance price when reachable
- Manual current price fallback
- API failure display: `API not reachable`
- API failure never modifies transaction records
- Supabase database sync with email magic-link sign-in and automatic session restore
- localStorage fallback when Supabase is not configured
- Transaction edit page
- Delete confirmation
- Modification impact preview before saving
- JSON export/import
- CSS in independent file
- Calculation functions isolated in `js/calculations.js`

## Important note about Yahoo Finance

The Yahoo Finance quote endpoint is used only for personal and educational use. It is unofficial and may break, be blocked by CORS, or become unreachable. When this happens, the app displays `API not reachable` and keeps all transaction records unchanged.


## Automatic Supabase login behavior

The app uses Supabase Auth with:

```javascript
persistSession: true
autoRefreshToken: true
detectSessionInUrl: true
```

This means:

```text
First visit: enter email and open the magic link.
Future visits: the browser restores the saved session automatically.
Login appears again only if you sign out, clear browser storage, use another browser/device, or the session expires.
```

The saved auth session is separate from transaction records. If the session cannot be restored, the app does not modify Supabase records.

## Supabase setup

### 1. Create a Supabase project

Create a free Supabase project.

### 2. Create the database table

Open Supabase > SQL Editor > New query.

Paste the content of:

```text
supabase-schema.sql
```

Then run it.

### 3. Enable email login

Open Supabase > Authentication > Providers > Email.

Enable email login / magic link.

### 4. Add your GitHub Pages URL

Open Supabase > Authentication > URL Configuration.

Add your GitHub Pages URL to the allowed redirect URLs, for example:

```text
https://your-github-name.github.io/your-repository-name/
```

During local development, also add:

```text
http://localhost:8000
```

### 5. Add your Supabase keys

Open:

```text
js/supabaseClient.js
```

Replace:

```javascript
export const SUPABASE_URL = 'PASTE_YOUR_SUPABASE_PROJECT_URL_HERE';
export const SUPABASE_ANON_KEY = 'PASTE_YOUR_SUPABASE_ANON_PUBLIC_KEY_HERE';
```

with your Supabase Project URL and anon public key.

Never put the Supabase `service_role` key in this project.

## How the app stores data

Permanent data:

```text
Buy transactions
Sell transactions
Company name
Ticker
Date
Share price
Quantity
Transaction fee
```

Temporary display data:

```text
Yahoo Finance live price
Manual current price fallback
Unrealized gain/loss display
```

Important rule:

```text
Live market price never overwrites transaction history.
```

## How to run locally

Because the project uses JavaScript modules and fetches a sample JSON file, open it through a local server.

```bash
cd stock-tracker
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## GitHub Pages deployment

Push the project files to your GitHub repository.

Then go to:

```text
GitHub repository > Settings > Pages
```

Choose the branch and root folder, then publish.

## File structure

```text
stock-tracker/
├── index.html
├── edit.html
├── supabase-schema.sql
├── css/
│   └── style.css
├── js/
│   ├── app.js
│   ├── edit.js
│   ├── storage.js
│   ├── supabaseClient.js
│   ├── supabaseStorage.js
│   ├── authService.js
│   ├── calculations.js
│   ├── validation.js
│   ├── chart.js
│   ├── constants.js
│   ├── marketPriceService.js
│   └── uiHelpers.js
└── data/
    └── transactions.json
```

## Break-even sell price calculator

The dashboard includes a calculator that estimates the minimum sell price needed to avoid a loss after sell transaction fees.

Inputs:

- Stock holding
- Quantity to sell
- Flat fee threshold amount
- Flat fee amount
- Percentage fee rate above the threshold

Formula behavior:

- Under the threshold: `net amount = gross sell amount - flat fee`
- At or above the threshold: `net amount = gross sell amount - percentage fee`

This calculator is a planning tool only. It does not create, edit, or delete transaction records.


### Fee editing rule

The transaction fee field is editable on both BUY and SELL transactions. BUY fees are included in the weighted average cost basis. SELL fees reduce realized gain/loss. When any historical transaction fee is edited, the app recalculates all later transactions for the same ticker and shows an impact preview before saving.

## Fee rule defaults

The dashboard now has separate BUY and SELL fee rules.

- Saving fee rules stores default settings in localStorage.
- If the optional `fee_settings` Supabase table exists, the settings also sync to Supabase.
- New BUY/SELL transactions use the saved rule by default and copy the calculated amount into `transactionFee`.
- The fee can still be manually overridden before saving.
- Existing saved transaction fees are never recalculated or rewritten when fee rules change.

If you want fee settings to sync across devices, rerun the `fee_settings` part of `supabase-schema.sql` in the Supabase SQL editor.
