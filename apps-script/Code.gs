/**
 * Wedding Seating Planner - backend.
 * Bound to a Google Sheet. Tabs (created automatically):
 *   state    - A1 = whole plan as JSON {guests, tables, settings}, B1 = version integer
 *   versions - one row per saved version: id, label, at (ms), state JSON, guest count
 *
 * Script property EDIT_PIN (min 8 chars) gates every write. Reads are open.
 *
 * GET  ?fn=version            -> {version}
 * GET  ?fn=state              -> {version, state}
 * GET  ?fn=versions           -> {versions:[{id,label,at,guests}...]} (metadata only)
 * GET  ?fn=getVersion&id=...  -> {id,label,at,state}
 * POST (text/plain JSON body):
 *   {pin, fn:"apply", baseVersion, patches:[{kind,id,before,after}...]}
 *      -> {version, state, conflicts:[{kind,id}...]}    (all-in-one-lock batch)
 *      -> {error:"stale", version, state}               (baseVersion out of date)
 *   {pin, fn:"saveVersion", label, state?}  -> {ok:true, id}
 *   wrong/absent pin -> {error:"pin"}; too many wrong tries -> {error:"locked"}
 */

var MAX_VERSIONS = 30;
var PIN_MAX_FAILS = 5;
var PIN_COOLDOWN_MS = 5 * 60 * 1000;

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

function sheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

/* db=test selects a fully separate store (own tabs, own PIN) - the shareable
   sandbox. Anything else is the real plan. */
function dbSfx_(v) { return v === "test" ? "_test" : ""; }

function readState_(sfx) {
  var sh = sheet_("state" + sfx);
  var raw = sh.getRange("A1").getValue();
  var v = Number(sh.getRange("B1").getValue());
  if (!raw) {
    var init = { guests: {}, tables: {}, settings: {} };
    sh.getRange("A1").setValue(JSON.stringify(init));
    sh.getRange("B1").setValue(0);
    return { state: init, version: 0 };
  }
  var state = JSON.parse(raw);
  ["guests", "tables", "settings"].forEach(function (k) {
    if (!state[k] || typeof state[k] !== "object") state[k] = {};
  });
  return { state: state, version: isFinite(v) ? v : 0 };
}

function writeState_(state, version, sfx) {
  var sh = sheet_("state" + sfx);
  sh.getRange("A1").setValue(JSON.stringify(state));
  sh.getRange("B1").setValue(version);
}

/* canonical JSON (sorted keys) so precondition comparison is key-order-proof */
function canon_(x) {
  if (x === null || x === undefined) return "null";
  if (typeof x !== "object" || Array.isArray(x)) return JSON.stringify(x);
  return "{" + Object.keys(x).sort().map(function (k) {
    return JSON.stringify(k) + ":" + canon_(x[k]);
  }).join(",") + "}";
}

function doGet(e) {
  var fn = (e && e.parameter && e.parameter.fn) || "state";
  var sfx = dbSfx_(e && e.parameter && e.parameter.db);
  if (fn === "version") {
    var v = Number(sheet_("state" + sfx).getRange("B1").getValue());
    return json_({ version: isFinite(v) ? v : 0 });
  }
  if (fn === "state") {
    var s = readState_(sfx);
    return json_({ version: s.version, state: s.state });
  }
  if (fn === "versions") {
    var rows = sheet_("versions" + sfx).getDataRange().getValues().filter(function (r) { return r[0]; });
    var list = rows.map(function (r) {
      return { id: String(r[0]), label: String(r[1]), at: Number(r[2]), guests: Number(r[4] || 0) };
    }).sort(function (a, b) { return b.at - a.at; });
    return json_({ versions: list });
  }
  if (fn === "getVersion") {
    var id = String((e.parameter && e.parameter.id) || "");
    var all = sheet_("versions" + sfx).getDataRange().getValues();
    for (var i = 0; i < all.length; i++) {
      if (String(all[i][0]) === id) {
        return json_({ id: id, label: String(all[i][1]), at: Number(all[i][2]),
          state: JSON.parse(all[i][3]) });
      }
    }
    return json_({ error: "notfound" });
  }
  return json_({ error: "unknown_fn" });
}

