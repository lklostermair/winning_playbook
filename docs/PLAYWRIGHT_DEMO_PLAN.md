# Playwright Presenter Demo Script

## Summary

Build a Playwright-based demo runner that drives the real `/` app in a visible Chromium window with slow, presenter-friendly movement. Do not restore `/demo`. The script assumes the stack is already running via `bash scripts/dev.sh`, uses visible labels/text selectors rather than `data-testid`, records video by default, and performs the full mutating update flow.

## Key Changes

- Add Playwright as a frontend dev dependency and add npm scripts:
  - `demo:install` to install Chromium for Playwright.
  - `demo:play` to run the presenter script.
- Add a root alias in `scripts/dev.py`:
  - `uv run python scripts/dev.py playwright-demo`
  - This calls the frontend `demo:play` script and does not start or reset the app.
- Add a standalone presenter script, likely `frontend/scripts/playwright-demo.mjs`, that:
  - Opens `PLAYWRIGHT_BASE_URL` or defaults to `http://127.0.0.1:5173`.
  - Launches headed Chromium with `slowMo`, viewport around `1440x1000` so the rule sidebar is visible.
  - Injects a lightweight visible cursor overlay and uses helper actions like `moveTo`, `clickVisible`, and `typeSlowly` so mouse movement is visible during the demo.
  - Records video to `frontend/demo-artifacts/videos/` by default.
- Scripted flow:
  - Wait for app readiness and visible connected state.
  - Select/show the NDA playbook.
  - Click the suggested prompt `Can we accept unlimited liability?`.
  - Wait for the answer, expand the sources button, and open the first cited source/rule.
  - Type the update instruction: `Tighten this rule so unlimited liability is not accepted without General Counsel approval.`
  - Click `Draft with dandelion`, wait for the AI draft fields to populate, then click `Update & Commit`.
  - Ask a follow-up prompt such as `After that update, can we accept unlimited liability?`.
  - Pause briefly on the final answer before closing and saving the video.
- Update demo docs/runbook to state:
  - Run `uv run python scripts/dev.py reset-demo` before the presenter demo.
  - Start the app with `bash scripts/dev.sh`.
  - Run `uv run python scripts/dev.py playwright-demo`.
  - The script mutates the vault/Git history because it commits a rule update.

## Public Interfaces

- New command: `uv run python scripts/dev.py playwright-demo`.
- New frontend commands: `npm run demo:install` and `npm run demo:play`.
- Optional environment variables:
  - `PLAYWRIGHT_BASE_URL` for non-default frontend URLs.
  - `PW_DEMO_SLOWMO_MS` to tune presentation speed.
  - `PW_DEMO_HOLD_MS` to keep the final screen visible longer.
- No backend API changes.
- No `/demo` route.
- No `data-testid` hooks added.

## Test Plan

- Run `npm --prefix frontend run demo:install` once after dependency installation.
- Run `npm --prefix frontend run build`.
- Run `npm --prefix frontend run lint`.
- With backend/frontend running and after `reset-demo`, run `uv run python scripts/dev.py playwright-demo`.
- Verify:
  - Browser opens visibly and scripted cursor movement is visible.
  - Prompt is submitted through the UI.
  - Sources expand and a cited rule opens.
  - AI draft completes, `Update & Commit` succeeds, and the follow-up answer appears.
  - A video artifact is written under `frontend/demo-artifacts/videos/`.
- Failure behavior:
  - If the app is not reachable, fail early with a clear message to run `bash scripts/dev.sh`.
  - If AI drafting times out or fails, fail clearly; do not silently skip the draft step.

## Assumptions

- The demo is intended for local presentation, not CI.
- The app is already running before the Playwright command starts.
- The default playbook is reset before each presenter run.
- The full update flow is allowed to mutate local vault files and Git history.
- Visible-label selectors are preferred even though they are less robust than `data-testid` hooks.
