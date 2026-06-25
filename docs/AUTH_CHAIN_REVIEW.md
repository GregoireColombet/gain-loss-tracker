# Authentication Chain Review

## Scope
Verified the login/authentication startup path for all three top-level pages:

- Dashboard (`index.html` / `js/app.js`)
- Edit Transactions (`edit.html` / `js/edit.js`)
- Analysis (`analysis.html` / `js/analysis.js`)

## Findings Before Fix

The pages were already using a shared `createPageAuthController(...)`, which is the correct architecture. However, the startup order was not fully consistent:

- Dashboard initialized dashboard-only event bindings before shared auth.
- Analysis initialized workspace/tab UI before shared auth.
- Edit initialized shared auth first.

This meant future page-specific startup regressions could again leave the sync bar stuck on `Checking sync status...`.

## Changes Applied

### Shared Auth Controller
Improved `js/app/pageAuthController.js`:

- Added idempotent initialization guard.
- Keeps login/logout event binding single-use.
- Restores Supabase session safely without blocking UI.
- Refreshes the sync bar even if session restore fails.
- Registers a single auth listener.
- Schedules auth reload work outside the Supabase auth callback.
- Ignores stale overlapping auth reloads.
- Cleans up listener on page navigation/page cache.

### Page Startup Order
Standardized startup order:

1. Initialize shared auth controller.
2. Bind page-specific UI events.
3. Initialize page-specific widgets.
4. Load page data.
5. Render page data.

Applied to:

- `js/app.js`
- `js/edit.js`
- `js/analysis.js`

## Final Auth Chain

```text
HTML page loads
  ↓
page JS module starts
  ↓
pageAuthController.initialize()
  ↓
prefill remembered email
  ↓
restore Supabase session
  ↓
refresh sync bar
  ↓
register one auth listener
  ↓
page-specific event binding/widgets/data load
```

## Validation

- `node --check` passed for all JavaScript modules.
- Existing validation tests passed.
- Auth logic is centralized in `js/app/pageAuthController.js`.
- Dashboard, Edit and Analysis now follow the same login initialization pattern.
