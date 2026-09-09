# Wedding Seating Planner - one-off Google setup (~10 minutes)

The app is a static page (GitHub Pages). All data lives in YOUR Google Sheet behind a small
Apps Script web app. These are the steps only you can do.

## 1. Create the Sheet + script

1. Go to https://sheets.new - name it e.g. `Wedding Seating DEV` (this first one is a
   **throwaway for testing**; the real one comes at cutover).
2. Extensions → Apps Script.
3. Delete the stub in the editor, paste the whole of `apps-script/Code.gs`, save (Ctrl+S).

## 2. Set the edit PIN

1. In the Apps Script editor: left sidebar → Project Settings (gear icon).
2. Scroll to **Script Properties** → Add script property.
3. Property: `EDIT_PIN`  Value: your edit code - **at least 8 characters** (it's what you
   and Tali will type once per device to unlock editing).

## 3. Deploy as a web app

1. Blue **Deploy** button → **New deployment**.
2. Type (gear icon) → **Web app**.
3. Description: anything. **Execute as: Me. Who has access: Anyone.**
4. Deploy → authorise when Google asks (it's your own script touching your own sheet;
   the "unverified app" warning is normal for personal scripts - Advanced → Go to project).
5. Copy the **Web app URL** (ends in `/exec`) and send it to me.

## 4. Updating the script LATER (important - keeps the URL alive)

- To update code after the first deployment: **Deploy → Manage deployments → pencil icon →
  Version: New version → Deploy.** That KEEPS the same `/exec` URL.
- **Never** use "New deployment" for an update - that mints a DIFFERENT URL and every
  saved link (including the live site) breaks. Stage 1 includes a check that proves the
  update path works before anything depends on it.

## 5. Transport test (proves the whole thing before any app code is trusted)

1. Open the test page on the live site: `https://<your-username>.github.io/wedding-seating/test.html`
   - **in a private/incognito window, signed out of Google** (that's the whole point:
   proving an anonymous stranger's browser can read, and a PIN-holder can write).
2. Paste the `/exec` URL and the PIN into the boxes, press **Run tests**.
3. Everything should go green. The "rate limit" test is a separate button because it
   deliberately locks writes for 5 minutes.

## What the backend stores

- Sheet tab `state`: cell A1 = the whole plan as JSON, B1 = a version counter.
- Sheet tab `versions`: one row per saved version (newest 30 kept).
- You can look at the data any time - it's just your spreadsheet.
