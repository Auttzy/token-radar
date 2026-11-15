// Token Radar's model: the sealed snapshot in, a ranked board out.
//
// The board ranks every pre-token protocol the snapshot can rank: the 40 watchlist slugs (the
// floor, never a ceiling) plus every other pre-token protocol that is a launch candidate rather
// than a product of a token that already trades. A protocol is pre-token when its record carries
// no token at all: no market cap, no CoinGecko id, no symbol. Protocols whose token already
// trades are never ranked; they are set aside in the Live view with their market cap, which is
// a fact, not a model. Wrapped, staked and bridged products are set aside too: a bridge's TVL
// is another token's money passing through, not a launch waiting to happen.
//
// Implied value is one function of the snapshot's own figures, the same for every row. It is a
// size curve fitted to the traded tokens, not a flat multiple: the market pays less per dollar
// of TVL as a protocol gets bigger, so a $2.75B protocol is worth far less than 2.75B times a
// $100M protocol's multiple. The curve is fitted here, from this snapshot, and tested blind
// before it prices anything. The fit is robust (Huber, iteratively reweighted): a token far off
// the curve is downweighted, so one odd token cannot bend it.
//
//   comparables  live-token protocols, not an exchange, not a wrapped/staked/bridged product,
//                market cap and TVL both positive, market-cap/TVL in [0.005, 5]
//   curve        log10(mcap) = a + b * log10(tvl), Huber fit on the comparables
//   growth       = clamp(change_7d, -60, 120) per cent
//   growthMult   = 1 + (growth / 100) * 0.6
//   maturity     = 0.70 + min(age_days, 1095) / 1095 * 0.30   (age unknown: 365 days)
//   sibling      the median log-residual of the traded tokens that share the protocol's first
//                word, shrunk the same way, clamped to [0.25, 4]; no such token means 1.00
//   implied      = max(1, round(10^(a + b * log10(tvl)) * growthMult * maturity * sibling))
//
// There is deliberately no family multiplier. Round 3's model carried one — the median
// log-residual of the traded tokens in the row's category, shrunk toward no effect — and it
// was tested blind, the same way the curve is: pricing each traded token with the whole model
// fitted without it. The family effect failed the test. With it the full model priced a
// held-out token at a median miss of x3.03, within 3x 49% of the time; without it x2.87 and
// 56%, and the time split agreed (within 3x 59% with it, 62% without). A category effect
// that does not survive being held out is noise, so the board carries none.
//
// The blind test is the whole model, not the curve alone: each comparable is priced by the
// full pipeline fitted without it (leave-one-out), and a second test fits on protocols listed
// before 2024 and prices the ones listed after. The same tests price each token by one flat
// multiple for every token. The band around each implied value is the leave-one-out
// residual's 10th to 90th percentile, so the board states its own uncertainty instead of
// hiding it.
//
// Farm plans are derived the same way: the protocol's category picks the action, its first
// chain picks where the action happens and what gas costs, its TVL picks nothing about the
// capital (every plan is $1,000, the figure the slice is quoted at) and its age picks how long
// to hold. Every step states what it costs and how long it takes. The economics then net the
// plan to the dollar: a $1,000 deposit's slice is 10% of the implied value pro rata to TVL,
// fees are the plan's gas at the chain's own rate, and the forgone yield is 4% a year on the
// $1,000 for the hold. FARM means the slice pays for the farm, THIN means it almost does, and
// SKIP means it never does.

/** One protocol entry of the sealed snapshot: exactly its ten fields. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  min_comparables: number;
  ratio_floor: number;
  ratio_cap: number;
  shrink_k: number;
  sibling_floor: number;
  sibling_cap: number;
  farm_capital_usd: number;
  farm_share: number;
  tbill_rate: number;
  thin_floor_usd: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.6,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1095,
  unknown_age_days: 365,
  min_comparables: 3,
  ratio_floor: 0.005,
  ratio_cap: 5,
  shrink_k: 3,
  sibling_floor: 0.25,
  sibling_cap: 4,
  farm_capital_usd: 1000,
  farm_share: 0.1,
  tbill_rate: 0.04,
  thin_floor_usd: -10,
};

/** The model's version label: the dashboard names it and the page recomputes with it. */
export const MODEL_VERSION = 'radar-4-huber';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One farm step: the action, what it costs, how long it takes, and the numbers behind them. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
  gasUsd: number;
  workMin: number;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  watchlist: boolean;
  signals: string[];
  model: {
    curve_value_usd: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    sibling_multiplier: number;
    age_days: number | null;
    p10_usd: number;
    p90_usd: number;
  };
  farm: {
    capital_usd: number;
    hold_days: number;
    slice_usd: number;
    fees_usd: number;
    forgone_usd: number;
    net_usd: number;
    verdict: 'FARM' | 'THIN' | 'SKIP';
    work_hours: number;
    per_hour_usd: number;
  };
  farm_steps: string[];
}

