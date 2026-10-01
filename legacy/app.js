(() => {
  const STORAGE_KEY = "sidebet_v3_state";
  const GROUP_ORDER = ["Family", "Friends", "Roommates", "Work", "Local Sports", "Other"];
  const GROUP_SYNONYMS = {
    Family: ["baby", "pregnancy", "sister", "mom", "dad", "parents", "relative", "family"],
    Friends: ["friend", "friends", "buddy", "crew", "groupchat", "group chat"],
    Roommates: ["roommate", "roommates", "roomie", "house", "apartment", "rent"],
    Work: ["work", "office", "coworker", "job", "boss"],
    "Local Sports": ["sport", "sports", "football", "basketball", "baseball", "game", "team", "arkansas", "razorbacks"],
    Other: ["other", "random", "misc"]
  };

  const now = new Date();
  function daysFromNow(days) {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }

  function demoSeries(seed, length = 48, start = 50) {
    let value = start;
    const arr = [];
    for (let i = 0; i < length; i += 1) {
      value += Math.sin((i + seed) * .69) * 1.2 + Math.cos((i + seed) * .29) * .85 + ((i % 5) - 2) * .16;
      value = Math.max(4, Math.min(96, value));
      arr.push(Number(value.toFixed(2)));
    }
    return arr;
  }

  function seedMarkets() {
    return [
      {
        id: "demo-arkansas",
        title: "Will Arkansas win Saturday?",
        question: "Will Arkansas win its football game this Saturday?",
        group: "Friends",
        unit: "$",
        deadline: daysFromNow(2),
        payout: "parimutuel",
        description: "Game-day prediction with the group.",
        rules: "Entries lock at kickoff. Final score decides the market.",
        options: [{ id: "ark-yes", name: "Yes" }, { id: "ark-no", name: "No" }],
        entries: [
          { id: "e1", name: "Grady", optionId: "ark-yes", amount: 35 },
          { id: "e2", name: "Mike", optionId: "ark-yes", amount: 50 },
          { id: "e3", name: "Tyler", optionId: "ark-no", amount: 40 }
        ],
        createdAt: daysFromNow(-2),
        closedAt: null,
        resolution: null,
        series: demoSeries(2, 56, 56)
      },
      {
        id: "demo-baby",
        title: "Baby Boy or Girl?",
        question: "Will the baby be a boy or a girl?",
        group: "Family",
        unit: "$",
        deadline: daysFromNow(16),
        payout: "parimutuel",
        description: "Family prediction pool.",
        rules: "Ultrasound result determines the winner.",
        options: [{ id: "baby-boy", name: "Boy" }, { id: "baby-girl", name: "Girl" }],
        entries: [
          { id: "e4", name: "Grady", optionId: "baby-boy", amount: 30 },
          { id: "e5", name: "Mom", optionId: "baby-girl", amount: 20 },
          { id: "e6", name: "Dad", optionId: "baby-boy", amount: 25 }
        ],
        createdAt: daysFromNow(-4),
        closedAt: null,
        resolution: null,
        series: demoSeries(8, 56, 48)
      },
      {
        id: "demo-dishes",
        title: "Will Jake do the dishes tonight?",
        question: "Will Jake finish the dishes before midnight?",
        group: "Roommates",
        unit: "$",
        deadline: daysFromNow(1),
        payout: "tracking-only",
        description: "Roommate accountability market.",
        rules: "Dishes must be fully washed and put away before midnight.",
        options: [{ id: "dish-yes", name: "Yes" }, { id: "dish-no", name: "No" }],
        entries: [
          { id: "e7", name: "Grady", optionId: "dish-no", amount: 10 },
          { id: "e8", name: "Jake", optionId: "dish-yes", amount: 10 }
        ],
        createdAt: daysFromNow(-1),
        closedAt: null,
        resolution: null,
        series: demoSeries(14, 56, 51)
      },
      {
        id: "demo-lunch",
        title: "Will lunch arrive before noon?",
        question: "Will the office lunch order arrive before 12:00 PM?",
        group: "Work",
        unit: "$",
        deadline: daysFromNow(-8),
        payout: "tracking-only",
        description: "Office delivery prediction.",
        rules: "Delivery timestamp decides the result.",
        options: [{ id: "lunch-yes", name: "Yes" }, { id: "lunch-no", name: "No" }],
        entries: [{ id: "e9", name: "Grady", optionId: "lunch-yes", amount: 15 }],
        createdAt: daysFromNow(-10),
        closedAt: daysFromNow(-8),
        resolution: { optionId: "lunch-no", resolvedAt: daysFromNow(-8) },
        series: demoSeries(20, 46, 58)
      },
      {
        id: "demo-track",
        title: "14'6 Pole Vault This Meet?",
        question: "Will Grady clear 14 feet 6 inches at the next meet?",
        group: "Local Sports",
        unit: "$",
        deadline: daysFromNow(-21),
        payout: "tracking-only",
        description: "Track meet prediction.",
        rules: "Official meet result decides the market.",
        options: [{ id: "pv-yes", name: "Yes" }, { id: "pv-no", name: "No" }],
        entries: [{ id: "e10", name: "Grady", optionId: "pv-yes", amount: 20 }],
        createdAt: daysFromNow(-28),
        closedAt: daysFromNow(-21),
        resolution: { optionId: "pv-yes", resolvedAt: daysFromNow(-21) },
        series: demoSeries(33, 46, 41)
      }
    ];
  }

  const defaultState = {
    profile: { name: "Grady", handle: "@sidebet", initials: "GH" },
    markets: seedMarkets()
  };

  let state = loadState();
  let currentPage = "home";
  let currentMarketId = null;
  let portfolioMetric = "equity";
  let historyFilter = "all";
  let createPreset = "parimutuel";
  let createGroupPreset = "Family";
  let chartRange = "1M";

  const $ = id => document.getElementById(id);
  const $$ = selector => [...document.querySelectorAll(selector)];

  function cloneDefault() { return JSON.parse(JSON.stringify(defaultState)); }
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return cloneDefault();
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.markets)) return cloneDefault();
      return { profile: parsed.profile || defaultState.profile, markets: parsed.markets };
    } catch { return cloneDefault(); }
  }
  function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function makeId() { return crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  function marketById(id) { return state.markets.find(m => m.id === id) || null; }
  function isClosed(m) { return Boolean(m.closedAt || m.resolution); }
  function currentPrice(m) { const s = m.series?.length ? m.series : [50]; return Number(s[s.length - 1]) || 50; }
  function previousPrice(m) { const s = m.series?.length > 1 ? m.series : [50, 50]; return Number(s[s.length - 2]) || currentPrice(m); }
  function priceChangePercent(m) { const p = previousPrice(m); return p ? ((currentPrice(m) - p) / p) * 100 : 0; }
  function totalPledged(m) { return (m.entries || []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0); }
  function myEntries(m) { const me = state.profile.name.toLowerCase(); return (m.entries || []).filter(e => String(e.name).toLowerCase() === me); }
  function myPledged(m) { return myEntries(m).reduce((sum, e) => sum + (Number(e.amount) || 0), 0); }
  function myEquity(m) { return myPledged(m) * (.55 + currentPrice(m) / 100); }
  function didUserWin(m) {
    if (!m.resolution) return null;
    const mine = myEntries(m);
    if (!mine.length) return null;
    return mine.some(e => e.optionId === m.resolution.optionId);
  }
  function outcomeName(m) { return m.options.find(o => o.id === m.resolution?.optionId)?.name || "Unresolved"; }
  function payoutLabel(value) { if (value === "winner-take-all") return "Winner Takes All"; if (value === "tracking-only") return "Prediction Only"; return "Pool Split"; }
  function formatMoney(value, unit = "$") { const n = Number(value) || 0; const f = n.toLocaleString(undefined, { maximumFractionDigits: 2 }); return unit === "$" ? `$${f}` : `${f} ${unit}`; }
  function formatDate(value, options = { month: "short", day: "numeric", year: "numeric" }) { const d = new Date(value); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString([], options); }
  function formatDeadline(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); }

  function pathFromSeries(series, width = 600, height = 160, pad = 8) {
    if (!series || series.length < 2) return "";
    const min = Math.min(...series), max = Math.max(...series), spread = Math.max(1, max - min);
    return series.map((v, i) => {
      const x = pad + (i / (series.length - 1)) * (width - pad * 2);
      const y = height - pad - ((v - min) / spread) * (height - pad * 2);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(" ");
  }

  function showPage(page) {
    currentPage = page;
    $$(".page").forEach(p => p.classList.toggle("active-page", p.id === `page-${page}`));
    $$("[data-nav]").forEach(btn => btn.classList.toggle("active", btn.dataset.nav === page));
    if (page === "portfolio") renderPortfolio();
    if (page === "history") renderHistory();
    if (page === "profile") renderProfile();
    if (page === "market") renderMarketDetail();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setPayout(value) {
    $("betPayout").value = value;
    $$(".payout-choice").forEach(btn => btn.classList.toggle("selected", btn.dataset.payout === value));
  }

  function addOptionRow(value = "") {
    if ($("optionEditor").children.length >= 8) return;
    const row = $("optionTemplate").content.firstElementChild.cloneNode(true);
    row.querySelector(".option-input").value = value;
    row.querySelector(".remove-option").addEventListener("click", () => {
      row.remove(); updateRemoveButtons();
    });
    $("optionEditor").appendChild(row);
    updateRemoveButtons();
  }

  function updateRemoveButtons() {
    const rows = $$("#optionEditor .option-editor-row");
    rows.forEach(r => r.querySelector(".remove-option").disabled = rows.length <= 2);
  }

  function renderOptionEditor(values) {
    $("optionEditor").innerHTML = "";
    values.slice(0, 8).forEach(addOptionRow);
    while ($("optionEditor").children.length < 2) addOptionRow("");
  }

  function openCreateDialog(preset = "parimutuel", group = null) {
    createPreset = preset;
    createGroupPreset = group || createGroupPreset || "Family";
    $("createForm").reset();
    $("betUnit").value = "$";
    $("betTime").value = "00:00";
    $("betGroup").value = createGroupPreset;
    $("betRules").value = "Entries lock at the listed deadline. The creator resolves the final result using the stated rule.";
    $("createMessage").textContent = "";
    setPayout(createPreset);
    renderOptionEditor(["Yes", "No"]);
    $("createDialog").showModal();
  }

  function optionNames() { return $$("#optionEditor .option-input").map(i => i.value.trim()).filter(Boolean); }
  function combineDateTime(dateStr, timeStr) {
    if (!dateStr || !timeStr) return null;
    const d = new Date(`${dateStr}T${timeStr}:00`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  function validateCreate() {
    const options = optionNames();
    const deadline = combineDateTime($("betDate").value, $("betTime").value);
    if (!$("betTitle").value.trim()) return "Bet title is required.";
    if (!$("betQuestion").value.trim()) return "Main question is required.";
    if (!$("betUnit").value.trim()) return "Unit label is required.";
    if (!$("betDate").value) return "Deadline date is required.";
    if (!$("betTime").value) return "Deadline time is required.";
    if (!deadline) return "Enter a valid deadline.";
    if (options.length < 2) return "At least two options are required.";
    if (new Set(options.map(x => x.toLowerCase())).size !== options.length) return "Options must be different.";
    if (!$("betRules").value.trim()) return "Rules are required.";
    return "";
  }

  function createMarket() {
    const market = {
      id: makeId(),
      title: $("betTitle").value.trim(),
      question: $("betQuestion").value.trim(),
      group: $("betGroup").value,
      unit: $("betUnit").value.trim(),
      deadline: combineDateTime($("betDate").value, $("betTime").value),
      payout: $("betPayout").value,
      description: $("betDescription").value.trim(),
      rules: $("betRules").value.trim(),
      options: optionNames().map(name => ({ id: makeId(), name })),
      entries: [],
      createdAt: new Date().toISOString(),
      closedAt: null,
      resolution: null,
      series: demoSeries(Math.floor(Math.random() * 40), 50, 50)
    };
    state.markets.unshift(market);
    saveState();
    $("createDialog").close();
    currentMarketId = market.id;
    showPage("market");
  }

  function buildSparkline(market, width = 100, height = 38) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathFromSeries(market.series, width, height, 3));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "2.4");
    svg.appendChild(path);
    return svg;
  }

  function renderPortfolio() {
    const active = state.markets.filter(m => !isClosed(m));
    const groups = GROUP_ORDER.filter(g => active.some(m => m.group === g));
    const equity = active.reduce((s, m) => s + myEquity(m), 0);
    const pledged = active.reduce((s, m) => s + myPledged(m), 0);
    const changes = active.map(priceChangePercent);
    const avg = changes.length ? changes.reduce((a,b) => a+b,0) / changes.length : 0;

    $("portfolioEquity").textContent = formatMoney(equity);
    $("portfolioChange").textContent = `${avg >= 0 ? "+" : ""}${avg.toFixed(1)}% today`;
    $("portfolioChange").classList.toggle("positive", avg >= 0);
    $("portfolioChange").classList.toggle("negative", avg < 0);
    $("openMarketCount").textContent = active.length;
    $("groupCount").textContent = groups.length;
    $("pledgedTotal").textContent = formatMoney(pledged);

    const portfolioSeries = Array.from({ length: 56 }, (_, i) => {
      const base = active.reduce((sum, market) => {
        const s = market.series || [50];
        const idx = Math.floor((i / 55) * (s.length - 1));
        return sum + (s[idx] || 0);
      }, 0);
      return base || 50 + Math.sin(i/4) * 4;
    });
    $("portfolioChartPath").setAttribute("d", pathFromSeries(portfolioSeries, 600, 160, 7));

    $("portfolioGroups").innerHTML = "";
    if (!active.length) {
      $("portfolioGroups").innerHTML = '<div class="empty-message">No active bets yet. Create one from the top right.</div>';
      return;
    }

    groups.forEach(group => {
      const markets = active.filter(m => m.group === group);
      const section = document.createElement("section");
      section.className = "market-group";
      section.innerHTML = `<div class="market-group-head"><h2>${group}</h2><span>${markets.length} ${markets.length === 1 ? "market" : "markets"}</span></div><div class="market-list"></div>`;
      const list = section.querySelector(".market-list");

      markets.forEach(market => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "market-row";

        const title = document.createElement("div");
        title.className = "market-title-cell";
        title.innerHTML = "<strong></strong><span></span>";
        title.querySelector("strong").textContent = market.title;
        title.querySelector("span").textContent = market.question;

        const chart = document.createElement("div");
        chart.className = "market-row-chart";
        chart.appendChild(buildSparkline(market));

        const change = priceChangePercent(market);
        const changeCell = document.createElement("div");
        changeCell.className = "metric-cell metric-change";
        changeCell.innerHTML = `<strong class="${change >= 0 ? "positive" : "negative"}">${change >= 0 ? "+" : ""}${change.toFixed(1)}%</strong><span>change</span>`;

        const metric = document.createElement("div");
        metric.className = "metric-cell";
        let primary = "", secondary = "";
        if (portfolioMetric === "equity") { primary = formatMoney(myEquity(market), market.unit); secondary = "my equity"; }
        else if (portfolioMetric === "change") { primary = `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`; secondary = "change"; }
        else if (portfolioMetric === "price") { primary = `${currentPrice(market).toFixed(0)}¢`; secondary = "current price"; }
        else { primary = formatMoney(myPledged(market), market.unit); secondary = "pledged"; }
        metric.innerHTML = `<strong>${primary}</strong><span>${secondary}</span>`;

        row.append(title, chart, changeCell, metric);
        row.addEventListener("click", () => { currentMarketId = market.id; showPage("market"); });
        list.appendChild(row);
      });
      $("portfolioGroups").appendChild(section);
    });
  }

  function normalizeText(text) { return String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim(); }
  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
    return dp[m][n];
  }

  function expandedTokens(query) {
    const tokens = normalizeText(query).split(" ").filter(Boolean);
    const set = new Set(tokens);
    Object.entries(GROUP_SYNONYMS).forEach(([group, words]) => {
      const all = [group, ...words].flatMap(w => normalizeText(w).split(" "));
      if (all.some(word => tokens.some(t => word.includes(t) || t.includes(word)))) all.forEach(w => set.add(w));
    });
    return [...set];
  }

  function fuzzyScore(market, query) {
    const q = normalizeText(query);
    if (!q) return 1;
    const hay = normalizeText([market.title, market.question, market.group, market.description, market.rules, ...(market.options || []).map(o => o.name)].join(" "));
    if (hay.includes(q)) return 100;
    const words = hay.split(" ");
    let score = 0;
    expandedTokens(query).forEach(token => {
      if (hay.includes(token)) score += 12;
      else if (words.some(w => w.startsWith(token) || token.startsWith(w))) score += 7;
      else if (token.length >= 4 && words.some(w => Math.abs(w.length - token.length) <= 2 && levenshtein(token, w) <= (token.length <= 5 ? 1 : 2))) score += 4;
    });
    return score;
  }

  function renderHistory() {
    const query = $("historySearch").value.trim();
    let closed = state.markets.filter(isClosed).filter(m => {
      const result = didUserWin(m);
      if (historyFilter === "won") return result === true;
      if (historyFilter === "lost") return result === false;
      return true;
    });
    closed = closed.map(m => ({ market: m, score: fuzzyScore(m, query) }))
      .filter(x => x.score > 0)
      .sort((a, b) => query && a.score !== b.score ? b.score - a.score : new Date(b.market.closedAt || b.market.resolution?.resolvedAt) - new Date(a.market.closedAt || a.market.resolution?.resolvedAt))
      .map(x => x.market);

    $("historyResults").innerHTML = "";
    if (!closed.length) {
      $("historyResults").innerHTML = '<div class="empty-message">No matching closed bets found. Try a broader word like “sports”, “family”, or “work”.</div>';
      return;
    }

    const groups = new Map();
    closed.forEach(m => {
      const key = formatDate(m.closedAt || m.resolution?.resolvedAt, { month: "long", year: "numeric" });
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    });

    groups.forEach((markets, label) => {
      const section = document.createElement("section");
      section.className = "history-date-group";
      section.innerHTML = `<h2>${label}</h2>`;
      markets.forEach(market => {
        const card = document.createElement("div");
        card.className = "history-card";
        const button = document.createElement("button");
        button.type = "button";
        button.innerHTML = "<strong></strong><p></p>";
        button.querySelector("strong").textContent = market.title;
        button.querySelector("p").textContent = `${market.group} • ${formatDate(market.closedAt || market.resolution?.resolvedAt)} • Winner: ${outcomeName(market)}`;
        button.addEventListener("click", () => { currentMarketId = market.id; showPage("market"); });
        const result = document.createElement("div");
        result.className = "history-result";
        const won = didUserWin(market);
        result.innerHTML = `<strong class="${won === true ? "positive" : won === false ? "negative" : ""}">${won === true ? "Won" : won === false ? "Lost" : "Closed"}</strong><span>${formatMoney(myPledged(market), market.unit)} pledged</span>`;
        card.append(button, result);
        section.appendChild(card);
      });
      $("historyResults").appendChild(section);
    });
  }

  function renderProfile() {
    const active = state.markets.filter(m => !isClosed(m)).length;
    const closed = state.markets.filter(isClosed);
    const resolvedMine = closed.filter(m => didUserWin(m) !== null);
    const wins = resolvedMine.filter(m => didUserWin(m) === true).length;
    $("profileDisplayName").textContent = state.profile.name;
    $("profileHandle").textContent = state.profile.handle;
    $("profileAvatar").textContent = state.profile.initials;
    $("profileActiveCount").textContent = active;
    $("profileClosedCount").textContent = closed.length;
    $("profileWinRate").textContent = `${resolvedMine.length ? Math.round((wins / resolvedMine.length) * 100) : 0}%`;
  }

  function renderMarketDetail() {
    const market = marketById(currentMarketId);
    if (!market) { $("marketDetail").innerHTML = '<div class="empty-message">Market not found.</div>'; return; }
    const price = currentPrice(market), change = priceChangePercent(market), total = totalPledged(market);
    $("marketDetail").innerHTML = `
      <section class="market-detail-hero card">
        <div class="market-detail-top">
          <div><span class="eyebrow">${market.group.toUpperCase()} • ${isClosed(market) ? "CLOSED" : "OPEN"}</span><h1></h1><p class="market-detail-question"></p></div>
          <div class="market-detail-price"><strong>${price.toFixed(0)}¢</strong><span class="${change >= 0 ? "positive" : "negative"}">${change >= 0 ? "+" : ""}${change.toFixed(1)}%</span></div>
        </div>
      </section>
      <section class="market-chart-card card">
        <div class="chart-toolbar"><span class="eyebrow">MARKET PRICE</span><div class="range-buttons"><button type="button" data-range="1D">1D</button><button type="button" data-range="1W">1W</button><button type="button" data-range="1M">1M</button><button type="button" data-range="ALL">ALL</button></div></div>
        <svg class="market-big-chart" viewBox="0 0 920 310" role="img" aria-label="Market price chart">
          <g class="market-chart-grid"><line x1="0" y1="62" x2="920" y2="62"></line><line x1="0" y1="124" x2="920" y2="124"></line><line x1="0" y1="186" x2="920" y2="186"></line><line x1="0" y1="248" x2="920" y2="248"></line></g>
          <path id="detailChartPath" d="${pathFromSeries(market.series, 920, 310, 14)}" fill="none" stroke="currentColor" stroke-width="4" vector-effect="non-scaling-stroke"></path>
        </svg>
      </section>
      <div class="market-detail-grid">
        <section class="market-options-card card"><div class="section-heading"><span class="eyebrow">OUTCOMES</span><h2>Market sides</h2></div><div class="detail-options"></div>${!isClosed(market) ? '<button class="btn btn-primary" id="joinMarketBtn" type="button" style="margin-top:14px;">Add Position</button>' : ""}</section>
        <aside class="market-info-card card"><div class="section-heading"><span class="eyebrow">DETAILS</span><h2>Market info</h2></div><div class="market-info-list"><div><span>Deadline</span><strong>${formatDeadline(market.deadline)}</strong></div><div><span>Group</span><strong>${market.group}</strong></div><div><span>Total Pledged</span><strong>${formatMoney(total, market.unit)}</strong></div><div><span>Settlement</span><strong>${payoutLabel(market.payout)}</strong></div><div><span>Your Pledge</span><strong>${formatMoney(myPledged(market), market.unit)}</strong></div></div><div class="market-rules"><strong>Rules</strong><br>${escapeHtml(market.rules)}</div></aside>
      </div>`;
    $("marketDetail").querySelector("h1").textContent = market.title;
    $("marketDetail").querySelector(".market-detail-question").textContent = market.question;

    const optionsWrap = $("marketDetail").querySelector(".detail-options");
    market.options.forEach(option => {
      const pledged = (market.entries || []).filter(e => e.optionId === option.id).reduce((s,e) => s + Number(e.amount || 0), 0);
      const share = total ? pledged / total * 100 : 0;
      const row = document.createElement("div");
      row.className = "detail-option";
      row.innerHTML = `<div><strong></strong><span></span></div><div class="detail-option-price">${share.toFixed(0)}¢</div>`;
      row.querySelector("strong").textContent = option.name;
      row.querySelector("span").textContent = `${formatMoney(pledged, market.unit)} pledged`;
      optionsWrap.appendChild(row);
    });

    $$(".range-buttons button").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.range === chartRange);
      btn.addEventListener("click", () => { chartRange = btn.dataset.range; $$(".range-buttons button").forEach(b => b.classList.toggle("active", b === btn)); updateDetailChartRange(market); });
    });
    $("joinMarketBtn")?.addEventListener("click", () => openEntryDialog(market));
  }

  function escapeHtml(text) { const d = document.createElement("div"); d.textContent = text || ""; return d.innerHTML; }
  function updateDetailChartRange(market) {
    const s = market.series || [50,50];
    let count = s.length;
    if (chartRange === "1D") count = Math.min(8, s.length);
    else if (chartRange === "1W") count = Math.min(20, s.length);
    else if (chartRange === "1M") count = Math.min(40, s.length);
    $("detailChartPath")?.setAttribute("d", pathFromSeries(s.slice(-count), 920, 310, 14));
  }

  function openEntryDialog(market) {
    currentMarketId = market.id;
    $("entryDialogTitle").textContent = market.title;
    $("entryName").value = state.profile.name;
    $("entryAmount").value = "";
    $("entryOption").innerHTML = "";
    market.options.forEach(option => {
      const o = document.createElement("option");
      o.value = option.id; o.textContent = option.name; $("entryOption").appendChild(o);
    });
    $("entryDialog").showModal();
  }

  function addEntry() {
    const market = marketById(currentMarketId);
    if (!market) return;
    const name = $("entryName").value.trim(), optionId = $("entryOption").value, amount = Number($("entryAmount").value);
    if (!name || !optionId || !Number.isFinite(amount) || amount <= 0) return;
    market.entries.push({ id: makeId(), name, optionId, amount, createdAt: new Date().toISOString() });
    const last = currentPrice(market);
    market.series.push(Number(Math.max(4, Math.min(96, last + Math.random() * 4 - 1.3)).toFixed(2)));
    saveState();
    $("entryDialog").close();
    renderMarketDetail();
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = "sidebet-v3-backup.json"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  async function importData(file) {
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || !Array.isArray(parsed.markets)) throw new Error();
      state = { profile: parsed.profile || defaultState.profile, markets: parsed.markets };
      saveState(); renderProfile(); renderPortfolio(); renderHistory(); alert("SideBet data imported.");
    } catch { alert("That does not look like a valid SideBet V3 backup."); }
  }

  $$("[data-nav]").forEach(btn => btn.addEventListener("click", () => showPage(btn.dataset.nav)));
  $$("[data-open-create]").forEach(btn => btn.addEventListener("click", () => openCreateDialog("parimutuel")));
  $("topCreateBtn").addEventListener("click", () => openCreateDialog("parimutuel"));
  $$(".settlement-card").forEach(card => card.addEventListener("click", () => openCreateDialog(card.dataset.preset)));
  $$(".category-chip").forEach(chip => chip.addEventListener("click", () => openCreateDialog("parimutuel", chip.dataset.quickGroup)));
  $$(".payout-choice").forEach(btn => btn.addEventListener("click", () => setPayout(btn.dataset.payout)));
  $("addOptionBtn").addEventListener("click", () => addOptionRow(""));

  $("createForm").addEventListener("submit", e => {
    e.preventDefault();
    const error = validateCreate();
    $("createMessage").textContent = error;
    if (!error) createMarket();
  });
  $("closeCreateDialog").addEventListener("click", () => $("createDialog").close());
  $("cancelCreateBtn").addEventListener("click", () => $("createDialog").close());

  $("entryFormModal").addEventListener("submit", e => { e.preventDefault(); addEntry(); });
  $("closeEntryDialog").addEventListener("click", () => $("entryDialog").close());
  $("cancelEntryBtn").addEventListener("click", () => $("entryDialog").close());
  $("marketBackBtn").addEventListener("click", () => showPage("portfolio"));

  $$("#portfolioMetricControl button").forEach(btn => btn.addEventListener("click", () => {
    portfolioMetric = btn.dataset.metric;
    $$("#portfolioMetricControl button").forEach(b => b.classList.toggle("active", b === btn));
    renderPortfolio();
  }));

  $("historySearch").addEventListener("input", renderHistory);
  $$(".history-filter").forEach(btn => btn.addEventListener("click", () => {
    historyFilter = btn.dataset.historyFilter;
    $$(".history-filter").forEach(b => b.classList.toggle("active", b === btn));
    renderHistory();
  }));

  $("editProfileBtn").addEventListener("click", () => {
    $("profileNameInput").value = state.profile.name;
    $("profileHandleInput").value = state.profile.handle;
    $("profileInitialsInput").value = state.profile.initials;
    $("profileDialog").showModal();
  });
  $("profileForm").addEventListener("submit", e => {
    e.preventDefault();
    const handle = $("profileHandleInput").value.trim();
    state.profile = {
      name: $("profileNameInput").value.trim() || "User",
      handle: handle.startsWith("@") ? handle : `@${handle}`,
      initials: $("profileInitialsInput").value.trim().toUpperCase() || "SB"
    };
    saveState(); $("profileDialog").close(); renderProfile(); renderPortfolio();
  });
  $("closeProfileDialog").addEventListener("click", () => $("profileDialog").close());
  $("cancelProfileBtn").addEventListener("click", () => $("profileDialog").close());
  $("exportBtn").addEventListener("click", exportData);
  $("importInput").addEventListener("change", e => { const file = e.target.files?.[0]; if (file) importData(file); e.target.value = ""; });

  setInterval(() => {
    let changed = false;
    state.markets.forEach(market => {
      if (isClosed(market)) return;
      if (!Array.isArray(market.series)) market.series = [50];
      const last = currentPrice(market);
      const drift = Math.sin(Date.now()/25000 + market.title.length) * .45 + (Math.random() - .5) * .7;
      market.series.push(Number(Math.max(4, Math.min(96, last + drift)).toFixed(2)));
      if (market.series.length > 80) market.series.shift();
      changed = true;
    });
    if (changed) {
      saveState();
      if (currentPage === "portfolio") renderPortfolio();
      if (currentPage === "market") renderMarketDetail();
    }
  }, 12000);

  showPage("home");
})();
