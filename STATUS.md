# Wedding Seating Planner - status & structure

_Last updated: 2026-09-22_

## What this is
A wedding seating planner web app. Static page served from GitHub Pages; all data
lives in a Google Sheet behind a small Apps Script web app, shared live across
devices. See `SETUP.md` for the one-off Google setup.

## Where it lives (READ THIS - the structure is deliberately inconsistent)

- **This is its OWN git repo**, remote `git@github-personal:rtaylor111/wedding-seating.git`
  (i.e. https://github.com/rtaylor111/wedding-seating), branch `main`.
- On disk it sits **inside** `Documents/GitHub/Personal/Applications/`, next to the
  other small projects.
- **BUT the `Applications` folder is a monorepo** (`rtaylor111/Applications`): the
  other projects there (croatia-consulate-appointment-app, PDF Folio App,
  system-tools) are plain subfolders committed to that one repo. **This project is
  the exception** - it is a standalone repo nested inside the monorepo.
- `Applications/.gitignore` therefore ignores `wedding-planner/`, so the monorepo
  never tries to embed it. The separation is intentional, not accidental.

Why the inconsistency: the app needs its own GitHub Pages site / URL, which is a
per-repo thing - hence its own repo.

**Consequence:** it will NOT show under `github.com/rtaylor111/Applications`, and it
does NOT come along when you clone/pull `Applications` on another device.

## Live app
- URL (the link Tali uses): **https://rtaylor111.github.io/wedding-seating**
- Served from the `wedding-seating` repo's GitHub Pages (branch `main`, root).

## Using / editing on another device
- **To use it:** just open the live URL above. Data syncs via the Google Sheet, so
  every device shares the same plans - no checkout needed.
- **To edit the code:** clone it on its own -
  `git clone git@github-personal:rtaylor111/wedding-seating.git`
  (or `https://github.com/rtaylor111/wedding-seating.git` if the SSH alias isn't set
  up on that device).

## Repo conventions
- **Two page files kept byte-identical in their app code:** `index.html` (the
  deployed page, loads libraries from CDN) and `wedding-seating-offline.html` (a
  self-contained copy with libraries inlined). Every code change must be applied to
  both.
- `apps-script/Code.gs` is the backend; when it changes, redeploy via
  Apps Script -> Deploy -> Manage deployments -> pencil -> New version (keeps the
  `/exec` URL). Client-only changes never need a redeploy.

## If you ever want to make the structure consistent
Fold this into the `Applications` monorepo as a normal subfolder. This is a
contained job but **changes the live URL** (away from `rtaylor111.github.io/wedding-seating`),
so it needs: confirming Pages on the Applications repo, fixing the app's relative
paths and service-worker scope, and giving Tali the new link. Do it deliberately,
not mid-planning.

## Known / deferred
- Deferred polish (not yet built): inline plan-rename (currently a browser prompt),
  plan name on PDF/Excel exports, naming who didn't fit after a copy.
- Optional: harden `sw.js` caching (navigate-mode network-first, cache-version bump)
  so app updates always reach devices without a hard refresh.
