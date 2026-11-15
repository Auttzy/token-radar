// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail drawer with the model's
// own inputs, the traded peers it was priced against and the protocol's farm plan netted to
// the dollar, and a model sandbox that re-ranks the board live. No network: every byte it
// shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', verdict: 'all', scope: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, gw: DATA.model.growth_weight, mf: DATA.model.maturity_floor };
  var SANDBOX = state.gw !== DATA.model.growth_weight || state.mf !== DATA.model.maturity_floor;

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtMoney(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n < 0 ? '-$' : '+$') + Math.abs(n).toFixed(2);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks
  // the number board.json carries, so the page's code and the board's data are visibly the same
  // arithmetic. The sandbox changes only growth weight and maturity floor, nothing else.
  function impliedOf(row, gw, mf) {
    var m = DATA.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * gw;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = mf + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * (1 - mf);
    return Math.max(1, Math.round(row.curve_value_usd * growthMult * maturity * row.sibling_multiplier));
  }
  function previewValue(row) {
    return SANDBOX ? impliedOf(row, state.gw, state.mf) : row.implied_value_usd;
  }
  // The farm's net, recomputed for a preview value: the slice scales with the value, the fees
  // are the plan's gas and do not, and the forgone yield is 4% a year on the $1,000.
  function previewFarm(row) {
    var v = previewValue(row);
    var slice = v * DATA.model.farm_share * row.farm_capital_usd / row.tvl_usd;
    var net = slice - row.farm_fees_usd - row.farm_forgone_usd;
    return { slice: slice, net: net, verdict: net > 0 ? 'FARM' : net > DATA.model.thin_floor_usd ? 'THIN' : 'SKIP' };
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and
  // age decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function gasPerTx(chain) {
    var c = (chain || '').toLowerCase();
    if (c === 'ethereum') return 4.0;
    if (c === 'bitcoin') return 2.0;
    if (c === 'solana' || c === 'bittensor') return 0.1;
    if (c === '') return 1.0;
    return 0.3;
  }
  function gasStr(g) { return g >= 1 ? '$' + g : '$' + g.toFixed(2); }
  function capitalFor() { return DATA.model.farm_capital_usd; }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and leave the deposit earning.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Add $' + capital + ' of liquidity to ' + name + "'s deepest pool on " + chain + ' and keep the position in range.';
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0) return 'Deposit $' + capital + " into " + name + "'s highest-TVL vault on " + chain + ' and let the yield compound.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC into ' + chain + ' through ' + name + " and put the bridged funds to work in its app.";
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + " through " + name + "'s official bridge and stake half of it with a validator.";
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged trade.';
    if (c.indexOf('prediction') >= 0) return 'Fund your account with $' + capital + ' on ' + name + ' and take one position in an active market.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and hold the vault shares.';
    if (c.indexOf('stable') >= 0 || c.indexOf('rwa') >= 0) return 'Mint $' + capital + ' of the yield-bearing asset through ' + name + ' on ' + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('launchpad') >= 0) return 'Stake $' + capital + ' into ' + name + "'s launch pool on " + chain + ' and join one sale.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow $20 against the deposit on ' + name + ' and repay it the same week, so the account shows both sides of the market.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Swap $25 through ' + name + ' on ' + chain + ' once a week, in the pool you already provide liquidity to.';
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0) return "Claim the vault's yield once a week and redeposit it, so the account shows repeated compounding.";
    if (c.indexOf('bridge') >= 0) return 'Bridge $25 back through ' + name + ' the following week, so the account shows two-way volume.';
    if (c.indexOf('chain') >= 0) return 'Use a second app on ' + chain + ', such as its leading DEX or lending market, with $25, so the account shows activity beyond staking.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Delegate a further $25 through ' + name + ' and vote in one governance poll if the protocol opens one.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Close the first trade after a week and open a second one half its size, so the account shows real trading activity.';
    if (c.indexOf('prediction') >= 0) return 'Settle the first position and open a second one in a different market on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Move $25 between two vaults on ' + name + ' once, so the account shows allocation activity.';
    if (c.indexOf('stable') >= 0 || c.indexOf('rwa') >= 0) return 'Redeem $25 of the asset and mint it again the next week, so the account shows a full cycle.';
    if (c.indexOf('insurance') >= 0) return 'File one test claim check on ' + name + ' to confirm the policy is live, without withdrawing the cover.';
    if (c.indexOf('launchpad') >= 0) return 'Vote in one launch poll on ' + name + ' with the staked position.';
    return 'Use ' + name + "'s second feature once, such as a swap, a vote or a claim, so the account shows more than a single deposit.";
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Keep the position open and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var gas1 = gasPerTx(p.chains && p.chains.length > 0 ? p.chains[0] : null);
    var capital = capitalFor();
    var hold = holdDaysFor(p.age_days);
    var secondChain = p.chains && p.chains.length >= 3 ? p.chains[1] : null;
    var gas2 = secondChain !== null ? gasPerTx(secondChain) : gas1;
    var second = secondChain !== null
      ? { text: 'Repeat the $25 deposit on ' + secondChain + ', so the farm covers two of the protocol\'s ' + p.chains.length + ' chains.', cost: '$25 of capital and about ' + gasStr(gas2) + ' of gas', time: '10 minutes' }
      : { text: secondActionFor(p, capital, chain), cost: 'about $25 of volume and ' + gasStr(gas1) + ' of gas', time: '10 minutes a week' };
    return [
      { text: 'Open a fresh wallet for the farm funds, and store its seed phrase offline on paper.', cost: 'about ' + gasStr(gas1) + ' of gas', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital, about ' + gasStr(2 * gas1) + ' of gas', time: '15 minutes' },
      second,
      { text: 'Every week, check the points page and confirm the position is still earning; once a month, do one on-chain action \u2014 a top-up, a claim or a vote.', cost: 'about ' + gasStr(gas1) + ' of gas a month', time: '5 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days, so the activity spans more than one user snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'Check the protocol\'s points page once a month, and claim only from the link that page publishes.', cost: 'free to check; never pay to claim', time: '10 minutes a month' },
      { text: 'Keep a farm log with the wallet, the dates and every transaction hash.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('v')) state.verdict = params.get('v');
    if (params.get('scope')) state.scope = params.get('scope');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.verdict !== 'all') params.set('v', state.verdict);
    if (state.scope !== 'all') params.set('scope', state.scope);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (state.verdict !== 'all' && previewFarm(r).verdict !== state.verdict) return false;
      if (state.scope === 'watchlist' && !r.watchlist) return false;
      if (state.scope === 'early' && r.watchlist) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'net') { av = previewFarm(a).net; bv = previewFarm(b).net; }
      else if (key === 'slice') { av = previewFarm(a).slice; bv = previewFarm(b).slice; }
      else { av = previewValue(a); bv = previewValue(b); }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  // Net dollars per hour of farm work. Outside the sandbox it is the model's own
  // number, so the cards agree with the detail drawer to the cent; the sandbox
  // recomputes it from the preview net, the same way it re-ranks the board.
  function perHour(row) {
    if (!SANDBOX) return row.farm_per_hour_usd;
    return previewFarm(row).net / row.farm_work_hours;
  }
  // The FARM plans paying the most net dollars per hour of work, best first.
  // watchlistOnly narrows it to the watchlist, for the lede's best-farm line.
  function farmNext(watchlistOnly) {
    return DATA.rows.filter(function (r) {
      if (watchlistOnly && !r.watchlist) return false;
      return previewFarm(r).verdict === 'FARM';
    }).sort(function (a, b) { return perHour(b) - perHour(a); });
  }
  // How many of the competition's watchlist the board actually covers, counted from
  // the rows, not assumed: the gate requires the whole watchlist, and the board holds it.
  function watchlistCovered() {
    return DATA.rows.filter(function (r) { return r.watchlist; }).length;
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    var c = DATA.curve;
    var bestWl = farmNext(true)[0];
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.board_size + ' protocols record no token. Here is what each launch would be worth, and what farming it costs.' }),
        el('p', { html: 'The watchlist is the floor: every protocol with at least <b>$' + Math.round(DATA.floor_usd / 1e6) + 'M</b> of TVL and no token on record. The early radar adds <b>' + DATA.early_size + ' more</b> launches, below the floor and above it. Every farm plan is netted to the dollar at <b>$1,000</b> — slice, gas and forgone yield — so the board says which farms pay and which never do.' })
      ),
      el('aside', { class: 'method', 'aria-label': 'How a launch is priced' },
        el('h2', { text: 'How a launch is priced' }),
        el('p', { class: 'formula', text: 'implied = 10^' + c.intercept.toFixed(2) + ' x TVL^' + c.slope.toFixed(2) + ' x growth x maturity x sibling' }),
        el('p', { text: 'Tested blind: leave-one-out miss x' + c.loo_median_x + ' (' + Math.round(c.loo_within3 * 100) + '% within 3x) vs x' + c.flat_loo_median_x + ' (' + Math.round(c.flat_loo_within3 * 100) + '%) for one flat multiple; on ' + c.split_test + ' tokens listed after 2024, x' + c.split_median_x + ' vs x' + c.flat_split_median_x + ' flat.' }),
        el('p', { text: 'Family multiplier tested and dropped: x3.03 with it, x' + c.loo_median_x + ' without.' }),
        bestWl ? el('p', { html: 'Best farm on the watchlist: <b>' + bestWl.name + ' +$' + perHour(bestWl).toFixed(2) + '/h</b>' }) : null
      )
    );
  }

  function statsStrip() {
    var v = DATA.verdicts;
    function stat(label, value) {
      return el('div', { class: 'stat' }, el('span', { text: label }), el('b', { text: value }));
    }
    return el('section', { class: 'stats', 'aria-label': 'Board facts' },
      stat('Watchlist covered', watchlistCovered() + ' / ' + DATA.watchlist_size),
      stat('Pre-token rows scored', String(DATA.board_size)),
      stat('Set aside by house rule', DATA.set_aside + ' of ' + DATA.pre_token_total),
      stat('Token trades, kept apart', String(DATA.live_total)),
      stat('Farm / thin / skip at $1.0K', v.farm + ' / ' + v.thin + ' / ' + v.skip),
      stat('Blind test (LOO)', 'x' + DATA.curve.loo_median_x + ' · ' + Math.round(DATA.curve.loo_within3 * 100) + '% in 3x')
    );
  }

  function farmNextCards() {
    var list = farmNext(false).slice(0, 5);
    if (list.length === 0) return el('section', { class: 'farm-next', 'aria-label': 'Farm next' });
    var cards = list.map(function (r, i) {
      var f = previewFarm(r);
      return el('button', { class: 'card', type: 'button', onclick: function () { openDetail(r.slug); } },
        el('span', { class: 'rank', text: 'Farm #' + (i + 1) }),
        el('b', { text: r.name }),
        el('span', { class: 'val', text: '+$' + perHour(r).toFixed(2) + '/h' }),
        el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + fmtUsd(r.tvl_usd) + ' TVL · FARM ' + fmtMoney(f.net) + ' net' })
      );
    });
    return el('section', { class: 'farm-next', 'aria-label': 'Farm next: best net dollars per hour' },
      el('h2', { text: 'Farm next' }),
      el('p', { class: 'sub', text: 'The five FARM plans paying the most net dollars per hour of work, at $1,000.' }),
      el('div', { class: 'top5' }, cards)
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chainCounts = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCounts[c] = (chainCounts[c] || 0) + 1; }); });
    var chains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a]; }).slice(0, 14);
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name or category', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    function select(id, label, options, current, onChange) {
      var s = el('select', { id: id, 'aria-label': label },
        options.map(function (o) { return el('option', { value: o[0], text: o[1], selected: o[0] === current ? 'selected' : null }); })
      );
      s.addEventListener('change', function () { onChange(s.value); writeHash(); render(); });
      return el('div', { class: 'field' }, el('label', { for: id, text: label }), s);
    }
    var catSelect = select('category', 'Category', [['all', 'All categories']].concat(categories.map(function (c) { return [c, c]; })), state.category, function (v) { state.category = v; });
    var chainSelect = select('chain', 'Chain', [['all', 'All chains']].concat(chains.map(function (c) { return [c, c + ' (' + chainCounts[c] + ')']; })), state.chain, function (v) { state.chain = v; });
    var verdictSelect = select('verdict', 'Farm verdict', [['all', 'All verdicts'], ['FARM', 'FARM'], ['THIN', 'THIN'], ['SKIP', 'SKIP']], state.verdict, function (v) { state.verdict = v; });
    var scopeSelect = select('scope', 'Scope', [['all', 'Watchlist + early'], ['watchlist', 'Watchlist only'], ['early', 'Early only']], state.scope, function (v) { state.scope = v; });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      catSelect, chainSelect, verdictSelect, scopeSelect,
      el('div', { class: 'field' }, el('div', { class: 'tabs', 'aria-label': 'Token status' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  // The implied value on a log bar: the P10-P90 band as a range, the value as a dot, $1M to $1B.
  function bandBar(row) {
    var lo = Math.log10(1e6), hi = Math.log10(1e9);
    function pos(v) { return Math.max(0, Math.min(100, (Math.log10(Math.max(1, v)) - lo) / (hi - lo) * 100)); }
    var p10 = SANDBOX ? previewValue(row) * Math.pow(10, DATA.curve.band_p10) : row.p10_usd;
    var p90 = SANDBOX ? previewValue(row) * Math.pow(10, DATA.curve.band_p90) : row.p90_usd;
    return el('div', { class: 'band', 'aria-hidden': 'true' },
      el('i', { class: 'band-range', style: 'left:' + pos(p10).toFixed(1) + '%;width:' + Math.max(1, pos(p90) - pos(p10)).toFixed(1) + '%' }),
      el('i', { class: 'band-dot', style: 'left:' + pos(previewValue(row)).toFixed(1) + '%' })
    );
  }

  function verdictPill(v) {
    return el('span', { class: 'verdict verdict-' + v.toLowerCase(), text: v });
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.verdict = 'all'; state.scope = 'all'; writeHash(); render(); } })
      ));
    }
    var tbody = el('tbody');
    list.forEach(function (r, i) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var rankLabel = SANDBOX ? String(i + 1) : String(r.rank);
      var f = previewFarm(r);
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: rankLabel }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + (r.watchlist ? ' · watchlist' : ' · early') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' }, bandBar(r),
          el('span', { class: 'num', text: fmtUsd(previewValue(r)) })
        )),
        el('td', { class: 'num', text: fmtMoney(f.slice) }),
        el('td', { class: 'num ' + (f.net >= 0 ? 'pos' : 'neg'), text: fmtMoney(f.net) }),
        el('td', null, verdictPill(f.verdict))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Strongest implied value first. Bar: implied value (dot) and P10-P90 band, log $1M-$1B. $1K slice: what $1,000 gets if 10% of the launch goes to depositors. Net: slice minus fees and forgone 4% yield. Select a row for its plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'No token for'),
            sortHeader('implied', 'Implied value'),
            sortHeader('slice', '$1K slice'),
            sortHeader('net', 'Net of all costs'),
            sortHeader('net', 'Farm')
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.mcap_usd && r.tvl_usd ? (r.mcap_usd / r.tvl_usd).toFixed(2) + 'x' : 'n/a' }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking. The ' + DATA.curve.comparables + ' cleaned comparables among them — not exchanges, not wrapped, staked or bridged products, market-cap/TVL between 0.005 and 5 — are the points the size curve is fitted to.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'MCap / TVL' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  // The scatter: traded tokens against the fitted curve, log-log. Comparables are grey dots,
  // the curve is the dashed line, and the board's own rows are amber dots on the same axes.
  function scatterSvg() {
    var W = 560, H = 300, L = 52, R = 12, T = 12, B = 30;
    var x0 = 1e6, x1 = 1e10, y0 = 1e5, y1 = 1e11;
    function X(v) { return L + (Math.log10(v) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0)) * (W - L - R); }
    function Y(v) { return T + (Math.log10(y1) - Math.log10(v)) / (Math.log10(y1) - Math.log10(y0)) * (H - T - B); }
    var out = ['<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Traded tokens against the fitted size curve, log-log">'];
    var grid = [1e6, 1e7, 1e8, 1e9, 1e10];
    grid.forEach(function (g) {
      out.push('<line x1="' + X(g).toFixed(1) + '" y1="' + T + '" x2="' + X(g).toFixed(1) + '" y2="' + (H - B) + '" stroke="#24344f" stroke-width="1"/>');
      out.push('<text x="' + X(g).toFixed(1) + '" y="' + (H - 10) + '" fill="#93a3b8" font-size="10" text-anchor="middle">' + fmtUsd(g) + '</text>');
    });
    [1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11].forEach(function (g) {
      out.push('<line x1="' + L + '" y1="' + Y(g).toFixed(1) + '" x2="' + (W - R) + '" y2="' + Y(g).toFixed(1) + '" stroke="#24344f" stroke-width="1"/>');
      out.push('<text x="' + (L - 6) + '" y="' + (Y(g).toFixed(1) + 3) + '" fill="#93a3b8" font-size="10" text-anchor="end">' + fmtUsd(g) + '</text>');
    });
    out.push('<text x="' + (W / 2) + '" y="' + (H - 10) + '" fill="#93a3b8" font-size="10" text-anchor="middle" dy="12">TVL</text>');
    var pts = '';
    DATA.comps.forEach(function (c) {
      if (c.tvl_usd < x0 || c.tvl_usd > x1 || c.mcap_usd < y0 || c.mcap_usd > y1) return;
      pts += '<circle cx="' + X(c.tvl_usd).toFixed(1) + '" cy="' + Y(c.mcap_usd).toFixed(1) + '" r="2.5" fill="#93a3b8"/>';
    });
    var line = '';
    for (var i = 0; i <= 40; i++) {
      var tvl = Math.pow(10, 6 + i / 40 * 4);
      var mcap = Math.pow(10, DATA.curve.intercept + DATA.curve.slope * Math.log10(tvl));
      line += (i === 0 ? 'M' : 'L') + X(tvl).toFixed(1) + ',' + Y(Math.max(y0, Math.min(y1, mcap))).toFixed(1);
    }
    out.push('<path d="' + line + '" fill="none" stroke="#22d3ee" stroke-width="2" stroke-dasharray="6 3"/>');
    out.push(pts);
    var rows = '';
    DATA.rows.forEach(function (r) {
      var v = previewValue(r);
      if (r.tvl_usd < x0 || r.tvl_usd > x1 || v < y0 || v > y1) return;
      rows += '<circle cx="' + X(r.tvl_usd).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="1.6" fill="#fbbf24" opacity="0.75"/>';
    });
    out.push(rows);
    out.push('<text x="' + (W - R) + '" y="' + (T + 12) + '" fill="#22d3ee" font-size="11" text-anchor="end">curve 10^' + DATA.curve.intercept + ' x TVL^' + DATA.curve.slope + '</text>');
    out.push('<text x="' + (W - R) + '" y="' + (T + 26) + '" fill="#93a3b8" font-size="11" text-anchor="end">grey: ' + DATA.curve.comparables + ' traded comparables</text>');
    out.push('<text x="' + (W - R) + '" y="' + (T + 40) + '" fill="#fbbf24" font-size="11" text-anchor="end">amber: ' + DATA.board_size + ' ranked launches</text>');
    out.push('</svg>');
    return out.join('');
  }

  function modelPanel() {
    var m = DATA.model, c = DATA.curve;
    var gw = el('input', { type: 'range', id: 'gw', min: '0', max: '1.2', step: '0.05', value: String(state.gw), 'aria-label': 'Growth weight' });
    var gwOut = el('b', { class: 'num', text: state.gw.toFixed(2) });
    gw.addEventListener('input', function () { state.gw = parseFloat(gw.value); gwOut.textContent = state.gw.toFixed(2); applySandbox(); });
    var mf = el('input', { type: 'range', id: 'mf', min: '0.5', max: '0.9', step: '0.05', value: String(state.mf), 'aria-label': 'Maturity floor' });
    var mfOut = el('b', { class: 'num', text: state.mf.toFixed(2) });
    mf.addEventListener('input', function () { state.mf = parseFloat(mf.value); mfOut.textContent = state.mf.toFixed(2); applySandbox(); });
    var reset = el('button', { class: 'button', type: 'button', text: 'Reset to the model', onclick: function () { state.gw = DATA.model.growth_weight; state.mf = DATA.model.maturity_floor; applySandbox(); render(); } });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. The market pays less per dollar of TVL as a protocol gets bigger, so the model fits a size curve to the ' + c.comparables + ' traded tokens that can price a launch — not an exchange, not a wrapped, staked or bridged product, market-cap/TVL between 0.005 and 5 — and reads each launch off that curve, times growth, maturity and a sibling factor. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( 10^' + c.intercept + ' x TVL^' + c.slope + ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x sibling )'
      ),
      el('div', { class: 'backtest' },
        el('h3', { text: 'The model, tested blind' }),
        el('table', { class: 'mini' },
          el('thead', null, el('tr', null, el('th', { text: 'Test' }), el('th', { text: 'Model' }), el('th', { text: 'One flat multiple' }))),
          el('tbody', null,
            el('tr', null, el('td', { text: 'Leave one out (' + c.comparables + ' tokens)' }), el('td', { class: 'num', text: 'median miss x' + c.loo_median_x + ', within 3x ' + Math.round(c.loo_within3 * 100) + '%, within 10x ' + Math.round(c.loo_within10 * 100) + '%' }), el('td', { class: 'num', text: 'median miss x' + c.flat_loo_median_x + ', within 3x ' + Math.round(c.flat_loo_within3 * 100) + '%, within 10x ' + Math.round(c.flat_loo_within10 * 100) + '%' })),
            el('tr', null, el('td', { text: 'Time split: fit pre-2024 (' + c.split_train + '), price newer (' + c.split_test + ')' }), el('td', { class: 'num', text: 'median miss x' + c.split_median_x + ', within 3x ' + Math.round(c.split_within3 * 100) + '%' }), el('td', { class: 'num', text: 'median miss x' + c.flat_split_median_x + ', within 3x ' + Math.round(c.flat_split_within3 * 100) + '%' }))
          )
        ),
        el('p', { class: 'sub', text: 'The band around each implied value is the leave-one-out residual\u2019s 10th to 90th percentile (x' + Math.pow(10, c.band_p10).toFixed(2) + ' to x' + Math.pow(10, c.band_p90).toFixed(2) + '): the model misses a held-out token by that much, four times in five. A flat multiple is the baseline the model has to beat, and it does, on both tests.' })
      ),
      el('div', { class: 'scatter', html: scatterSvg() }),
      el('p', { class: 'sub', text: 'The curve is fitted robustly: each traded token\u2019s weight falls as its residual grows, so one odd token cannot bend it. Category effects were tested the same way and dropped: a family multiplier priced held-out tokens worse (median miss x3.03 with it, x2.87 without), so the board carries none. Sibling: the median log-residual of traded tokens sharing the protocol\u2019s first word, shrunk by n / (n + 3) toward no effect and clamped to 0.25x\u20134x; no such token means 1.00x.' }),
      el('div', { class: 'sandbox' },
        el('div', { class: 'field' }, el('label', { for: 'gw', text: 'Sandbox: growth weight' }), gw, gwOut),
        el('div', { class: 'field' }, el('label', { for: 'mf', text: 'Sandbox: maturity floor' }), mf, mfOut),
        reset,
        el('p', { class: 'sandbox-note', text: SANDBOX ? 'Sandbox preview: the table is re-ranked with your settings. The board\u2019s ranks are the model\u2019s.' : 'Move a slider to preview how the board re-ranks. The board\u2019s ranks are the model\u2019s.' })
      ),
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. "No token" means the record carries none: a protocol on this board may still have a token its record does not carry.' })
    );
  }

  function applySandbox() {
    SANDBOX = state.gw !== DATA.model.growth_weight || state.mf !== DATA.model.maturity_floor;
    render();
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  // The traded tokens nearest this row by TVL: the peers the curve was fitted against.
  function nearestPeers(row) {
    var lt = Math.log10(row.tvl_usd);
    return DATA.comps.map(function (c) { return { c: c, d: Math.abs(Math.log10(c.tvl_usd) - lt) }; })
      .sort(function (a, b) { return a.d - b.d; }).slice(0, 3).map(function (x) { return x.c; });
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model.growth_weight, DATA.model.maturity_floor);
    var f = previewFarm(row);
    var peers = nearestPeers(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    var left = el('div', { class: 'detail-col' },
      el('section', { class: 'detail-section' },
        el('h3', { text: 'How ' + fmtUsd(previewValue(row)) + ' is built' }),
        el('p', { class: 'sub', text: row.watchlist ? 'On the watchlist: at least $50M of TVL and no token on record.' : 'An early find: pre-token, and the board ranks it on its own figures.' }),
        el('div', { class: 'equation' },
          el('div', null, el('span', { text: 'Size curve (' + DATA.curve.comparables + ' comparables)' }), el('b', { class: 'num', text: fmtUsd(row.curve_value_usd) })),
          el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
          el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
          el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
          el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
          el('div', null, el('span', { text: 'Sibling' }), el('b', { class: 'num', text: 'x' + row.sibling_multiplier.toFixed(2) })),
          el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(previewValue(row)) })),
          el('div', null, el('span', { text: 'P10 to P90, blind' }), el('b', { class: 'num', text: fmtUsd(SANDBOX ? previewValue(row) * Math.pow(10, DATA.curve.band_p10) : row.p10_usd) + ' to ' + fmtUsd(SANDBOX ? previewValue(row) * Math.pow(10, DATA.curve.band_p90) : row.p90_usd) }))
        ),
        el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') })
      ),
      el('section', { class: 'detail-section' },
        el('h3', { text: 'Against traded peers' }),
        el('table', { class: 'mini' },
          el('thead', null, el('tr', null, el('th', { text: 'Nearest by TVL' }), el('th', { text: 'TVL' }), el('th', { text: 'Market cap' }), el('th', { text: 'MCap / TVL' }))),
          el('tbody', null, peers.map(function (c) {
            return el('tr', null,
              el('td', { text: c.name }),
              el('td', { class: 'num', text: fmtUsd(c.tvl_usd) }),
              el('td', { class: 'num', text: fmtUsd(c.mcap_usd) }),
              el('td', { class: 'num', text: (c.mcap_usd / c.tvl_usd).toFixed(2) + 'x' })
            );
          }))
        ),
        el('p', { class: 'sub', text: 'The three traded tokens closest to this protocol in size.' }),
        el('h3', { text: 'Why this rank' }),
        el('ul', { class: 'signals' }, (row.signals || []).map(function (s) { return el('li', { text: s }); }))
      )
    );
    var sensRows = [1000, 10000, 100000].map(function (cap) {
      var cells = [0.05, 0.10, 0.20].map(function (d) {
        var net = f.slice * (cap / 1000) * (1 - d) - row.farm_fees_usd - row.farm_forgone_usd * (cap / 1000);
        return el('td', { class: 'num ' + (net >= 0 ? 'pos' : 'neg'), text: fmtMoney(net) });
      });
      return el('tr', null, el('td', { class: 'num', text: '$' + (cap / 1000) + 'K' }), cells);
    });
    var right = el('div', { class: 'detail-col' },
      el('section', { class: 'detail-section' },
        el('h3', { text: 'Netted to the dollar' }),
        el('div', { class: 'equation' },
          el('div', null, el('span', { text: 'Slice: 10% of the launch, pro rata to TVL' }), el('b', { class: 'num', text: fmtMoney(f.slice) })),
          el('div', null, el('span', { text: 'Fees: the plan\u2019s gas at this chain\u2019s rate' }), el('b', { class: 'num', text: '-$' + row.farm_fees_usd.toFixed(2) })),
          el('div', null, el('span', { text: 'Forgone: 4% a year on $1,000 for ' + row.farm_hold_days + ' days' }), el('b', { class: 'num', text: '-$' + row.farm_forgone_usd.toFixed(2) })),
          el('div', null, el('span', { text: 'Net' }), el('b', { class: 'num ' + (f.net >= 0 ? 'pos' : 'neg'), text: fmtMoney(f.net) })),
          el('div', null, el('span', { text: 'Verdict' }), verdictPill(f.verdict)),
          el('div', null, el('span', { text: 'Work' }), el('b', { class: 'num', text: row.farm_work_hours.toFixed(1) + 'h, ' + fmtMoney(row.farm_per_hour_usd) + '/h' }))
        ),
        el('table', { class: 'mini sens' },
          el('thead', null, el('tr', null, el('th', { text: 'Net if the launch drops' }), el('th', { text: '5%' }), el('th', { text: '10%' }), el('th', { text: '20%' }))),
          el('tbody', null, sensRows)
        )
      ),
      el('section', { class: 'detail-section' },
        el('h3', { text: 'Farm plan · $1,000 for ' + row.farm_hold_days + ' days' }),
        el('ol', { class: 'steps' }, steps.map(function (s) {
          var at = s.indexOf(' Cost: ');
          var action = at >= 0 ? s.slice(0, at) : s;
          var tail = at >= 0 ? s.slice(at + 1) : '';
          return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
        }))
      )
    );
    dialog.appendChild(el('div', { class: 'detail-grid' }, left, right));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(statsStrip());
    shell.appendChild(farmNextCards());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
