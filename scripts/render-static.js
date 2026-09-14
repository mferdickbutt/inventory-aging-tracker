#!/usr/bin/env node
/**
 * Bake computed inventory aging metrics into index.html so first paint needs no JavaScript.
 *
 * Usage: node scripts/render-static.js
 */
"use strict";

var fs = require("fs");
var path = require("path");
var Inventory = require("../js/inventory.js");

var ROOT = path.resolve(__dirname, "..");
var DATA_PATH = path.join(ROOT, "data", "inventory.json");
var OUT_PATH = path.join(ROOT, "index.html");

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function monthLabel(ym) {
  if (!ym || typeof ym !== "string" || ym.length < 7) return ym || "—";
  var parts = ym.split("-");
  var year = Number(parts[0]);
  var month = Number(parts[1]);
  if (!year || !month) return ym;
  return new Date(year, month - 1, 1).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function money(n, currency) {
  if (n === null || n === undefined) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);
  } catch (err) {
    return String(n);
  }
}

function signedMoney(n, currency) {
  if (n === null || n === undefined) return "—";
  var formatted = money(Math.abs(n), currency);
  if (n > 0) return "+" + formatted;
  if (n < 0) return "−" + formatted;
  return formatted;
}

function pctText(n, digits) {
  var formatted = Inventory.formatPct(n, digits == null ? 1 : digits);
  return formatted === null ? "—" : formatted + "%";
}

function signedPctPoints(n) {
  if (n === null || n === undefined) return "—";
  var abs = Math.abs(n * 100).toFixed(1);
  if (n > 0) return "+" + abs + "pp";
  if (n < 0) return "−" + abs + "pp";
  return abs + "pp";
}

function trendHtml(mom, unit) {
  if (!mom) return '<span class="trend na">MoM n/a</span>';
  var arrow = mom.direction === "up" ? "↑" : mom.direction === "down" ? "↓" : "→";
  var cls = mom.flat ? "flat" : mom.improving ? "improving" : "worsening";
  var delta;
  if (mom.flat) {
    delta = unit === "money" ? money(0) : unit === "pct" ? "0.0pp" : "0.00";
  } else if (unit === "money") {
    delta = signedMoney(mom.delta);
  } else if (unit === "pct") {
    delta = signedPctPoints(mom.delta);
  } else {
    delta = (mom.delta > 0 ? "+" : mom.delta < 0 ? "−" : "") + Math.abs(mom.delta).toFixed(4);
  }
  var word = mom.flat ? "unchanged" : mom.improving ? "improving" : "worsening";
  var pct =
    mom.pct === null || mom.pct === undefined
      ? ""
      : " · " +
        (mom.pct > 0 ? "+" : mom.pct < 0 ? "−" : "") +
        Math.abs(mom.pct * 100).toFixed(1) +
        "%";
  return (
    '<span class="trend ' +
    cls +
    '">' +
    arrow +
    " " +
    esc(delta) +
    pct +
    " MoM (" +
    word +
    ")</span>"
  );
}

function pill(vs) {
  if (!vs) return '<span class="pill">no target</span>';
  var cls = vs.meeting ? "meeting" : "missing";
  var word = vs.meeting ? "meeting" : "missing";
  return '<span class="pill ' + cls + '">' + word + " target</span>";
}

function sparkline(months) {
  var width = 1040;
  var height = 64;
  var values = months.map(function (m) {
    return m.pct90Plus;
  });
  var usable = values.filter(function (v) {
    return v !== null;
  });
  if (usable.length < 2) return "";
  var min = Math.min.apply(null, usable);
  var max = Math.max.apply(null, usable);
  var span = max - min || 1;
  var coords = [];
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    if (v === null) continue;
    var x = (i / (values.length - 1)) * width;
    var y = height - ((v - min) / span) * (height - 8) - 4;
    coords.push(x.toFixed(1) + "," + y.toFixed(1));
  }
  var last = months[months.length - 1];
  var first = months[0];
  return (
    '<div class="spark" id="aging-sparkline">' +
    '<p class="note">% aged 90+ trend (' +
    esc(monthLabel(first.month)) +
    " → " +
    esc(monthLabel(last.month)) +
    ")</p>" +
    '<svg viewBox="0 0 ' +
    width +
    " " +
    height +
    '" role="img" aria-label="% aged 90+ sparkline from ' +
    esc(pctText(first.pct90Plus)) +
    " to " +
    esc(pctText(last.pct90Plus)) +
    '">' +
    '<polyline fill="none" stroke="#1d4e89" stroke-width="3" points="' +
    coords.join(" ") +
    '" />' +
    "</svg></div>"
  );
}