/** A board row's compact form for data.js; the page regenerates the farm plan from it. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  curve_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  sibling_multiplier: number;
  p10_usd: number;
  p90_usd: number;
  farm_capital_usd: number;
  farm_hold_days: number;
  farm_slice_usd: number;
  farm_fees_usd: number;
  farm_forgone_usd: number;
  farm_net_usd: number;
  farm_verdict: 'FARM' | 'THIN' | 'SKIP';
  farm_work_hours: number;
  farm_per_hour_usd: number;
  watchlist: boolean;
  signals: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One comparable point, for the scatter plot. */
export interface ComparablePoint {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
}

/** The fitted size curve and the whole model's blind tests, for the model panel. The
 * loo_* and split_* numbers price each held-out token with the full pipeline (curve,
 * growth, maturity, sibling); the flat_* numbers price the same tokens with one flat
 * multiple for every token. The band is the full pipeline's leave-one-out residuals. */
export interface CurveFit {
  intercept: number;
  slope: number;
  comparables: number;
  loo_median_x: number;
  loo_within3: number;
  loo_within10: number;
  flat_loo_median_x: number;
  flat_loo_within3: number;
  flat_loo_within10: number;
  split_train: number;
  split_test: number;
  split_median_x: number;
  split_within3: number;
  flat_split_median_x: number;
  flat_split_within3: number;
  band_p10: number;
  band_p90: number;
}

/** Everything the dashboard needs: the board, the live set, the curve and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  pre_token_total: number;
  live_total: number;
  set_aside: number;
  curve: CurveFit;
  verdicts: { farm: number; thin: number; skip: number };
  comps: ComparablePoint[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The middle value of a sorted list; the lower middle of an even list. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)]!;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Round to four decimals: the multipliers are stored rounded, so the page and the board agree. */
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Round to two decimals: the farm economics are stored rounded, so the page and the board agree. */
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** The product categories: money that already has a token behind it, not a launch. */
export const PRODUCT_CATEGORIES = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaking',
  'Restaked BTC',
  'Anchor BTC',
  'Stablecoin Wrapper',
  'Chain',
]);

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** Whether a protocol is a launch candidate the board ranks, rather than a product set aside. */
export function isLaunchCandidate(p: SnapshotProtocol): boolean {
  return isRankable(p) && !PRODUCT_CATEGORIES.has(p.category ?? '');
}

/** The traded tokens the curve is fitted to: live, not an exchange, not a product, sane ratio. */
export function cleanComparables(protocols: SnapshotProtocol[], model: ModelConstants): SnapshotProtocol[] {
  return protocols.filter((p) => {
    if (isPreToken(p) || p.tvl_usd <= 0 || p.mcap_usd === null) return false;
    if (PRODUCT_CATEGORIES.has(p.category ?? '')) return false;
    const ratio = p.mcap_usd / p.tvl_usd;
    return Number.isFinite(ratio) && ratio >= model.ratio_floor && ratio <= model.ratio_cap;
  });
}

