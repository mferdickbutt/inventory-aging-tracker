#!/usr/bin/env bash
# Inventory aging tracker tests: metric edge cases + static first-paint HTML.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

passed=0
failed=0

pass() {
  echo "PASS: $1"
  passed=$((passed + 1))
}

fail() {
  echo "FAIL: $1"
  failed=$((failed + 1))
}

node_ok() {
  local name="$1"
  local code="$2"
  if node -e "$code"; then
    pass "$name"
  else
    fail "$name"
  fi
}

# --- Metric engine ---

node_ok "bucket mix is each aging bucket divided by total inventory" '
const I = require("./js/inventory.js");
const row = I.computeRow({
  month: "2024-01",
  buckets: { "0-30": 500, "31-60": 200, "61-90": 200, "90+": 100 },
  obsolescenceReserve: 80,
  writeOffs: 10,
});
if (row.totalInventory !== 1000) process.exit(1);
if (Math.abs(row.mix030 - 0.5) > 1e-12) process.exit(1);
if (Math.abs(row.mix3160 - 0.2) > 1e-12) process.exit(1);
if (Math.abs(row.mix6190 - 0.2) > 1e-12) process.exit(1);
if (Math.abs(row.mix90plus - 0.1) > 1e-12) process.exit(1);
if (Math.abs(I.bucketMix(500, 1000) - 0.5) > 1e-12) process.exit(1);
'

node_ok "% aged 90+ is 90+ inventory / total inventory" '
const I = require("./js/inventory.js");
const v = I.pctAged90Plus(270000, 2550000);
if (Math.abs(v - 270000 / 2550000) > 1e-12) { console.error(v); process.exit(1); }
const row = I.computeRow({
  month: "2026-06",
  buckets: { "0-30": 1500000, "31-60": 540000, "61-90": 240000, "90+": 270000 },
});
if (Math.abs(row.pct90Plus - row.mix90plus) > 1e-12) process.exit(1);
if (Math.abs(row.pct90Plus - 270000 / 2550000) > 1e-12) process.exit(1);
'

node_ok "reserve coverage is obsolescence reserve / 90+ inventory" '
const I = require("./js/inventory.js");
const v = I.reserveCoverage(286000, 270000);
if (Math.abs(v - 286000 / 270000) > 1e-12) { console.error(v); process.exit(1); }
const row = I.computeRow({
  month: "2026-06",
  buckets: { "0-30": 1500000, "31-60": 540000, "61-90": 240000, "90+": 270000 },
  obsolescenceReserve: 286000,
});
if (Math.abs(row.reserveCoverage - 286000 / 270000) > 1e-12) process.exit(1);
'

node_ok "zero-value inventory yields null mix, % 90+, and coverage not Infinity" '
const I = require("./js/inventory.js");
const row = I.computeRow({
  month: "2024-01",
  buckets: { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 },
  obsolescenceReserve: 0,
  writeOffs: 0,
});
if (row.totalInventory !== 0) process.exit(1);
if (row.mix030 !== null || row.mix3160 !== null || row.mix6190 !== null) process.exit(1);
if (row.pct90Plus !== null || row.mix90plus !== null) process.exit(1);
if (row.reserveCoverage !== null) process.exit(1);
if (row.writeOffs !== 0) process.exit(1);
if (I.bucketMix(0, 0) !== null) process.exit(1);
if (I.pctAged90Plus(0, 0) !== null) process.exit(1);
if (I.reserveCoverage(50, 0) !== null) process.exit(1);
if (Number.isNaN(row.pct90Plus) || row.pct90Plus === Infinity) process.exit(1);
if (Number.isNaN(row.reserveCoverage) || row.reserveCoverage === Infinity) process.exit(1);
'

node_ok "empty and null buckets return null mix not NaN" '
const I = require("./js/inventory.js");
const row = I.computeRow({
  month: "2024-01",
  buckets: { "0-30": 100, "31-60": null, "61-90": "", "90+": 0 },
  obsolescenceReserve: 40,
  writeOffs: 5,
});
if (row.age0to30 !== 100 || row.age90plus !== 0) process.exit(1);
if (row.age31to60 !== null || row.age61to90 !== null) process.exit(1);
if (row.totalInventory !== 100) process.exit(1);
if (row.mix030 !== 1) process.exit(1);
if (row.mix3160 !== null || row.mix6190 !== null) process.exit(1);
if (row.pct90Plus !== 0) process.exit(1);
if (row.reserveCoverage !== null) process.exit(1);
if (Number.isNaN(row.mix3160) || row.mix3160 === Infinity) process.exit(1);
const empty = I.computeRow({ month: "2024-02", buckets: {} });
if (empty.totalInventory !== null) process.exit(1);
if (empty.mix030 !== null || empty.pct90Plus !== null) process.exit(1);
if (I.computeRow(null).pct90Plus !== null) process.exit(1);
'