function mixBar(latest) {
  function width(mix) {
    if (mix === null || mix === undefined) return 0;
    return Math.max(0, mix * 100);
  }
  function seg(cls, mix, label) {
    var w = width(mix);
    if (w <= 0) return "";
    return (
      '<div class="seg ' +
      cls +
      '" style="width:' +
      w.toFixed(1) +
      '%">' +
      esc(label + " " + pctText(mix)) +
      "</div>"
    );
  }
  return (
    '<div class="mix-bar-wrap" id="bucket-mix">' +
    '<p class="note">Bucket mix of total inventory (0–30 / 31–60 / 61–90 / 90+)</p>' +
    '<div class="mix-bar">' +
    seg("s030", latest.mix030, "0–30") +
    seg("s3160", latest.mix3160, "31–60") +
    seg("s6190", latest.mix6190, "61–90") +
    seg("s90", latest.pct90Plus, "90+") +
    "</div>" +
    '<p class="mix-legend">' +
    '<span class="l030">0–30 ' +
    esc(pctText(latest.mix030)) +
    "</span>" +
    '<span class="l3160">31–60 ' +
    esc(pctText(latest.mix3160)) +
    "</span>" +
    '<span class="l6190">61–90 ' +
    esc(pctText(latest.mix6190)) +
    "</span>" +
    '<span class="l90">90+ ' +
    esc(pctText(latest.pct90Plus)) +
    "</span></p></div>"
  );
}

function cardHtml(latest, key, title, name, valueHtml, unit) {
  var mom = latest.mom ? latest.mom[key] : null;
  var vs = latest.vsTarget ? latest.vsTarget[key] : null;
  return (
    '<article class="card" id="card-' +
    key +
    '">' +
    '<p class="label">' +
    esc(title) +
    "</p>" +
    '<p class="name">' +
    esc(name) +
    "</p>" +
    '<p class="metric-value" data-metric="' +
    key +
    '">' +
    valueHtml +
    "</p>" +
    '<div class="meta">' +
    trendHtml(mom, unit) +
    pill(vs) +
    "</div></article>"
  );
}

function signedText(formatFn, n) {
  if (n === null || n === undefined) return "—";
  var text = formatFn(Math.abs(n));
  if (n > 0) return "+" + text;
  if (n < 0) return "−" + text;
  return text;
}

function targetCard(label, vs, formatFn) {
  if (!vs) {
    return (
      '<article class="target-card"><p class="label">' +
      esc(label) +
      '</p><p class="values">—</p></article>'
    );
  }
  return (
    '<article class="target-card" data-target="' +
    esc(label) +
    '">' +
    '<p class="label">' +
    esc(label) +
    "</p>" +
    '<p class="values">' +
    esc(formatFn(vs.value)) +
    " vs " +
    esc(formatFn(vs.target)) +
    " (" +
    esc(signedText(formatFn, vs.delta)) +
    ")</p>" +
    pill(vs) +
    "</article>"
  );
}

function momShort(mom, unit) {
  if (!mom) return '<span class="trend na">n/a</span>';
  var arrow = mom.direction === "up" ? "↑" : mom.direction === "down" ? "↓" : "→";
  var cls = mom.flat ? "flat" : mom.improving ? "improving" : "worsening";
  var delta;
  if (mom.flat) {
    delta = unit === "money" ? "$0" : "0.0pp";
  } else if (unit === "money") {
    delta = signedMoney(mom.delta);
  } else {
    delta = signedPctPoints(mom.delta);
  }
  return '<span class="trend ' + cls + '">' + arrow + " " + esc(delta) + "</span>";
}