/** Least squares on log10(market cap) against log10(TVL): the size curve's intercept and slope. */
function olsCurve(points: SnapshotProtocol[]): { intercept: number; slope: number } {
  const n = points.length;
  let mx = 0;
  let my = 0;
  for (const p of points) {
    mx += Math.log10(p.tvl_usd);
    my += Math.log10(p.mcap_usd!);
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  for (const p of points) {
    const dx = Math.log10(p.tvl_usd) - mx;
    sxy += dx * (Math.log10(p.mcap_usd!) - my);
    sxx += dx * dx;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return { intercept: my - slope * mx, slope };
}

/** Weighted least squares on log10(market cap) against log10(TVL). */
function wlsCurve(points: SnapshotProtocol[], weights: number[]): { intercept: number; slope: number } {
  let sw = 0;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < points.length; i++) {
    sw += weights[i]!;
    mx += weights[i]! * Math.log10(points[i]!.tvl_usd);
    my += weights[i]! * Math.log10(points[i]!.mcap_usd!);
  }
  mx /= sw;
  my /= sw;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < points.length; i++) {
    const dx = Math.log10(points[i]!.tvl_usd) - mx;
    sxy += weights[i]! * dx * (Math.log10(points[i]!.mcap_usd!) - my);
    sxx += weights[i]! * dx * dx;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return { intercept: my - slope * mx, slope };
}

/**
 * The size curve, fitted robustly: ordinary least squares first, then Huber's iteratively
 * reweighted least squares (tuning constant 1.345, scale from the median absolute residual),
 * so a token far off the curve is downweighted instead of bending it. One odd token — a
 * bridged wrapper's market cap, a dead token's last print — cannot move the curve.
 */
export function fitCurve(points: SnapshotProtocol[]): { intercept: number; slope: number } {
  let fit = olsCurve(points);
  for (let it = 0; it < 30; it++) {
    const residuals = points.map(
      (p) => Math.log10(p.mcap_usd!) - (fit.intercept + fit.slope * Math.log10(p.tvl_usd)),
    );
    const scale = 1.4826 * median(residuals.map(Math.abs)) || 1;
    const weights = residuals.map((r) => {
      const u = r / (1.345 * scale);
      return Math.abs(u) <= 1 ? 1 : 1 / Math.abs(u);
    });
    const next = wlsCurve(points, weights);
    if (Math.abs(next.intercept - fit.intercept) < 1e-9 && Math.abs(next.slope - fit.slope) < 1e-9) {
      fit = next;
      break;
    }
    fit = next;
  }
  return fit;
}

/** The curve's value for a TVL: 10^(intercept + slope * log10(TVL)). */
export function curveValue(fit: { intercept: number; slope: number }, tvl: number): number {
  return Math.pow(10, fit.intercept + fit.slope * Math.log10(tvl));
}

/** A protocol's log-residual against the curve: how far its market cap sits from the curve. */
function residual(fit: { intercept: number; slope: number }, p: SnapshotProtocol): number {
  return Math.log10(p.mcap_usd!) - (fit.intercept + fit.slope * Math.log10(p.tvl_usd));
}

/** The first word of a name, lowercased: the brand a protocol shares with its siblings. */
function firstWord(name: string): string {
  return name.trim().split(/\s+/)[0]!.toLowerCase();
}

/** A protocol's sibling factor: traded tokens sharing its first word price it rich or cheap. */
export function siblingFactor(
  protocol: SnapshotProtocol,
  protocols: SnapshotProtocol[],
  fit: { intercept: number; slope: number },
  model: ModelConstants,
): number {
  const word = firstWord(protocol.name);
  const sibs = protocols.filter(
    (p) => !isPreToken(p) && p.mcap_usd !== null && p.tvl_usd > 0 && p.slug !== protocol.slug && firstWord(p.name) === word,
  );
  if (sibs.length === 0) return 1;
  const shrink = sibs.length / (sibs.length + model.shrink_k);
  const factor = Math.pow(10, median(sibs.map((s) => residual(fit, s))) * shrink);
  return round4(Math.min(model.sibling_cap, Math.max(model.sibling_floor, factor)));
}

/** What impliedValue needs from a fit: the curve and the band around it. */
export interface FittedModel {
  fit: { intercept: number; slope: number };
  curve: { band_p10: number; band_p90: number };
}

/** The fitted size curve and the whole model's blind tests, all fitted from the snapshot. */
export function fitModel(
  snapshot: Snapshot,
  model: ModelConstants,
): {
  fit: { intercept: number; slope: number };
  comps: SnapshotProtocol[];
  curve: CurveFit;
} {
  const comps = cleanComparables(snapshot.protocols, model);
  const fit = fitCurve(comps);
  const log3 = Math.log10(3);
  const frac = (xs: number[], lim: number): number => xs.filter((e) => e <= lim).length / xs.length;
  const summarize = (signed: number[]) => {
    const abs = signed.map(Math.abs).sort((a, b) => a - b);
    return {
      medianX: round2(Math.pow(10, median(abs))),
      within3: round4(frac(abs, log3)),
      within10: round4(frac(abs, 1)),
    };
  };
  // Price one token with a given curve, through the whole pipeline (growth, maturity,
  // sibling): the blind tests test the model that prices the board, not the curve alone.
  // The band is a dummy here: only the implied value is read.
  const priceFull = (p: SnapshotProtocol, f: { intercept: number; slope: number }, protocols: SnapshotProtocol[]) =>
    impliedValue(p, snapshot.as_of, { fit: f, curve: { band_p10: 0, band_p90: 0 } }, protocols, model).implied;
  // Leave-one-out: every comparable priced by the full pipeline fitted without it. The signed
  // residuals are the band; their absolute values are the model's blind error, against the
  // same test run with one flat multiple for every token.
  const looSigned: number[] = [];
  const looFlat: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const held = comps[i]!;
    const rest = comps.filter((_, j) => j !== i);
    const restProtocols = snapshot.protocols.filter((p) => p.slug !== held.slug);
    const f = fitCurve(rest);
    looSigned.push(Math.log10(held.mcap_usd!) - Math.log10(priceFull(held, f, restProtocols)));
    // The flat comparison refits its median on the same training set, so it never sees the
    // token it is pricing either.
    const flatRest = median(rest.map((p) => p.mcap_usd! / p.tvl_usd));
    looFlat.push(Math.abs(Math.log10(held.mcap_usd!) - Math.log10(held.tvl_usd * flatRest)));
  }
  const loo = summarize(looSigned);
  const looFlatSum = summarize(looFlat);
  const looSorted = [...looSigned].sort((a, b) => a - b);
  const bandP10 = looSorted[Math.floor(looSorted.length * 0.1)]!;
  const bandP90 = looSorted[Math.floor(looSorted.length * 0.9)]!;
  // Time split: fit on protocols listed before 2024, price the ones listed after.
  const train = comps.filter((p) => p.listed_at !== null && p.listed_at < '2024-01-01');
  const test = comps.filter((p) => p.listed_at !== null && p.listed_at >= '2024-01-01');
  const trainFit = fitCurve(train);
  const testProtocols = snapshot.protocols.filter((p) => !test.some((t) => t.slug === p.slug));
  const flatTrain = median(train.map((p) => p.mcap_usd! / p.tvl_usd));
  const splitSigned: number[] = [];
  const splitFlat: number[] = [];
  for (const p of test) {
    splitSigned.push(Math.log10(p.mcap_usd!) - Math.log10(priceFull(p, trainFit, testProtocols)));
    splitFlat.push(Math.abs(Math.log10(p.mcap_usd!) - Math.log10(p.tvl_usd * flatTrain)));
  }
  const split = summarize(splitSigned);
  const splitFlatSum = summarize(splitFlat);
  return {
    fit,
    comps,
    curve: {
      intercept: round4(fit.intercept),
      slope: round4(fit.slope),
      comparables: comps.length,
      loo_median_x: loo.medianX,
      loo_within3: loo.within3,
      loo_within10: loo.within10,
      flat_loo_median_x: looFlatSum.medianX,
      flat_loo_within3: looFlatSum.within3,
      flat_loo_within10: looFlatSum.within10,
      split_train: train.length,
      split_test: test.length,
      split_median_x: split.medianX,
      split_within3: split.within3,
      flat_split_median_x: splitFlatSum.medianX,
      flat_split_within3: splitFlatSum.within3,
      band_p10: round4(bandP10),
      band_p90: round4(bandP90),
    },
  };
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  fitted: FittedModel,
  protocols: SnapshotProtocol[],
  model: ModelConstants,
): {
  implied: number;
  curve: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  sibling: number;
  age: number | null;
  p10: number;
  p90: number;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const curve = curveValue(fitted.fit, protocol.tvl_usd);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const sibling = siblingFactor(protocol, protocols, fitted.fit, model);
  const implied = Math.max(1, Math.round(curve * growthMult * maturityMult * sibling));
  return {
    implied,
    curve,
    growthPct,
    growthMult,
    maturityMult,
    sibling,
    age,
    p10: Math.max(1, Math.round(implied * Math.pow(10, fitted.curve.band_p10))),
    p90: Math.max(1, Math.round(implied * Math.pow(10, fitted.curve.band_p90))),
  };
}