function pinOk_(pin, sfx) {
  var props = PropertiesService.getScriptProperties();
  var real = props.getProperty(sfx === "_test" ? "EDIT_PIN_TEST" : "EDIT_PIN");
  if (!real) return { ok: false, error: "unconfigured" };
  var fails = Number(props.getProperty("PIN_FAILS" + sfx) || 0);
  var at = Number(props.getProperty("PIN_FAILS_AT" + sfx) || 0);
  var inWindow = Date.now() - at < PIN_COOLDOWN_MS;
  if (fails >= PIN_MAX_FAILS && inWindow) return { ok: false, error: "locked" };
  if (String(pin || "") !== real) {
    props.setProperty("PIN_FAILS" + sfx, String((inWindow ? fails : 0) + 1));
    props.setProperty("PIN_FAILS_AT" + sfx, String(Date.now()));
    return { ok: false, error: "pin" };
  }
  props.deleteProperty("PIN_FAILS" + sfx);
  props.deleteProperty("PIN_FAILS_AT" + sfx);
  return { ok: true };
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); }
  catch (err) { return json_({ error: "bad_json" }); }
  var sfx = dbSfx_(body.db);
  var gate = pinOk_(body.pin, sfx);
  if (!gate.ok) return json_({ error: gate.error });
  if (body.fn === "ping") return json_({ ok: true });   // PIN check with no write
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); }
  catch (err) { return json_({ error: "busy" }); }
  try {
    if (body.fn === "apply") return apply_(body, sfx);
    if (body.fn === "saveVersion") return saveVersion_(body, sfx);
    return json_({ error: "unknown_fn" });
  } finally {
    lock.releaseLock();
  }
}

/* The whole read-check-apply-write cycle runs INSIDE the lock (doPost holds it). */
function apply_(body, sfx) {
  var cur = readState_(sfx);
  if (Number(body.baseVersion) !== cur.version) {
    return json_({ error: "stale", version: cur.version, state: cur.state });
  }
  var KINDS = { guest: "guests", table: "tables", settings: "settings" };
  var ID_RE = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
  var conflicts = [];
  var applied = 0;
  var patches = body.patches || [];
  for (var i = 0; i < patches.length; i++) {
    var p = patches[i];
    var store = KINDS[p.kind];
    if (!store) continue;
    var id = String(p.id || "");
    if (!ID_RE.test(id)) continue;
    var curVal = cur.state[store].hasOwnProperty(id) ? cur.state[store][id] : null;
    if ("before" in p && canon_(curVal) !== canon_(p.before)) {
      conflicts.push({ kind: p.kind, id: id });
      continue;
    }
    if (p.after === null || p.after === undefined) delete cur.state[store][id];
    else cur.state[store][id] = p.after;
    applied++;
  }
  // nothing applied (empty batch or all conflicts): no write, no version churn
  if (applied === 0) {
    return json_({ version: cur.version, state: cur.state, conflicts: conflicts });
  }
  var version = cur.version + 1;
  writeState_(cur.state, version, sfx);
  return json_({ version: version, state: cur.state, conflicts: conflicts });
}

function saveVersion_(body, sfx) {
  var sh = sheet_("versions" + sfx);
  var st = (body.state && typeof body.state === "object") ? body.state : readState_(sfx).state;
  var id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  var guests = Object.keys(st.guests || {}).length;
  sh.appendRow([id, String(body.label || "Untitled").slice(0, 60), Date.now(),
    JSON.stringify(st), guests]);
  var rows = sh.getDataRange().getValues()
    .map(function (r, i) { return { row: i + 1, at: Number(r[2]) }; })
    .filter(function (r) { return r.at; });
  if (rows.length > MAX_VERSIONS) {
    rows.sort(function (a, b) { return a.at - b.at; });
    var excess = rows.slice(0, rows.length - MAX_VERSIONS);
    excess.sort(function (a, b) { return b.row - a.row; });   // delete bottom-up
    for (var i = 0; i < excess.length; i++) sh.deleteRow(excess[i].row);
  }
  return json_({ ok: true, id: id });
}