function monthTable(report) {
  var currency = report.currency || "USD";
  var head =
    "<thead><tr>" +
    "<th>Month</th>" +
    "<th>0–30</th><th>31–60</th><th>61–90</th><th>90+</th><th>Total</th>" +
    "<th>Mix 0–30</th><th>Mix 31–60</th><th>Mix 61–90</th>" +
    "<th>% aged 90+</th><th>90+ MoM</th><th>90+ vs target</th>" +
    "<th>Reserve</th><th>Reserve coverage</th><th>Coverage MoM</th><th>Coverage vs target</th>" +
    "<th>Write-offs</th><th>Write-off MoM</th><th>Write-off vs target</th>" +
    "</tr></thead>";
  var rows = report.months.map(function (row) {
    var vs90 = row.vsTarget && row.vsTarget.pct90Plus;
    var vsCov = row.vsTarget && row.vsTarget.reserveCoverage;
    var miss =
      (vs90 && vs90.meeting === false) || (vsCov && vsCov.meeting === false);
    var missClass = miss ? ' class="miss"' : "";
    return (
      '<tr data-month="' +
      esc(row.month || "") +
      '"' +
      missClass +
      ">" +
      "<td>" +
      esc(monthLabel(row.month)) +
      ' <span class="note">(' +
      esc(row.month || "") +
      ")</span></td>" +
      "<td>" +
      esc(money(row.age0to30, currency)) +
      "</td>" +
      "<td>" +
      esc(money(row.age31to60, currency)) +
      "</td>" +
      "<td>" +
      esc(money(row.age61to90, currency)) +
      "</td>" +
      "<td>" +
      esc(money(row.age90plus, currency)) +
      "</td>" +
      "<td>" +
      esc(money(row.totalInventory, currency)) +
      "</td>" +
      '<td data-mix-0-30="' +
      esc(pctText(row.mix030)) +
      '">' +
      esc(pctText(row.mix030)) +
      "</td>" +
      '<td data-mix-31-60="' +
      esc(pctText(row.mix3160)) +
      '">' +
      esc(pctText(row.mix3160)) +
      "</td>" +
      '<td data-mix-61-90="' +
      esc(pctText(row.mix6190)) +
      '">' +
      esc(pctText(row.mix6190)) +
      "</td>" +
      '<td data-pct-90="' +
      esc(pctText(row.pct90Plus)) +
      '">' +
      esc(pctText(row.pct90Plus)) +
      "</td>" +
      "<td>" +
      momShort(row.mom && row.mom.pct90Plus, "pct") +
      "</td>" +
      "<td>" +
      pill(vs90) +
      "</td>" +
      "<td>" +
      esc(money(row.obsolescenceReserve, currency)) +
      "</td>" +
      '<td data-reserve-coverage="' +
      esc(pctText(row.reserveCoverage)) +
      '">' +
      esc(pctText(row.reserveCoverage)) +
      "</td>" +
      "<td>" +
      momShort(row.mom && row.mom.reserveCoverage, "pct") +
      "</td>" +
      "<td>" +
      pill(vsCov) +
      "</td>" +
      "<td>" +
      esc(money(row.writeOffs, currency)) +
      "</td>" +
      "<td>" +
      momShort(row.mom && row.mom.writeOffs, "money") +
      "</td>" +
      "<td>" +
      pill(row.vsTarget && row.vsTarget.writeOffs) +
      "</td>" +
      "</tr>"
    );
  });
  return (
    '<div class="table-wrap"><table id="monthly-inventory">' +
    head +
    "<tbody>" +
    rows.join("") +
    "</tbody></table></div>"
  );
}