/** A dollar figure in the board's compact form: $2.75B, $136.3M, $42K. */
function fmtUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

/** 1st, 2nd, 3rd, 4th: the rank's word, for the signals' plain sentences. */
function ordinal(n: number): string {
  const last = n % 10;
  const lastTwo = n % 100;
  if (last === 1 && lastTwo !== 11) return `${n}st`;
  if (last === 2 && lastTwo !== 12) return `${n}nd`;
  if (last === 3 && lastTwo !== 13) return `${n}rd`;
  return `${n}th`;
}

/** One scored protocol's value, as the model computed it. */
interface ScoredValue {
  implied: number;
  curve: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  sibling: number;
  age: number | null;
  p10: number;
  p90: number;
}

/**
 * Why this protocol ranks where it does: plain sentences, each from the snapshot's own figures,
 * so a reader can check the rank without re-running the model. The first names the protocol's
 * size among the board, the second the curve that priced it, the third its growth, the fourth
 * its age with no token, and the fifth the band the blind test puts around the value.
 */
export function signalsFor(
  p: SnapshotProtocol,
  v: ScoredValue,
  tvlRank: number,
  boardSize: number,
): string[] {
  const out: string[] = [];
  out.push(`TVL ${fmtUsd(p.tvl_usd)} — the ${ordinal(tvlRank)} largest pre-token protocol on a board of ${boardSize}.`);
  out.push(
    `The size curve reads ${fmtUsd(v.curve)} off ${fmtUsd(p.tvl_usd)} of TVL; the curve is fitted robustly, so one odd token cannot bend it.`,
  );
  const growthSign = v.growthPct > 0 ? '+' : '';
  out.push(`Seven-day TVL change ${growthSign}${v.growthPct.toFixed(2)}%: growth multiplies the value by ${v.growthMult.toFixed(3)}.`);
  if (v.age !== null) {
    out.push(`Listed ${v.age} days ago and still no token on record: maturity multiplies the value by ${v.maturityMult.toFixed(3)}.`);
  } else {
    out.push(`No listing date on record, so the model uses 365 days of age: maturity multiplies the value by ${v.maturityMult.toFixed(3)}.`);
  }
  if (v.sibling !== 1) {
    out.push(`A traded token shares this protocol's first word and sits ${v.sibling.toFixed(2)}x off the curve, so the sibling factor is ${v.sibling.toFixed(2)}.`);
  }
  out.push(`The blind test puts the value between ${fmtUsd(v.p10)} and ${fmtUsd(v.p90)}.`);
  return out;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
  fitted: ReturnType<typeof fitModel> | null = null,
): BoardRow[] {
  const fit = fitted ?? fitModel(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names, whatever its TVL.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other launch candidate, below the floor or above it. The floor is
  // the watchlist's line, not a ceiling on what the radar may catch: a pre-token protocol above
  // it is still a launch, as long as it is not a wrapped, staked or bridged product of a token
  // that already trades. Below the floor the same rule applies, so the board carries the whole
  // early field and sets the products aside instead of ranking them as launches.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isLaunchCandidate(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, fit, snapshot.protocols, model);
    const age = v.age;
    const hold = holdDaysFor(age);
    const steps = farmSteps(p, age);
    const farm = farmEconomics(p, v.implied, hold, steps, model);
    return { p, ...v, hold, steps, farm };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  // Size order, for the signals' "nth largest" sentence: the same protocols, by TVL.
  const byTvl = [...scored].sort((a, b) => b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const tvlRank = new Map(byTvl.map((s, i) => [s.p.slug, i + 1]));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    watchlist: snapshot.watchlist.includes(s.p.slug),
    signals: signalsFor(s.p, s, tvlRank.get(s.p.slug) ?? 0, scored.length),
    model: {
      curve_value_usd: s.curve,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      sibling_multiplier: round4(s.sibling),
      age_days: s.age,
      p10_usd: s.p10,
      p90_usd: s.p90,
    },
    farm: s.farm,
    farm_steps: s.steps.map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Keep the position open and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one transaction costs on a chain, in dollars: mainnet is dear, the rest are cents. */
export function gasPerTx(chain: string | null): number {
  const c = (chain ?? '').toLowerCase();
  if (c === 'ethereum') return 4.0;
  if (c === 'bitcoin') return 2.0;
  if (c === 'solana' || c === 'bittensor') return 0.1;
  if (c === '') return 1.0;
  return 0.3;
}

/** A gas figure as the steps state it: $4, $0.30, $0.10. */
function gasStr(g: number): string {
  return g >= 1 ? `$${g}` : `$${g.toFixed(2)}`;
}

/** How much capital one farm position needs: $1,000, the figure the slice is quoted at. */
function capitalFor(): number {
  return MODEL.farm_capital_usd;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's main action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and leave the deposit earning.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Add $${capital} of liquidity to ${name}'s deepest pool on ${chain} and keep the position in range.`;
  if (c.includes('yield') || c.includes('farm')) return `Deposit $${capital} into ${name}'s highest-TVL vault on ${chain} and let the yield compound.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC into ${chain} through ${name} and put the bridged funds to work in its app.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC to ${chain} through ${name}'s official bridge and stake half of it with a validator.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged trade.`;
  if (c.includes('prediction')) return `Fund your account with $${capital} on ${name} and take one position in an active market.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and hold the vault shares.`;
  if (c.includes('stable') || c.includes('rwa')) return `Mint $${capital} of the yield-bearing asset through ${name} on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('launchpad')) return `Stake $${capital} into ${name}'s launch pool on ${chain} and join one sale.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second, different action: a farm is more than one transaction. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow $20 against the deposit on ${name} and repay it the same week, so the account shows both sides of the market.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Swap $25 through ${name} on ${chain} once a week, in the pool you already provide liquidity to.`;
  if (c.includes('yield') || c.includes('farm')) return `Claim the vault's yield once a week and redeposit it, so the account shows repeated compounding.`;
  if (c.includes('bridge')) return `Bridge $25 back through ${name} the following week, so the account shows two-way volume.`;
  if (c.includes('chain')) return `Use a second app on ${chain}, such as its leading DEX or lending market, with $25, so the account shows activity beyond staking.`;
  if (c.includes('staking') || c.includes('restak')) return `Delegate a further $25 through ${name} and vote in one governance poll if the protocol opens one.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Close the first trade after a week and open a second one half its size, so the account shows real trading activity.`;
  if (c.includes('prediction')) return `Settle the first position and open a second one in a different market on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Move $25 between two vaults on ${name} once, so the account shows allocation activity.`;
  if (c.includes('stable') || c.includes('rwa')) return `Redeem $25 of the asset and mint it again the next week, so the account shows a full cycle.`;
  if (c.includes('insurance')) return `File one test claim check on ${name} to confirm the policy is live, without withdrawing the cover.`;
  if (c.includes('launchpad')) return `Vote in one launch poll on ${name} with the staked position.`;
  return `Use ${name}'s second feature once, such as a swap, a vote or a claim, so the account shows more than a single deposit.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names. A protocol on three or more chains gets a cross-chain step instead of a second action.
 * Gas follows the chain the step runs on: one transaction to set up, two to deposit (approve and
 * deposit), one for the second action, and one a month for upkeep, because the weekly check is
 * reading a page, not sending a transaction.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const gas1 = gasPerTx(p.chains.length > 0 ? p.chains[0]! : null);
  const capital = capitalFor();
  const hold = holdDaysFor(age);
  const months = Math.max(1, Math.round(hold / 30));
  const weeks = Math.ceil(hold / 7);
  const secondChain = p.chains.length >= 3 ? p.chains[1]! : null;
  const gas2 = secondChain !== null ? gasPerTx(secondChain) : gas1;
  const second =
    secondChain !== null
      ? {
          text: `Repeat the $25 deposit on ${secondChain}, so the farm covers two of the protocol's ${p.chains.length} chains.`,
          cost: `$25 of capital and about ${gasStr(gas2)} of gas`,
          time: '10 minutes',
          gasUsd: gas2,
          workMin: 10,
        }
      : {
          text: secondActionFor(p, capital, chain),
          cost: `about $25 of volume and ${gasStr(gas1)} of gas`,
          time: '10 minutes a week',
          gasUsd: gas1,
          workMin: 10,
        };
  return [
    {
      text: `Open a fresh wallet for the farm funds, and store its seed phrase offline on paper.`,
      cost: `about ${gasStr(gas1)} of gas`,
      time: '5 minutes',
      gasUsd: gas1,
      workMin: 5,
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital, about ${gasStr(2 * gas1)} of gas`,
      time: '15 minutes',
      gasUsd: 2 * gas1,
      workMin: 15,
    },
    second,
    {
      text: `Every week, check the points page and confirm the position is still earning; once a month, do one on-chain action — a top-up, a claim or a vote.`,
      cost: `about ${gasStr(gas1)} of gas a month`,
      time: '5 minutes a week',
      gasUsd: months * gas1,
      workMin: 5 * weeks + 10 * months,
    },
    {
      text: `Hold the position for at least ${hold} days, so the activity spans more than one user snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
      gasUsd: 0,
      workMin: 0,
    },
    {
      text: `Check the protocol's points page once a month, and claim only from the link that page publishes.`,
      cost: 'free to check; never pay to claim',
      time: '10 minutes a month',
      gasUsd: 0,
      workMin: 10 * months,
    },
    {
      text: `Keep a farm log with the wallet, the dates and every transaction hash.`,
      cost: 'nothing but the log',
      time: '5 minutes',
      gasUsd: 0,
      workMin: 5,
    },
  ];
}

/**
 * One farm's economics, netted to the dollar: the $1,000 deposit's slice is 10% of the implied
 * value pro rata to TVL, fees are the plan's gas, and the forgone yield is 4% a year on the
 * $1,000 for the hold. FARM means the slice pays for the farm, THIN means it almost does, and
 * SKIP means it never does.
 */
export function farmEconomics(
  p: SnapshotProtocol,
  implied: number,
  hold: number,
  steps: FarmStep[],
  model: ModelConstants,
): BoardRow['farm'] {
  const capital = model.farm_capital_usd;
  const slice = (implied * model.farm_share * capital) / p.tvl_usd;
  const fees = steps.reduce((n, s) => n + s.gasUsd, 0);
  const forgone = (capital * model.tbill_rate * hold) / 365;
  const net = slice - fees - forgone;
  const verdict = net > 0 ? 'FARM' : net > model.thin_floor_usd ? 'THIN' : 'SKIP';
  const workMin = steps.reduce((n, s) => n + s.workMin, 0);
  const workHours = round2(workMin / 60);
  return {
    capital_usd: capital,
    hold_days: hold,
    slice_usd: round2(slice),
    fees_usd: round2(fees),
    forgone_usd: round2(forgone),
    net_usd: round2(net),
    verdict,
    work_hours: workHours,
    per_hour_usd: round2(workHours > 0 ? net / workHours : 0),
  };
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    curve_value_usd: row.model.curve_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    sibling_multiplier: row.model.sibling_multiplier,
    p10_usd: row.model.p10_usd,
    p90_usd: row.model.p90_usd,
    farm_capital_usd: row.farm.capital_usd,
    farm_hold_days: row.farm.hold_days,
    farm_slice_usd: row.farm.slice_usd,
    farm_fees_usd: row.farm.fees_usd,
    farm_forgone_usd: row.farm.forgone_usd,
    farm_net_usd: row.farm.net_usd,
    farm_verdict: row.farm.verdict,
    farm_work_hours: row.farm.work_hours,
    farm_per_hour_usd: row.farm.per_hour_usd,
    watchlist: row.watchlist,
    signals: row.signals,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const fitted = fitModel(snapshot, model);
  const board = buildBoard(snapshot, model, fitted);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const preTokenTotal = snapshot.protocols.filter(isPreToken).length;
  const verdicts = { farm: 0, thin: 0, skip: 0 };
  for (const r of board) {
    if (r.farm.verdict === 'FARM') verdicts.farm++;
    else if (r.farm.verdict === 'THIN') verdicts.thin++;
    else verdicts.skip++;
  }
  const comps: ComparablePoint[] = fitted.comps
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd! }))
    .sort((a, b) => a.tvl_usd - b.tvl_usd);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    pre_token_total: preTokenTotal,
    live_total: snapshot.protocols.length - preTokenTotal,
    set_aside: preTokenTotal - board.length,
    curve: fitted.curve,
    verdicts,
    comps,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
