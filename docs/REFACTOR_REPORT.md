# Refactor Report

## Completed in this pass

- Centralized formatting helpers in `js/utils/formatters.js`.
- Centralized date helpers in `js/utils/dates.js`.
- Centralized text/date sorting helpers in `js/utils/sorting.js`.
- Added reusable status badge helpers in `js/ui/statusBadges.js`.
- Added reusable auth/sync bar page controller in `js/app/pageAuthController.js`.
- Refactored `analysis.js` and `edit.js` to share the auth controller.
- Removed duplicated date formatting functions from report UI modules.
- Removed duplicated table sorting comparison logic from report and transaction tables.
- Kept the dashboard business logic intact to avoid regression in the most complex page.
- Moved historical audit files from the project root into `docs/` to reduce root clutter.

## Verification

- JavaScript syntax check passed for every file under `js/`.
- Existing validation and calculation tests passed.

## Remaining recommended improvements

1. Split `css/style.css` into smaller CSS files by concern: layout, forms, tables, dashboard, analysis, badges, modals.
2. Extract dashboard fee-rule logic from `app.js` into a dedicated `dashboard/feeRulesPanel.js` module.
3. Extract dashboard chart/range controls from `app.js` into `dashboard/chartControls.js`.
4. Introduce repository modules for Supabase tables: `transactionRepository`, `analysisReportRepository`, and `promptRepository`.
5. Replace manual HTML strings with small DOM builder helpers where user-provided values are rendered.
6. Add browser-based smoke tests for Dashboard, Edit, and Analysis pages.
