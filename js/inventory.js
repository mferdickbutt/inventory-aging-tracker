/**
 * Inventory aging and obsolescence metrics.
 * Works in the browser (global Inventory) and in Node (module.exports).
 *
 *   Bucket mix           = bucket / total inventory
 *   % aged 90+           = 90+ inventory / total inventory
 *   Reserve coverage     = obsolescence reserve / 90+ inventory
 *
 * Total inventory is the sum of finite aging buckets (0–30, 31–60, 61–90, 90+).
 * Unsafe inputs (null/empty, non-finite, zero total, zero 90+ for coverage)
 * return null. Never returns NaN or Infinity.
 */
(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    global.Inventory = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DEFAULT_POLARITY = {
    mix030: true,
    mix3160: false,
    mix6190: false,
    pct90Plus: false,
    reserveCoverage: true,
    writeOffs: false,
  };

  var METRIC_KEYS = [
    "mix030",
    "mix3160",
    "mix6190",
    "pct90Plus",
    "reserveCoverage",
    "writeOffs",
  ];

  var BUCKET_ALIASES = {
    age0to30: ["0-30", "age0to30", "d030"],
    age31to60: ["31-60", "age31to60", "d3160"],
    age61to90: ["61-90", "age61to90", "d6190"],
    age90plus: ["90+", "age90plus", "age90Plus", "d90plus"],
  };

  function toNum(value) {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "string" && value.trim() === "") return null;
    var n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return null;
    return n;
  }

  function finiteOrNull(n) {
    if (n === null || n === undefined) return null;
    if (!Number.isFinite(n)) return null;
    return n;
  }

  function ratio(numer, denom) {
    var n = toNum(numer);
    var d = toNum(denom);
    if (n === null || d === null || d === 0) return null;
    return finiteOrNull(n / d);
  }

  function pickField(input, keys) {
    if (!input || typeof input !== "object") return null;
    var sources = [];
    if (input.buckets && typeof input.buckets === "object") sources.push(input.buckets);
    sources.push(input);
    for (var s = 0; s < sources.length; s++) {
      var obj = sources[s];
      for (var i = 0; i < keys.length; i++) {
        if (Object.prototype.hasOwnProperty.call(obj, keys[i])) {
          return toNum(obj[keys[i]]);
        }
      }
    }
    return null;
  }

  function readBuckets(input) {
    return {
      age0to30: pickField(input, BUCKET_ALIASES.age0to30),
      age31to60: pickField(input, BUCKET_ALIASES.age31to60),
      age61to90: pickField(input, BUCKET_ALIASES.age61to90),
      age90plus: pickField(input, BUCKET_ALIASES.age90plus),
    };
  }

  function totalInventoryFromValues(age0to30, age31to60, age61to90, age90plus) {
    var vals = [toNum(age0to30), toNum(age31to60), toNum(age61to90), toNum(age90plus)];
    var sum = 0;
    var seen = false;
    for (var i = 0; i < vals.length; i++) {
      if (vals[i] === null) continue;
      seen = true;
      sum += vals[i];
    }
    if (!seen) return null;
    return finiteOrNull(sum);
  }

  function totalInventory(inputOrA, b, c, d) {
    if (arguments.length >= 4) {
      return totalInventoryFromValues(inputOrA, b, c, d);
    }
    if (inputOrA && typeof inputOrA === "object") {
      var buckets = readBuckets(inputOrA);
      return totalInventoryFromValues(
        buckets.age0to30,
        buckets.age31to60,
        buckets.age61to90,
        buckets.age90plus
      );
    }
    return totalInventoryFromValues(inputOrA, b, c, d);
  }

  function bucketMix(bucket, total) {
    return ratio(bucket, total);
  }

  function pctAged90Plus(age90plus, total) {
    return ratio(age90plus, total);
  }

  function reserveCoverage(reserve, age90plus) {
    return ratio(reserve, age90plus);
  }

  function emptyMom() {
    return {
      mix030: null,
      mix3160: null,
      mix6190: null,
      pct90Plus: null,
      reserveCoverage: null,
      writeOffs: null,
    };
  }

  function emptyVsTarget() {
    return {
      mix030: null,
      mix3160: null,
      mix6190: null,
      pct90Plus: null,
      reserveCoverage: null,
      writeOffs: null,
    };
  }

  function emptyRow() {
    return {
      month: null,
      age0to30: null,
      age31to60: null,
      age61to90: null,
      age90plus: null,
      obsolescenceReserve: null,
      writeOffs: null,
      totalInventory: null,
      mix030: null,
      mix3160: null,
      mix6190: null,
      mix90plus: null,
      pct90Plus: null,
      reserveCoverage: null,
      bucketMix: {
        "0-30": null,
        "31-60": null,
        "61-90": null,
        "90+": null,
      },
      mom: emptyMom(),
      vsTarget: emptyVsTarget(),
    };
  }

  function computeRow(input) {
    if (!input || typeof input !== "object") {
      return emptyRow();
    }
    var buckets = readBuckets(input);
    var reserve = pickField(input, ["obsolescenceReserve", "reserve"]);
    var writeOffs = pickField(input, ["writeOffs", "writeoffs", "writeOff"]);
    var total = totalInventoryFromValues(
      buckets.age0to30,
      buckets.age31to60,
      buckets.age61to90,
      buckets.age90plus
    );
    var mix030 = bucketMix(buckets.age0to30, total);
    var mix3160 = bucketMix(buckets.age31to60, total);
    var mix6190 = bucketMix(buckets.age61to90, total);
    var mix90plus = bucketMix(buckets.age90plus, total);
    var row = emptyRow();
    row.month = input.month == null ? null : String(input.month);
    row.age0to30 = buckets.age0to30;
    row.age31to60 = buckets.age31to60;
    row.age61to90 = buckets.age61to90;
    row.age90plus = buckets.age90plus;
    row.obsolescenceReserve = reserve;
    row.writeOffs = writeOffs;
    row.totalInventory = total;
    row.mix030 = mix030;
    row.mix3160 = mix3160;
    row.mix6190 = mix6190;
    row.mix90plus = mix90plus;
    row.pct90Plus = mix90plus;
    row.reserveCoverage = reserveCoverage(reserve, buckets.age90plus);
    row.bucketMix = {
      "0-30": mix030,
      "31-60": mix3160,
      "61-90": mix6190,
      "90+": mix90plus,
    };
    return row;
  }

  function momTrend(current, previous, higherIsBetter, roundDigits) {
    var c = toNum(current);
    var p = toNum(previous);
    if (c === null || p === null) return null;
    var delta = c - p;
    if (!Number.isFinite(delta)) return null;
    var digits = roundDigits == null ? 4 : roundDigits;
    var factor = Math.pow(10, digits);
    var rounded = Math.round(delta * factor) / factor;
    if (!Number.isFinite(rounded)) return null;
    if (rounded === 0) rounded = 0;
    var direction = rounded > 0 ? "up" : rounded < 0 ? "down" : "flat";
    var improving = false;
    if (direction !== "flat" && higherIsBetter != null) {
      improving = higherIsBetter ? rounded > 0 : rounded < 0;
    }
    var pct = p === 0 ? null : finiteOrNull(delta / Math.abs(p));
    return {
      delta: rounded,
      pct: pct,
      direction: direction,
      improving: improving,
      flat: direction === "flat",
    };
  }

  function vsTarget(value, target, higherIsBetter) {
    var v = toNum(value);
    var t = toNum(target);
    if (v === null || t === null) return null;
    var delta = finiteOrNull(v - t);
    if (delta === null) return null;
    var pct = t === 0 ? null : finiteOrNull(delta / Math.abs(t));
    var betterHigh = higherIsBetter !== false;
    var meeting = betterHigh ? v >= t : v <= t;
    return {
      value: v,
      target: t,
      delta: delta,
      pct: pct,
      meeting: meeting,
      higherIsBetter: betterHigh,
    };
  }

  function polarityFromDataset(dataset) {
    var out = {
      mix030: DEFAULT_POLARITY.mix030,
      mix3160: DEFAULT_POLARITY.mix3160,
      mix6190: DEFAULT_POLARITY.mix6190,
      pct90Plus: DEFAULT_POLARITY.pct90Plus,
      reserveCoverage: DEFAULT_POLARITY.reserveCoverage,
      writeOffs: DEFAULT_POLARITY.writeOffs,
    };
    var raw = dataset && dataset.targetPolarity;
    if (!raw || typeof raw !== "object") return out;
    for (var i = 0; i < METRIC_KEYS.length; i++) {
      var key = METRIC_KEYS[i];
      var flag = raw[key];
      if (flag === "floor" || flag === true) out[key] = true;
      else if (flag === "ceiling" || flag === false) out[key] = false;
    }
    return out;
  }

  function attachMom(months, polarity) {
    for (var i = 0; i < months.length; i++) {
      var row = months[i];
      var prev = i === 0 ? null : months[i - 1];
      row.mom = {
        mix030: momTrend(row.mix030, prev ? prev.mix030 : null, polarity.mix030, 4),
        mix3160: momTrend(row.mix3160, prev ? prev.mix3160 : null, polarity.mix3160, 4),
        mix6190: momTrend(row.mix6190, prev ? prev.mix6190 : null, polarity.mix6190, 4),
        pct90Plus: momTrend(
          row.pct90Plus,
          prev ? prev.pct90Plus : null,
          polarity.pct90Plus,
          4
        ),
        reserveCoverage: momTrend(
          row.reserveCoverage,
          prev ? prev.reserveCoverage : null,
          polarity.reserveCoverage,
          4
        ),
        writeOffs: momTrend(
          row.writeOffs,
          prev ? prev.writeOffs : null,
          polarity.writeOffs,
          0
        ),
      };
    }
  }

  function attachTargets(months, targets, polarity) {
    var t = targets && typeof targets === "object" ? targets : {};
    for (var i = 0; i < months.length; i++) {
      var row = months[i];
      row.vsTarget = {
        mix030: vsTarget(row.mix030, t.mix030, polarity.mix030),
        mix3160: vsTarget(row.mix3160, t.mix3160, polarity.mix3160),
        mix6190: vsTarget(row.mix6190, t.mix6190, polarity.mix6190),
        pct90Plus: vsTarget(row.pct90Plus, t.pct90Plus, polarity.pct90Plus),
        reserveCoverage: vsTarget(
          row.reserveCoverage,
          t.reserveCoverage,
          polarity.reserveCoverage
        ),
        writeOffs: vsTarget(row.writeOffs, t.writeOffs, polarity.writeOffs),
      };
    }
  }

  function extrema(months, key, higherIsBetter) {
    var betterHigh = higherIsBetter !== false;
    var best = null;
    var worst = null;
    for (var i = 0; i < months.length; i++) {
      var row = months[i];
      var v = toNum(row[key]);
      if (v === null) continue;
      if (betterHigh) {
        if (!best || v > toNum(best[key])) best = row;
        if (!worst || v < toNum(worst[key])) worst = row;
      } else {
        if (!best || v < toNum(best[key])) best = row;
        if (!worst || v > toNum(worst[key])) worst = row;
      }
    }
    return { best: best, worst: worst };
  }

  function mean(months, key) {
    var sum = 0;
    var count = 0;
    for (var i = 0; i < months.length; i++) {
      var v = toNum(months[i][key]);
      if (v === null) continue;
      sum += v;
      count += 1;
    }
    if (count === 0) return null;
    return finiteOrNull(sum / count);
  }

  function emptyResult() {
    return {
      company: null,
      currency: null,
      period: "month",
      conventions: null,
      targets: {
        mix030: null,
        mix3160: null,
        mix6190: null,
        pct90Plus: null,
        reserveCoverage: null,
        writeOffs: null,
      },
      polarity: {
        mix030: DEFAULT_POLARITY.mix030,
        mix3160: DEFAULT_POLARITY.mix3160,
        mix6190: DEFAULT_POLARITY.mix6190,
        pct90Plus: DEFAULT_POLARITY.pct90Plus,
        reserveCoverage: DEFAULT_POLARITY.reserveCoverage,
        writeOffs: DEFAULT_POLARITY.writeOffs,
      },
      months: [],
      latest: null,
      previous: null,
      best: null,
      worst: null,
      averagePct90Plus: null,
      averageReserveCoverage: null,
      averageMix030: null,
      monthCount: 0,
    };
  }

  function computeTracker(dataset) {
    if (!dataset || typeof dataset !== "object") {
      return emptyResult();
    }
    var polarity = polarityFromDataset(dataset);
    var targetsIn = dataset.targets && typeof dataset.targets === "object" ? dataset.targets : {};
    var targets = {
      mix030: toNum(targetsIn.mix030),
      mix3160: toNum(targetsIn.mix3160),
      mix6190: toNum(targetsIn.mix6190),
      pct90Plus: toNum(targetsIn.pct90Plus),
      reserveCoverage: toNum(targetsIn.reserveCoverage),
      writeOffs: toNum(targetsIn.writeOffs),
    };
    var rawMonths = Array.isArray(dataset.months) ? dataset.months : [];
    var months = [];
    for (var i = 0; i < rawMonths.length; i++) {
      if (!rawMonths[i] || typeof rawMonths[i] !== "object") continue;
      months.push(computeRow(rawMonths[i]));
    }
    months.sort(function (a, b) {
      var am = a.month || "";
      var bm = b.month || "";
      if (am < bm) return -1;
      if (am > bm) return 1;
      return 0;
    });
    attachMom(months, polarity);
    attachTargets(months, targets, polarity);
    var ext = extrema(months, "pct90Plus", polarity.pct90Plus);
    var result = emptyResult();
    result.company = dataset.company == null ? null : String(dataset.company);
    result.currency = dataset.currency == null ? null : String(dataset.currency);
    result.period = dataset.period == null ? "month" : String(dataset.period);
    result.conventions =
      dataset.conventions && typeof dataset.conventions === "object"
        ? dataset.conventions
        : null;
    result.targets = targets;
    result.polarity = polarity;
    result.months = months;
    result.latest = months.length ? months[months.length - 1] : null;
    result.previous = months.length > 1 ? months[months.length - 2] : null;
    result.best = ext.best;
    result.worst = ext.worst;
    result.averagePct90Plus = mean(months, "pct90Plus");
    result.averageReserveCoverage = mean(months, "reserveCoverage");
    result.averageMix030 = mean(months, "mix030");
    result.monthCount = months.length;
    return result;
  }

  function formatRatio(value, digits) {
    var n = toNum(value);
    if (n === null) return null;
    var d = digits == null ? 2 : digits;
    return n.toFixed(d);
  }

  function formatPct(value, digits) {
    var n = toNum(value);
    if (n === null) return null;
    var d = digits == null ? 1 : digits;
    return (n * 100).toFixed(d);
  }

  function formatMoney(value, digits) {
    var n = toNum(value);
    if (n === null) return null;
    var d = digits == null ? 0 : digits;
    return n.toFixed(d);
  }

  return {
    toNum: toNum,
    ratio: ratio,
    totalInventory: totalInventory,
    bucketMix: bucketMix,
    pctAged90Plus: pctAged90Plus,
    reserveCoverage: reserveCoverage,
    computeRow: computeRow,
    momTrend: momTrend,
    vsTarget: vsTarget,
    computeTracker: computeTracker,
    formatRatio: formatRatio,
    formatPct: formatPct,
    formatMoney: formatMoney,
    DEFAULT_POLARITY: DEFAULT_POLARITY,
  };
});