node_ok "missing months in the series are skipped" '
const I = require("./js/inventory.js");
const r = I.computeTracker({
  months: [
    { month: "2025-01", buckets: { "0-30": 80, "31-60": 10, "61-90": 5, "90+": 5 }, obsolescenceReserve: 4, writeOffs: 1 },
    null,
    undefined,
    { month: "2025-03", buckets: { "0-30": 70, "31-60": 15, "61-90": 5, "90+": 10 }, obsolescenceReserve: 8, writeOffs: 2 },
  ],
});
if (r.monthCount !== 2 || r.months.length !== 2) process.exit(1);
if (r.months[0].month !== "2025-01" || r.months[1].month !== "2025-03") process.exit(1);
if (r.months[0].mom.pct90Plus !== null) process.exit(1);
if (!r.months[1].mom.pct90Plus || typeof r.months[1].mom.pct90Plus.delta !== "number") process.exit(1);
'

node_ok "zero reserve against positive 90+ yields coverage 0 not null" '
const I = require("./js/inventory.js");
const v = I.reserveCoverage(0, 100);
if (v !== 0) { console.error(v); process.exit(1); }
if (v === null || Number.isNaN(v) || v === Infinity) process.exit(1);
'

node_ok "null inputs return null not NaN" '
const I = require("./js/inventory.js");
if (I.bucketMix(null, 1) !== null) process.exit(1);
if (I.bucketMix(1, null) !== null) process.exit(1);
if (I.pctAged90Plus(null, 10) !== null) process.exit(1);
if (I.reserveCoverage(null, 10) !== null) process.exit(1);
if (I.reserveCoverage(10, null) !== null) process.exit(1);
if (I.totalInventory(null) !== null) process.exit(1);
const row = I.computeRow({ month: "2024-01", buckets: { "0-30": null, "31-60": null, "61-90": null, "90+": null } });
if (row.totalInventory !== null || row.pct90Plus !== null || row.reserveCoverage !== null) process.exit(1);
if (Number.isNaN(row.pct90Plus) || row.pct90Plus === Infinity) process.exit(1);
'

node_ok "empty series returns empty months and null latest" '
const I = require("./js/inventory.js");
const r = I.computeTracker({ company: "T", months: [] });
if (r.months.length !== 0 || r.latest !== null || r.best !== null || r.worst !== null) process.exit(1);
if (r.averagePct90Plus !== null || r.monthCount !== 0) process.exit(1);
'

node_ok "null dataset is safe" '
const I = require("./js/inventory.js");
const r = I.computeTracker(null);
if (!r || r.months.length !== 0 || r.latest !== null) process.exit(1);
if (r.monthCount !== 0) process.exit(1);
'

node_ok "never emits NaN or Infinity on sample data" '
const I = require("./js/inventory.js");
const data = require("./data/inventory.json");
const r = I.computeTracker(data);
function walk(obj) {
  if (obj === null || obj === undefined) return;
  if (typeof obj === "number") {
    if (!Number.isFinite(obj)) process.exit(1);
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) walk(item);
    return;
  }
  if (typeof obj === "object") {
    for (const key of Object.keys(obj)) walk(obj[key]);
  }
}
walk(r);
if (r.monthCount < 15) process.exit(1);
const latest = r.latest;
const total = latest.age0to30 + latest.age31to60 + latest.age61to90 + latest.age90plus;
if (Math.abs(latest.totalInventory - total) > 1e-9) process.exit(1);
if (Math.abs(latest.pct90Plus - latest.age90plus / total) > 1e-12) process.exit(1);
if (Math.abs(latest.reserveCoverage - latest.obsolescenceReserve / latest.age90plus) > 1e-12) process.exit(1);
if (Math.abs(latest.mix030 - latest.age0to30 / total) > 1e-12) process.exit(1);
'

