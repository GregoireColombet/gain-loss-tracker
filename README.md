# Stock Gain/Loss Tracker

A personal and educational stock transaction tracker built with HTML, CSS, JavaScript modules, Supabase, localStorage fallback, JSON import/export, and the Finnhub quote API.

## Features

- Buy and sell transaction entry
- Average-cost method
- Realized gain/loss
- Unrealized gain/loss using live Finnhub price when reachable
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

## Important note about Finnhub

The Finnhub quote API is used only for temporary current-price display. If the API key is missing, rate-limited, blocked, or unreachable, the app displays `API not reachable` and keeps all transaction records unchanged.


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
Finnhub live price
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

## Finnhub market price API

Current market prices are fetched from Finnhub using `js/marketPriceService.js`.

To enable live prices, open `js/marketPriceService.js` and replace:

```js
const FINNHUB_API_KEY = 'PASTE_YOUR_FINNHUB_API_KEY_HERE';
```

with your Finnhub API key.

Because this is a browser-only app, the API key is visible in the frontend. For production use, move the Finnhub request to a backend endpoint or Supabase Edge Function and keep the secret key server-side.

## AI company analysis with Gemini

This build includes a dashboard panel that sends prompt templates to the Supabase Edge Function named `generate-company-analysis`.

Expected Edge Function request body:

```json
{
  "promptId": "competitive-analysis",
  "promptText": "Final rendered prompt text",
  "parameters": {
    "companyName": "Apple Inc.",
    "ticker": "AAPL"
  }
}
```

Expected Edge Function response body:

```json
{
  "success": true,
  "result": "Markdown analysis result from Gemini"
}
```

Prompt templates are stored in `ai/prompts/`, and metadata for UI fields is stored in `js/ai/promptRegistry.js`.

Optional report persistence uses the `analysis_reports` table. If the table is not installed, the app still displays the result and saves the latest reports in localStorage. Run `supabase-analysis-reports-schema.sql` to enable Supabase persistence.

## Supabase Edge Function for market prices

The dashboard calls a Supabase Edge Function named `get-stock-price`.
If the browser console shows `functions/v1/get-stock-price 404`, deploy the function included in this project:

```bash
supabase secrets set FINNHUB_API_KEY=YOUR_FINNHUB_KEY
supabase functions deploy get-stock-price --no-verify-jwt
```

The function source is located at:

```text
supabase/functions/get-stock-price/index.ts
```

After deploying, clear the temporary disabled flag in the browser if needed:

```js
localStorage.removeItem('stockTrackerStockPriceFunctionDisabled')
```


## Editable AI prompts

The Analysis page now supports both default prompts and user-created custom prompts.

- Default prompts stay in `ai/prompts/` as read-only templates.
- Custom prompt edits and blank prompts are saved in Supabase table `ai_prompts`.
- If Supabase persistence is unavailable, custom prompts are saved locally in browser storage.
- Run `supabase-ai-prompts-schema.sql` in Supabase SQL Editor to enable cloud persistence.

Each custom prompt stores:

- title
- category
- description
- prompt text
- dynamic parameters JSON
- Gemini generation settings (`temperature`, `topP`, `maxOutputTokens`)

Default generation settings are:

```js
temperature: 0.3
topP: 0.8
maxOutputTokens: 4096
```

Run this migration if your `ai_prompts` table was created before per-prompt generation settings were added:

```sql
\i supabase-ai-prompts-generation-config-migration.sql
```

Optionally record the settings used for each saved report:

```sql
\i supabase-analysis-reports-generation-config-migration.sql
```

The Generate Analysis form builds its fields from each prompt's parameters, and the folding prompt preview shows the selected prompt before sending it to Gemini.


### Gemini error handling

The Analysis page now maps common Gemini / Google AI Studio errors into user-friendly messages:

- `400` invalid prompt or parameters
- `401` missing or invalid `GEMINI_API_KEY`
- `403` model/API access denied
- `404` configured model unavailable
- `429` rate limit reached
- `500` Google AI internal error
- `503` Gemini temporarily busy / overloaded

Transient errors (`429`, `500`, `503`) retry automatically with short backoff before the user sees an error card. Failed reports are stored with `status = failed` when the `analysis_reports` status migration has been applied.

Run this migration if your table was created before error tracking was added:

```sql
\i supabase-analysis-reports-status-migration.sql
```

Redeploy the included Edge Function after updating Gemini handling:

```bash
supabase secrets set GEMINI_API_KEY=YOUR_GEMINI_KEY
supabase functions deploy generate-company-analysis --no-verify-jwt
```

## Application version

The app version displayed in the Supabase sync bar is defined in:

```text
js/config/version.js
```

Update `version`, `githubTag`, and `buildDate` before creating a GitHub tag/release so the deployed UI version matches the GitHub release version.

## GitHub Pages runtime version

The app displays its runtime version in the Supabase sync bar.

Version metadata is loaded from `version.json` at runtime. The included GitHub Actions workflow at `.github/workflows/pages.yml` regenerates `version.json` on each GitHub Pages deployment using:

- the latest Git tag, for example `v1.2.3`
- the short commit SHA
- the UTC build date

Recommended release flow:

```bash
git tag v1.2.3
git push origin v1.2.3
git push origin main
```

When GitHub Pages deploys, the displayed app version matches the latest reachable Git tag. If no tag exists, the workflow displays a development version such as `dev-a1b2c3d`.

For local ZIP testing, the bundled `version.json` and `js/config/version.js` fallback display `v1.0.0`.