function render(dataset) {
  var report = Inventory.computeTracker(dataset);
  if (!report.latest) {
    throw new Error("No months to render");
  }
  var latest = report.latest;
  var currency = report.currency || "USD";

  var cards =
    cardHtml(
      latest,
      "mix030",
      "0–30 mix",
      "Share of total inventory aged 0–30 days",
      esc(pctText(latest.mix030)),
      "pct"
    ) +
    cardHtml(
      latest,
      "mix3160",
      "31–60 mix",
      "Share of total inventory aged 31–60 days",
      esc(pctText(latest.mix3160)),
      "pct"
    ) +
    cardHtml(
      latest,
      "mix6190",
      "61–90 mix",
      "Share of total inventory aged 61–90 days",
      esc(pctText(latest.mix6190)),
      "pct"
    ) +
    cardHtml(
      latest,
      "pct90Plus",
      "% aged 90+",
      "90+ inventory / total inventory",
      esc(pctText(latest.pct90Plus)),
      "pct"
    ) +
    cardHtml(
      latest,
      "reserveCoverage",
      "Reserve coverage",
      "Obsolescence reserve / 90+ inventory",
      esc(pctText(latest.reserveCoverage)),
      "pct"
    ) +
    cardHtml(
      latest,
      "writeOffs",
      "Monthly write-offs",
      "Inventory written off this month",
      esc(money(latest.writeOffs, currency)),
      "money"
    );

  var targets =
    '<div class="target-grid" id="target-comparison">' +
    targetCard("% aged 90+ vs ceiling", latest.vsTarget.pct90Plus, function (n) {
      return pctText(n);
    }) +
    targetCard("Reserve coverage vs floor", latest.vsTarget.reserveCoverage, function (n) {
      return pctText(n);
    }) +
    targetCard("0–30 mix vs floor", latest.vsTarget.mix030, function (n) {
      return pctText(n);
    }) +
    targetCard("Write-offs vs ceiling", latest.vsTarget.writeOffs, function (n) {
      return money(n, currency);
    }) +
    "</div>";

  var best = report.best;
  var worst = report.worst;
  var extremaHtml =
    '<div class="extrema" id="aging-extrema">' +
    "<article><h3>Best % aged 90+</h3><p>" +
    (best
      ? esc(monthLabel(best.month)) +
        " (" +
        esc(best.month) +
        "): " +
        esc(pctText(best.pct90Plus))
      : "—") +
    "</p></article>" +
    "<article><h3>Worst % aged 90+</h3><p>" +
    (worst
      ? esc(monthLabel(worst.month)) +
        " (" +
        esc(worst.month) +
        "): " +
        esc(pctText(worst.pct90Plus))
      : "—") +
    "</p></article></div>";

  var avgLine =
    "Averages across " +
    report.monthCount +
    " months: 0–30 mix " +
    pctText(report.averageMix030) +
    ", % aged 90+ " +
    pctText(report.averagePct90Plus) +
    ", reserve coverage " +
    pctText(report.averageReserveCoverage) +
    ". % aged 90+ and write-offs are ceilings (meeting when value ≤ target). 0–30 mix and reserve coverage are floors (meeting when value ≥ target).";

  return (
    "<!DOCTYPE html>\n" +
    '<html lang="en">\n' +
    "<head>\n" +
    '  <meta charset="utf-8" />\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />\n' +
    "  <title>Inventory aging tracker — " +
    esc(report.company || "Tracker") +
    "</title>\n" +
    '  <link rel="stylesheet" href="css/style.css" />\n' +
    "</head>\n" +
    "<body>\n" +
    '  <header class="hero">\n' +
    '    <div class="wrap">\n' +
    '      <p class="kicker">Inventory</p>\n' +
    "      <h1>Inventory aging and obsolescence tracker</h1>\n" +
    '      <p class="sub">' +
    esc(report.company || "Sample company") +
    " · " +
    String(report.monthCount) +
    " months of aging buckets, obsolescence reserve, and write-offs. Bucket mix, % aged 90+, reserve coverage, MoM change, and target comparison are baked into this HTML for first paint without JavaScript.</p>\n" +
    '      <div class="formula-strip" aria-label="Formulas">\n' +
    "        <code>bucket mix = bucket / total inventory</code>\n" +
    "        <code>% aged 90+ = 90+ / total inventory</code>\n" +
    "        <code>reserve coverage = obsolescence reserve / 90+ inventory</code>\n" +
    "      </div>\n" +
    "    </div>\n" +
    "  </header>\n" +
    '  <main class="wrap">\n' +
    '    <section class="section" id="latest">\n' +
    "      <h2>Latest month · " +
    esc(monthLabel(latest.month)) +
    " (" +
    esc(latest.month) +
    ") — bucket mix, % aged 90+, and reserve coverage</h2>\n" +
    '      <p class="note">' +
    esc(avgLine) +
    "</p>\n" +
    '      <div class="cards">' +
    cards +
    "</div>\n" +
    mixBar(latest) +
    targets +
    extremaHtml +
    sparkline(report.months) +
    "    </section>\n" +
    '    <section class="section" id="monthly">\n' +
    "      <h2>Monthly aging buckets, mix, reserve coverage, and write-offs</h2>\n" +
    '      <p class="note">Rows are calendar months. MoM is this month minus the prior month. A missing % aged 90+ target means the month is above the ceiling of ' +
    esc(pctText(report.targets.pct90Plus)) +
    ". A missing reserve-coverage target means the month is below the floor of " +
    esc(pctText(report.targets.reserveCoverage)) +
    ".</p>\n" +
    monthTable(report) +
    "    </section>\n" +
    "  </main>\n" +
    '  <footer class="wrap">\n' +
    "    <p>Static snapshot generated from <code>data/inventory.json</code> via <code>node scripts/render-static.js</code>. JavaScript only enhances; it does not supply these numbers.</p>\n" +
    "  </footer>\n" +
    '  <script src="js/inventory.js" defer></script>\n' +
    '  <script src="js/enhance.js" defer></script>\n' +
    "</body>\n" +
    "</html>\n"
  );
}

function main() {
  var raw = fs.readFileSync(DATA_PATH, "utf8");
  var dataset = JSON.parse(raw);
  var html = render(dataset);
  fs.writeFileSync(OUT_PATH, html);
  var report = Inventory.computeTracker(dataset);
  process.stdout.write(
    "Wrote " +
      path.relative(ROOT, OUT_PATH) +
      " (" +
      report.monthCount +
      " months, latest mix 0–30 " +
      pctText(report.latest.mix030) +
      " / % 90+ " +
      pctText(report.latest.pct90Plus) +
      " / coverage " +
      pctText(report.latest.reserveCoverage) +
      ")\n"
  );
}

main();