node_ok "MoM is null on first month and signed after" '
const I = require("./js/inventory.js");
const data = require("./data/inventory.json");
const r = I.computeTracker(data);
if (r.months[0].mom.pct90Plus !== null) process.exit(1);
if (r.months[0].mom.reserveCoverage !== null) process.exit(1);
if (r.months[0].mom.mix030 !== null) process.exit(1);
const second = r.months[1];
if (!second.mom.pct90Plus || typeof second.mom.pct90Plus.delta !== "number") process.exit(1);
if (!Number.isFinite(second.mom.pct90Plus.delta)) process.exit(1);
const expected = Math.round((second.pct90Plus - r.months[0].pct90Plus) * 10000) / 10000;
if (second.mom.pct90Plus.delta !== expected) process.exit(1);
'

node_ok "momTrend null previous or current returns null" '
const I = require("./js/inventory.js");
if (I.momTrend(null, 1, true) !== null) process.exit(1);
if (I.momTrend(1, null, true) !== null) process.exit(1);
if (I.momTrend(null, null, true) !== null) process.exit(1);
const t = I.momTrend(0.10, 0.12, false, 4);
if (!t || t.improving !== true || t.direction !== "down") process.exit(1);
const z = I.momTrend(10, 0, true);
if (!z || z.delta !== 10 || z.pct !== null) process.exit(1);
'

node_ok "target comparison meeting and missing" '
const I = require("./js/inventory.js");
const meetCeil = I.vsTarget(0.10, 0.12, false);
if (!meetCeil || meetCeil.meeting !== true) process.exit(1);
const missCeil = I.vsTarget(0.18, 0.12, false);
if (!missCeil || missCeil.meeting !== false) process.exit(1);
const meetFloor = I.vsTarget(1.05, 0.80, true);
if (!meetFloor || meetFloor.meeting !== true) process.exit(1);
const missFloor = I.vsTarget(0.60, 0.80, true);
if (!missFloor || missFloor.meeting !== false) process.exit(1);
if (I.vsTarget(null, 1, true) !== null) process.exit(1);
if (I.vsTarget(1, 0, true).pct !== null) process.exit(1);
const data = require("./data/inventory.json");
const r = I.computeTracker(data);
if (r.latest.vsTarget.pct90Plus == null) process.exit(1);
if (r.latest.vsTarget.reserveCoverage == null) process.exit(1);
if (r.latest.vsTarget.mix030 == null) process.exit(1);
if (r.latest.vsTarget.writeOffs == null) process.exit(1);
if (r.latest.vsTarget.pct90Plus.meeting !== true) process.exit(1);
if (r.latest.vsTarget.reserveCoverage.meeting !== true) process.exit(1);
'

node_ok "sample data has at least 15 months with required inputs and targets" '
const data = require("./data/inventory.json");
if (!Array.isArray(data.months) || data.months.length < 15) process.exit(1);
if (data.targets == null) process.exit(1);
if (data.targets.pct90Plus == null || data.targets.reserveCoverage == null) process.exit(1);
if (data.targets.mix030 == null || data.targets.writeOffs == null) process.exit(1);
for (const row of data.months) {
  if (!row.month || !row.buckets) process.exit(1);
  if (row.buckets["0-30"] == null || row.buckets["31-60"] == null) process.exit(1);
  if (row.buckets["61-90"] == null || row.buckets["90+"] == null) process.exit(1);
  if (row.obsolescenceReserve == null || row.writeOffs == null) process.exit(1);
}
const r = require("./js/inventory.js").computeTracker(data);
if (!r.best || !r.worst || r.best.pct90Plus > r.worst.pct90Plus) process.exit(1);
'

# --- Static HTML first paint ---

if [[ ! -f index.html ]]; then
  fail "index.html exists"
else
  pass "index.html exists"
fi

if grep -qi "Loading" index.html; then
  fail "static HTML has no Loading shell"
else
  pass "static HTML has no Loading shell"
fi

if grep -qi "bucket mix" index.html && grep -qi "% aged 90+" index.html && grep -qi "reserve coverage" index.html; then
  pass "static HTML contains bucket mix / % 90+ / reserve coverage content"
else
  fail "static HTML contains bucket mix / % 90+ / reserve coverage content"
fi

if [[ -f .nojekyll ]]; then
  pass ".nojekyll exists for GitHub Pages"
else
  fail ".nojekyll exists for GitHub Pages"
fi

