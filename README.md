# Inventory aging and obsolescence tracker

Public monthly inventory dashboard for **Northwind Components**. **First paint is the metrics and table** — `index.html` is generated with bucket mix, % aged 90+, reserve coverage, MoM change, and target comparison already in the markup. JavaScript only adds a `js-enhanced` class.

Sample series: **18 months** (Jan 2025–Jun 2026).

## Formulas

Unsafe math returns `null` (never `NaN` or `Infinity`). Zero total inventory and zero 90+ inventory are zero denominators.

| Metric | Formula | Notes |
| --- | --- | --- |
| **Total inventory** | `0–30 + 31–60 + 61–90 + 90+` | Sum of finite aging buckets. All-null buckets → `null`. All-zero buckets → `0`. |
| **Bucket mix** | `bucket / total inventory` | Share of on-hand inventory in each aging bucket (0–30, 31–60, 61–90, 90+). Zero total or a null bucket → `null`. |
| **% aged 90+** | `90+ inventory / total inventory` | Same as the 90+ bucket mix. Headline slow-moving / obsolete exposure. Lower is better (ceiling). |
| **Reserve coverage** | `obsolescenceReserve / 90+ inventory` | How much of identified 90+ exposure is reserved. **Not** reserve / write-offs. Higher is better (floor). Zero 90+ → `null`. |
| **MoM** | `this month − prior month` | First month is `n/a`. Percent change uses `Δ / \|prior\|`; prior of `0` → percent `null`. Falling % 90+ and write-offs are improving; rising 0–30 mix and coverage are improving. |
| **vs target** | `value − target` | **% aged 90+** and **write-offs** are ceilings (meeting when `value ≤ target`). **0–30 mix** and **reserve coverage** are floors (meeting when `value ≥ target`). |

Zero-denominator and missing-input cases:

- zero-value inventory (all buckets `0`) → mix and % aged 90+ `null` (never `Infinity`); coverage `null` because 90+ is `0`
- empty / null buckets → that bucket’s mix is `null`; total sums only finite buckets
- missing months in `months[]` (`null` / non-objects) → skipped; MoM uses the prior remaining row
- zero reserve, positive 90+ → coverage `0`
- null / empty / non-finite inputs → `null`
- empty series / null dataset → empty months, `latest = null`

`js/inventory.js` is a pure browser + Node module (`Inventory` global, or `require('./js/inventory.js')`).

## Data schema

`data/inventory.json` (`inventory-aging/v1`):

- `months[]` — `{ month, buckets: { "0-30", "31-60", "61-90", "90+" }, obsolescenceReserve, writeOffs }`
- `targets.mix030` — fresh-inventory floor (share of total)
- `targets.pct90Plus` — aged-90+ ceiling
- `targets.reserveCoverage` — reserve / 90+ floor
- `targets.writeOffs` — monthly write-off ceiling (USD)
- `targetPolarity` — `floor` or `ceiling` per metric

Sample: 0–30 mix floor **50%**, % aged 90+ ceiling **12%**, reserve coverage floor **80%**, write-off ceiling **$75,000**.

## How to re-render

After editing `data/inventory.json` or `js/inventory.js`:

```bash
node scripts/render-static.js
```

That rewrites `index.html` (summary cards, bucket-mix bar, target comparison, best/worst, sparkline, monthly table). Do not hand-edit the baked numbers. `.nojekyll` is present so GitHub Pages will serve the site as static files.

```bash
bash scripts/test.sh
```

Tests cover zero-value inventory, empty/null buckets, missing months, plus a static-HTML first-paint check (`curl -sL` of local `index.html`, not a Loading-only shell).

## Files

- `data/inventory.json` — 18 months of aging buckets, reserve, write-offs, and targets
- `js/inventory.js` — browser + Node module for mix, % 90+, coverage, MoM, targets
- `js/enhance.js` — optional class flag only; does not supply numbers
- `scripts/render-static.js` — static HTML baker
- `index.html` — first-paint snapshot
- `css/style.css` — minimal layout
- `.nojekyll` — serve as plain files on GitHub Pages

## Suggested next improvements

- Replace the sample JSON with a live pull from the inventory subledger (bucket balances by last-movement date) and the reserve / write-off roll-forward.
- Split reserve coverage by product family so a well-reserved commodity line cannot hide an under-reserved electronics line.
- Flag SKUs that migrate 61–90 → 90+ for two consecutive months before they hit the write-off account.
- Next planned tracker: **SKU-level slow-moving / obsolete (SLOB) write-off tracker** — per-SKU last-movement aging, NRV haircut, and write-off vs reserve by item.
- Multi-entity consolidation with intercompany inventory eliminations, not only Northwind Components.
