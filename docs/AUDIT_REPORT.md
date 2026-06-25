# Code Audit Report

## Scope
Audited the latest build for:
- orphan JavaScript methods
- selector / ID mismatches between HTML and JS
- unused or unnecessary class references
- HTML tag structure and duplicate IDs
- failure feedback for user-triggered actions
- JavaScript syntax validity
- existing portfolio and fee-rule validation tests

## Results

### JavaScript methods
- Removed orphan functions:
  - `loadSellFeeRule`
  - `saveSellFeeRule`
  - `getFieldLabelText`
- Re-ran orphan-function scan after cleanup: no orphan functions found.

### HTML / JS selector wiring
- Checked every `querySelector('#...')` and `getElementById('...')` usage against `index.html` and `edit.html`.
- Result: no missing IDs.
- Checked duplicate IDs.
- Result: no duplicate IDs.

### HTML tags / encapsulation
- Parsed both HTML files successfully.
- No duplicate IDs detected.
- Forms, dialogs, navigation, tables, and section containers remain encapsulated in their page-level panels.

### CSS classes
- No JS/HTML class names were found missing from CSS.
- Dynamic classes such as `positive-value`, `negative-value`, `company-card-header`, and `table-actions` are intentionally created by JavaScript and retained.
- Repeated CSS selectors are mainly responsive/media-query overrides, not accidental orphan class calls.

### Failure feedback
Improved failure feedback so user-triggered failures now surface messages in the UI instead of only console logs.

Added or improved feedback for:
- dashboard startup failure
- edit-page startup failure
- auth-session refresh failure
- logout failure
- fee-rule input setup mismatch
- break-even fee-rule sync failure
- manual current price save failure
- import failure cleanup
- missing transaction during edit/delete
- missing pending change during confirmation
- save failure on edit page with error detail

### Validation and tests
Ran:

```bash
node --check js/*.js tests/*.mjs
node tests/validation-test.mjs
```

Result:

```text
All portfolio calculation, propagation, validation, API-failure, sort, chart range grouping, graph display-unit, default transaction fee-rule, and break-even fee tests passed.
```

## Additional code checks recommended next

1. Add automated browser UI tests with Playwright for login state, add transaction, edit transaction, delete transaction, fee rules, and mobile layout.
2. Add Supabase integration tests using a test project or mocked Supabase client.
3. Add an accessibility check with axe-core for form labels, dialog focus, contrast, and keyboard navigation.
4. Add a CSS lint step with Stylelint to control duplicate selectors and responsive override order.
5. Add ESLint with `no-unused-vars`, `no-undef`, and `consistent-return` rules.
6. Add a deployment checklist verifying `SUPABASE_URL`, `SUPABASE_ANON_KEY`, GitHub Pages redirect URL, and Supabase RLS policies.
7. Add error logging levels: user-facing message for the user, detailed error in console for developer debugging.