node_ok "static HTML contains computed latest metric numbers" '
const fs = require("fs");
const I = require("./js/inventory.js");
const data = require("./data/inventory.json");
const html = fs.readFileSync("index.html", "utf8");
const r = I.computeTracker(data);
const mix = I.formatPct(r.latest.mix030, 1) + "%";
const pct90 = I.formatPct(r.latest.pct90Plus, 1) + "%";
const cov = I.formatPct(r.latest.reserveCoverage, 1) + "%";
if (!html.includes(mix)) { console.error("missing mix", mix); process.exit(1); }
if (!html.includes(pct90)) { console.error("missing % 90+", pct90); process.exit(1); }
if (!html.includes(cov)) { console.error("missing coverage", cov); process.exit(1); }
if (!html.includes("data-metric=\"mix030\"")) process.exit(1);
if (!html.includes("data-metric=\"pct90Plus\"")) process.exit(1);
if (!html.includes("data-metric=\"reserveCoverage\"")) process.exit(1);
if (!html.includes("<table")) process.exit(1);
if (!html.includes("id=\"monthly-inventory\"")) process.exit(1);
if (html.toLowerCase().includes("loading")) process.exit(1);
'

node_ok "static HTML has a row for every sample month" '
const fs = require("fs");
const I = require("./js/inventory.js");
const data = require("./data/inventory.json");
const html = fs.readFileSync("index.html", "utf8");
const r = I.computeTracker(data);
if (r.months.length < 15) process.exit(1);
for (const row of r.months) {
  if (!html.includes("data-month=\"" + row.month + "\"")) { console.error("missing month", row.month); process.exit(1); }
}
if (!html.includes("target-comparison")) process.exit(1);
if (!html.includes("Best % aged 90+") || !html.includes("Worst % aged 90+")) process.exit(1);
if (!html.includes("id=\"bucket-mix\"")) process.exit(1);
'

# curl first-paint (no JS execution)
PORT=8768
python3 -m http.server "$PORT" --bind 127.0.0.1 >/tmp/inventory-http.log 2>&1 &
HTTP_PID=$!
cleanup() { kill "$HTTP_PID" 2>/dev/null || true; }
trap cleanup EXIT

ready=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf "http://127.0.0.1:${PORT}/" >/dev/null; then
    ready=1
    break
  fi
  sleep 0.2
done

if [[ "$ready" -ne 1 ]]; then
  fail "local HTTP server started for curl"
else
  pass "local HTTP server started for curl"
  HTML="$(curl -sL "http://127.0.0.1:${PORT}/")"
  if echo "$HTML" | grep -qi "bucket mix" && echo "$HTML" | grep -qi "% aged 90+" && echo "$HTML" | grep -qi "reserve coverage"; then
    pass "curl first-paint contains bucket mix / % 90+ / reserve coverage content"
  else
    fail "curl first-paint contains bucket mix / % 90+ / reserve coverage content"
  fi
  LATEST_MIX="$(node -e 'const I=require("./js/inventory.js"); const r=I.computeTracker(require("./data/inventory.json")); process.stdout.write(I.formatPct(r.latest.mix030,1)+"%");')"
  LATEST_90="$(node -e 'const I=require("./js/inventory.js"); const r=I.computeTracker(require("./data/inventory.json")); process.stdout.write(I.formatPct(r.latest.pct90Plus,1)+"%");')"
  LATEST_COV="$(node -e 'const I=require("./js/inventory.js"); const r=I.computeTracker(require("./data/inventory.json")); process.stdout.write(I.formatPct(r.latest.reserveCoverage,1)+"%");')"
  if echo "$HTML" | grep -q "$LATEST_MIX" && echo "$HTML" | grep -q "$LATEST_90" && echo "$HTML" | grep -q "$LATEST_COV"; then
    pass "curl first-paint contains latest bucket mix / % 90+ / reserve coverage numbers"
  else
    fail "curl first-paint contains latest bucket mix / % 90+ / reserve coverage numbers"
  fi
  if echo "$HTML" | grep -q "data-month="; then
    pass "curl first-paint contains monthly table rows"
  else
    fail "curl first-paint contains monthly table rows"
  fi
  if echo "$HTML" | grep -qi "Loading"; then
    fail "curl first-paint has no Loading shell"
  else
    pass "curl first-paint has no Loading shell"
  fi
  MONTH_ROWS="$(printf '%s' "$HTML" | grep -o 'data-month=' | wc -l | tr -d ' ')"
  if [[ "$MONTH_ROWS" -ge 15 ]]; then
    pass "curl first-paint has at least 15 month rows"
  else
    fail "curl first-paint has at least 15 month rows"
  fi
fi

echo "Summary: ${passed} passed, ${failed} failed"
if [[ "$failed" -ne 0 ]]; then
  exit 1
fi
exit 0
