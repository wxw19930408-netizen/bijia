(() => {
  "use strict";

  const PLATFORMS = [
    { id: "taobao", name: "淘宝", short: "淘", color: "#ff5000", tagline: "搜索页抓取" },
    { id: "jd", name: "京东", short: "京", color: "#e1251b", tagline: "搜索页抓取" },
    { id: "pdd", name: "拼多多", short: "拼", color: "#e02e24", tagline: "移动搜索页抓取" }
  ];
  const RECENTS_KEY = "price-desk.auto.recents.v1";

  const els = {
    form: document.getElementById("autoSearchForm"),
    query: document.getElementById("autoQuery"),
    searchBtn: document.getElementById("autoSearchBtn"),
    loginBtn: document.getElementById("loginBtn"),
    startBrowserBtn: document.getElementById("startBrowserBtn"),
    closeBrowserBtn: document.getElementById("closeBrowserBtn"),
    browserStatus: document.getElementById("browserStatus"),
    browserDot: document.getElementById("browserDot"),
    consoleBrowser: document.getElementById("consoleBrowser"),
    consoleLogin: document.getElementById("consoleLogin"),
    consoleLight: document.getElementById("consoleLight"),
    consoleLog: document.getElementById("consoleLog"),
    serviceWarning: document.getElementById("serviceWarning"),
    loginPanel: document.getElementById("loginPanel"),
    loginClose: document.getElementById("loginClose"),
    loginTabs: document.getElementById("loginTabs"),
    loginShot: document.getElementById("loginShot"),
    loginShotLink: document.getElementById("loginShotLink"),
    loginShotEmpty: document.getElementById("loginShotEmpty"),
    loginPlatformHint: document.getElementById("loginPlatformHint"),
    refreshLoginShot: document.getElementById("refreshLoginShot"),
    qrLoginBtn: document.getElementById("qrLoginBtn"),
    openLoginWindow: document.getElementById("openLoginWindow"),
    loginPrev: document.getElementById("loginPrev"),
    loginDone: document.getElementById("loginDone"),
    recentWrap: document.getElementById("autoRecentWrap"),
    recentChips: document.getElementById("autoRecentChips"),
    resultQuery: document.getElementById("resultQuery"),
    searchState: document.getElementById("searchState"),
    platformFilters: document.getElementById("platformFilters"),
    sortSelect: document.getElementById("sortSelect"),
    dataCount: document.getElementById("dataCount"),
    dataTableWrap: document.getElementById("dataTableWrap"),
    grid: document.getElementById("autoGrid"),
    toast: document.getElementById("toast")
  };

  const state = {
    query: "",
    running: false,
    results: {},
    loginTabs: [],
    activeLoginId: null,
    loginIndex: 0,
    loginCompleted: [],
    loginBusy: false,
    loginShotLoading: false,
    loginShotToken: 0,
    loginRefreshTimer: 0,
    hasLoginShot: false,
    sortMode: "price-asc",
    platformFilter: "all",
    controller: null,
    timer: 0,
    startedAt: 0,
    serverReady: true,
    browserRunning: false,
    demo: new URLSearchParams(location.search).get("demo") === "1"
  };

  let toastTimer = 0;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function safeHref(value) {
    try {
      const url = new URL(String(value), location.origin);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : "#";
    } catch {
      return "#";
    }
  }

  function money(value) {
    return Number(value).toLocaleString("zh-CN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  }

  function toast(message) {
    window.clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("show");
    toastTimer = window.setTimeout(() => {
      els.toast.classList.remove("show");
    }, 3200);
  }

  function setConsoleLog(message) {
    els.consoleLog.innerHTML = `<span class="console-prompt">$</span><span>${escapeHtml(message)}</span>`;
  }

  function platformMeta(id) {
    return PLATFORMS.find((platform) => platform.id === id) || PLATFORMS[0];
  }

  function activeLoginTab() {
    return state.loginTabs.find((tab) => tab.id === state.activeLoginId) || null;
  }

  function renderLoginTabs() {
    els.loginTabs.innerHTML = PLATFORMS.map((platform, index) => {
      const done = state.loginCompleted.includes(platform.id);
      const current = index === state.loginIndex;
      return `
        <div class="login-step ${current ? "is-current" : ""} ${done ? "is-done" : ""}" role="listitem" aria-current="${current ? "step" : "false"}">
          <span class="login-step-index" aria-hidden="true">${done ? "✓" : index + 1}</span>
          <span>${platform.name}</span>
        </div>
      `;
    }).join("");
  }

  function updateLoginControls() {
    const last = state.loginIndex >= PLATFORMS.length - 1;
    const prev = state.loginIndex > 0 ? PLATFORMS[state.loginIndex - 1] : null;
    const next = !last ? PLATFORMS[state.loginIndex + 1] : null;
    els.loginDone.textContent = last
      ? "完成登录"
      : `登录完成，下一家：${next.name}`;
    els.loginPrev.textContent = prev ? `上一家：${prev.name}` : "上一家";
    els.loginPrev.disabled = !prev || state.loginBusy;
    els.loginDone.disabled = state.loginBusy;
    els.refreshLoginShot.disabled = state.loginBusy;
    els.qrLoginBtn.disabled = state.loginBusy;
  }

  function setLoginBusy(busy) {
    state.loginBusy = busy;
    updateLoginControls();
  }

  function loadLoginShot(force = false) {
    const tab = activeLoginTab();
    if (!tab) {
      toast("先点“登录三家”打开登录页");
      return;
    }
    if (state.loginShotLoading && !force) return;
    const token = ++state.loginShotToken;
    state.loginShotLoading = true;
    const url = `/api/browser/screenshot?targetId=${encodeURIComponent(tab.targetId)}&t=${Date.now()}`;
    if (!state.hasLoginShot) {
      els.loginShotEmpty.hidden = false;
      els.loginShotEmpty.textContent = "正在加载登录页截图…";
      els.loginShot.style.opacity = "0";
    }

    const preload = new Image();
    preload.onload = () => {
      if (token !== state.loginShotToken) return;
      state.loginShotLoading = false;
      state.hasLoginShot = true;
      els.loginShot.src = url;
      els.loginShotLink.href = url;
      els.loginShot.style.opacity = "1";
      els.loginShotEmpty.hidden = true;
      scheduleLoginRefresh(3000);
    };
    preload.onerror = () => {
      if (token !== state.loginShotToken) return;
      state.loginShotLoading = false;
      if (!state.hasLoginShot) {
        els.loginShotEmpty.hidden = false;
        els.loginShotEmpty.textContent = "登录页截图加载失败，点“刷新二维码”重试";
      }
      scheduleLoginRefresh(5000);
    };
    preload.src = url;
    window.setTimeout(() => {
      if (token === state.loginShotToken) {
        state.loginShotLoading = false;
        scheduleLoginRefresh(5000);
      }
    }, 28000);
  }

  function scheduleLoginRefresh(delay = 8000) {
    window.clearTimeout(state.loginRefreshTimer);
    state.loginRefreshTimer = window.setTimeout(() => {
      if (!els.loginPanel.hidden && activeLoginTab()) loadLoginShot();
    }, delay);
  }

  function displayLoginTab(tab, { scroll = false } = {}) {
    if (!tab) return;
    stopLoginAutoRefresh();
    state.loginTabs = [tab];
    state.activeLoginId = tab.id;
    state.hasLoginShot = false;
    renderLoginTabs();
    updateLoginControls();
    els.loginPlatformHint.textContent = `第 ${state.loginIndex + 1}/${PLATFORMS.length} 家 · 正在显示${platformMeta(tab.id).name}登录页。`;
    els.loginShot.removeAttribute("src");
    els.loginShot.style.opacity = "0";
    els.loginShotEmpty.hidden = false;
    els.loginShotEmpty.textContent = "正在加载登录页截图…";
    loadLoginShot(true);
    if (scroll) {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      els.loginPanel.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start"
      });
    }
  }

  async function startPlatformLogin(index, { scroll = true } = {}) {
    const platform = PLATFORMS[index];
    if (!platform) return;
    stopLoginAutoRefresh();
    setLoginBusy(true);
    els.loginPlatformHint.textContent = `正在打开${platform.name}登录页…`;
    try {
      const data = await postJson("/api/browser/login", { platform: platform.id });
      const tab = data.tabs?.[0];
      if (!tab) throw new Error("没有拿到登录标签页");
      state.loginIndex = index;
      els.loginPanel.hidden = false;
      displayLoginTab(tab, { scroll });
      setConsoleLog(`login ${index + 1}/${PLATFORMS.length} · ${platform.name}`);
      await refreshStatus();
    } finally {
      setLoginBusy(false);
    }
  }

  function stopLoginAutoRefresh() {
    window.clearTimeout(state.loginRefreshTimer);
    state.loginRefreshTimer = 0;
  }

  function cardMarkup(platform) {
    return `
      <article class="auto-card" data-platform="${platform.id}" style="--brand:${platform.color}">
        <div class="auto-card-head">
          <div class="platform-identity">
            <span class="platform-logo" aria-hidden="true">${platform.short}</span>
            <div>
              <h3>${platform.name}</h3>
              <p>${platform.tagline}</p>
            </div>
          </div>
          <span class="auto-chip" data-role="chip">等待</span>
        </div>
        <div class="auto-card-body" data-role="body">
          <div class="auto-idle">
            <span class="auto-idle-mark">¥</span>
            <p>输入商品名后，抓取 ${platform.name} 搜索结果</p>
          </div>
        </div>
      </article>
    `;
  }

  function renderInitialCards() {
    els.grid.innerHTML = PLATFORMS.map(cardMarkup).join("");
  }

  function setCardLoading(platform) {
    const card = els.grid.querySelector(`[data-platform="${platform.id}"]`);
    if (!card) return;
    card.querySelector('[data-role="chip"]').className = "auto-chip is-running";
    card.querySelector('[data-role="chip"]').textContent = "抓取中";
    card.querySelector('[data-role="body"]').innerHTML = `
      <div class="auto-skeleton" aria-label="正在抓取">
        <span></span><span></span><span></span><span></span><span></span>
      </div>
    `;
  }

  function cardChip(result) {
    if (!result) return { className: "auto-chip", text: "等待" };
    if (result.status === "ok") {
      return {
        className: "auto-chip is-ok",
        text: result.cached ? `缓存 · ${result.items.length}` : `已抓取 ${result.items.length}`
      };
    }
    if (result.status === "login") return { className: "auto-chip is-warn", text: "需要登录" };
    if (result.status === "verify") return { className: "auto-chip is-warn", text: "需要验证" };
    if (result.status === "error") return { className: "auto-chip is-error", text: "抓取失败" };
    return { className: "auto-chip is-muted", text: "未识别" };
  }

  function itemLink(item) {
    return `<a href="${escapeHtml(safeHref(item.link))}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>`;
  }

  function renderOkCard(platform, result) {
    const count = result.items?.length || 0;
    const sortLine = result.sortApplied
      ? (result.sortAscending ? "✓ 已按价格从低到高排序" : "已点击价格排序")
      : (result.sortNote || "未找到价格排序控件");
    return `
      <div class="auto-card-summary">
        <div class="auto-summary-number">${count}<span>件商品</span></div>
        <p class="auto-summary-line">${escapeHtml(result.message || `已抓取 ${count} 件商品`)}</p>
        <p class="auto-summary-sort ${result.sortApplied && result.sortAscending ? "" : "is-muted"}">${escapeHtml(sortLine)}</p>
      </div>
    `;
  }

  function renderProblemCard(platform, result) {
    const isError = result.status === "error";
    const title = result.status === "login"
      ? `需要登录${platform.name}`
      : result.status === "verify"
        ? `${platform.name}需要完成验证`
        : isError
          ? `${platform.name}抓取失败`
          : `没有识别到商品`;
    const target = result.targetId
      ? `<button class="button ghost" type="button" data-action="activate" data-target="${escapeHtml(result.targetId)}">打开这个页面处理</button>`
      : `<button class="button ghost" type="button" data-action="login">打开登录页</button>`;

    return `
      <div class="auto-callout ${isError ? "is-error" : ""}">
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(result.message || "请稍后重试")}</p>
        <div class="auto-callout-actions">
          ${target}
          <button class="button ghost" type="button" data-action="retry">重新抓取</button>
        </div>
        ${result.pageTitle || result.debugText ? `
          <details class="auto-details">
            <summary>诊断信息</summary>
            ${result.pageTitle ? `<pre>页面标题：${escapeHtml(result.pageTitle)}</pre>` : ""}
            ${result.debugText ? `<pre>${escapeHtml(result.debugText)}</pre>` : ""}
          </details>
        ` : ""}
      </div>
    `;
  }

  function updateCard(result) {
    const platform = platformMeta(result.id);
    const card = els.grid.querySelector(`[data-platform="${platform.id}"]`);
    if (!card) return;
    const chip = cardChip(result);
    const chipElement = card.querySelector('[data-role="chip"]');
    chipElement.className = chip.className;
    chipElement.textContent = chip.text;
    card.querySelector('[data-role="body"]').innerHTML = result.status === "ok"
      ? renderOkCard(platform, result)
      : renderProblemCard(platform, result);
  }

  function markMissingResults(message) {
    for (const platform of PLATFORMS) {
      if (state.results[platform.id]) continue;
      const result = {
        id: platform.id,
        name: platform.name,
        short: platform.short,
        color: platform.color,
        status: "error",
        message,
        items: [],
        best: null,
        targetId: null,
        debugText: ""
      };
      state.results[platform.id] = result;
      updateCard(result);
    }
  }

  function okResults() {
    return PLATFORMS
      .map((platform) => state.results[platform.id])
      .filter((result) => result?.status === "ok" && result.best)
      .sort((a, b) => a.best.price - b.best.price);
  }

  function renderSummary() {
    const results = okResults();
    if (!results.length) {
      if (state.running) {
        renderSummaryEmpty("正在打开三家搜索页并识别商品…", "RUNNING");
      } else if (state.query) {
        renderSummaryEmpty("这次没有拿到可用价格，看看下面哪家需要登录或验证", "NO PRICE");
      } else {
        renderInitialSummary();
      }
      return;
    }

    if (results.length === 1) {
      const only = results[0];
      els.summary.innerHTML = `
        <div class="single-price">
          <span class="best-label">已抓到价格</span>
          <div class="single-line">
            <span class="single-platform" style="--c:${only.color}"><i></i>${escapeHtml(only.name)}</span>
            <strong>¥ ${money(only.best.price)}</strong>
          </div>
          <p>${escapeHtml(only.best.title)}</p>
          <p class="auto-summary-note">另外两家的结果还没拿到，可能需要登录或验证。</p>
        </div>
      `;
      return;
    }

    const best = results[0];
    const worst = results[results.length - 1];
    const difference = worst.best.price - best.best.price;
    const rows = results.map((result, index) => `
      <li class="rank-item ${index === 0 ? "is-best" : ""}" style="--c:${result.color}">
        <span class="rank-no">${String(index + 1).padStart(2, "0")}</span>
        <div class="rank-main">
          <div class="rank-name">
            <span class="rank-logo" aria-hidden="true">${result.short}</span>
            <span>${escapeHtml(result.name)}</span>
            ${index === 0 ? `<span class="best-tag">最低</span>` : ""}
            <span class="rank-title">${escapeHtml(result.best.title)}</span>
          </div>
          <div class="rank-track" aria-hidden="true">
            <i style="--w:${Math.max(14, (result.best.price / worst.best.price) * 100).toFixed(1)}%"></i>
          </div>
        </div>
        <div class="rank-price">
          <strong>¥${money(result.best.price)}</strong>
          <small>${index === 0 ? "参考最低" : `+¥${money(result.best.price - best.best.price)}`}</small>
        </div>
      </li>
    `).join("");

    els.summary.innerHTML = `
      <div class="best-card">
        <span class="best-label">LOWEST MATCH / 三家最低参考价</span>
        <div class="best-line">
          <span class="best-platform">${escapeHtml(best.name)}</span>
          <span class="best-price">¥ ${money(best.best.price)}</span>
        </div>
        <div class="save-line">
          ${difference > 0
            ? `比最高价 <span>${escapeHtml(worst.name)} ¥${money(worst.best.price)}</span> 省 <strong>¥${money(difference)}</strong>`
            : "三家最匹配商品的价格暂时相同"}
        </div>
      </div>
      <ol class="rank-list">${rows}</ol>
      <p class="auto-summary-note">按各平台“最匹配商品”的价格比较，规格、版本和店铺可能不同；请点进商品页确认。</p>
    `;
  }

  function allRows() {
    return PLATFORMS.flatMap((platform) => {
      const result = state.results[platform.id];
      if (!result || result.status !== "ok") return [];
      return (result.items || []).map((item) => ({ ...item, platform }));
    });
  }

  function sortedRows() {
    const rows = allRows().filter((row) =>
      state.platformFilter === "all" || row.platform.id === state.platformFilter
    );
    const mode = state.sortMode;
    rows.sort((a, b) => {
      if (mode === "price-desc") {
        return b.price - a.price || b.matchScore - a.matchScore;
      }
      if (mode === "match-desc") {
        return b.matchScore - a.matchScore || a.price - b.price;
      }
      if (mode === "platform") {
        const aIndex = PLATFORMS.findIndex((platform) => platform.id === a.platform.id);
        const bIndex = PLATFORMS.findIndex((platform) => platform.id === b.platform.id);
        return aIndex - bIndex || a.price - b.price;
      }
      return a.price - b.price || b.matchScore - a.matchScore;
    });
    return rows;
  }

  function renderTable() {
    const total = allRows().length;
    const rows = sortedRows();
    els.dataCount.textContent = state.platformFilter === "all"
      ? `共 ${total} 件`
      : `${rows.length} / ${total} 件`;
    els.sortSelect.value = state.sortMode;
    for (const button of els.platformFilters.querySelectorAll("[data-filter]")) {
      button.classList.toggle("is-active", button.dataset.filter === state.platformFilter);
    }

    if (!rows.length) {
      let title = "抓取后，三家商品会汇总到这里";
      let hint = "可以按价格、匹配度或平台排序。";
      if (state.running) {
        title = "正在抓取三家商品…";
        hint = "结果会边抓边出现在这里。";
      } else if (state.query) {
        title = "没有可展示的商品";
        hint = "看看上面三家卡片是否提示需要登录或验证。";
      }
      els.dataTableWrap.innerHTML = `<div class="data-empty"><strong>${title}</strong>${hint}</div>`;
      return;
    }

    const body = rows.map((row) => {
      const meta = [row.shop, row.sales].filter(Boolean).join(" · ");
      const price = row.priceDisplay || `¥${money(row.price)}`;
      return `
        <tr>
          <td>
            <span class="data-platform">
              <span class="data-platform-logo" style="--c:${row.platform.color}" aria-hidden="true">${row.platform.short}</span>
              ${escapeHtml(row.platform.name)}
            </span>
          </td>
          <td class="data-product">
            <a href="${escapeHtml(safeHref(row.link))}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(row.title)}">${escapeHtml(row.title)}</a>
            <div class="data-meta">${escapeHtml(meta || "—")}</div>
          </td>
          <td class="data-price"${row.priceDisplay ? ` title="排序值 ¥${money(row.price)}"` : ""}>${escapeHtml(price)}</td>
          <td class="data-match">${Math.round(Number(row.matchScore || 0) * 100)}%</td>
          <td><a class="data-open" href="${escapeHtml(safeHref(row.link))}" target="_blank" rel="noopener noreferrer">打开 ↗</a></td>
        </tr>
      `;
    }).join("");

    els.dataTableWrap.innerHTML = `
      <table class="data-table">
        <thead><tr><th>平台</th><th>商品</th><th>价格</th><th>匹配度</th><th></th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    `;
  }

  function updateSearchState() {
    const count = Object.keys(state.results).length;
    const okCount = PLATFORMS.filter((platform) => state.results[platform.id]?.status === "ok").length;
    if (!state.running) {
      if (!state.query) {
        els.searchState.className = "auto-state";
        els.searchState.textContent = "准备就绪";
      } else {
        els.searchState.className = "auto-state is-done";
        els.searchState.textContent = okCount ? `完成 · ${okCount}/3 家` : "完成 · 无价格";
      }
      return;
    }
    els.searchState.className = "auto-state is-running";
    const seconds = Math.max(0, Math.round((Date.now() - state.startedAt) / 1000));
    els.searchState.textContent = `抓取中 · ${count}/3 · ${seconds}s`;
  }

  function startTimer() {
    window.clearInterval(state.timer);
    state.timer = window.setInterval(updateSearchState, 1000);
  }

  function stopTimer() {
    window.clearInterval(state.timer);
    state.timer = 0;
  }

  function resetResults() {
    state.results = {};
    for (const platform of PLATFORMS) setCardLoading(platform);
    renderTable();
    updateSearchState();
  }

  function saveRecent(query) {
    try {
      const current = JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]");
      const next = [query, ...current.filter((item) => item !== query)].slice(0, 6);
      localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      renderRecents();
    } catch {
      // Recent searches are optional.
    }
  }

  function renderRecents() {
    let recents = [];
    try {
      recents = JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]");
    } catch {
      recents = [];
    }
    recents = Array.isArray(recents) ? recents : [];
    if (!recents.length) {
      els.recentWrap.hidden = true;
      els.recentChips.innerHTML = "";
      return;
    }
    els.recentWrap.hidden = false;
    els.recentChips.innerHTML = recents
      .map((query, index) => `<button class="chip" type="button" data-recent="${index}" title="${escapeHtml(query)}">${escapeHtml(query)}</button>`)
      .join("");
  }

  async function refreshStatus() {
    try {
      const response = await fetch("/api/status", { signal: AbortSignal.timeout(4000) });
      if (!response.ok) throw new Error("status failed");
      const data = await response.json();
      state.serverReady = true;
      els.serviceWarning.hidden = true;
      const running = data.browser?.running;
      state.browserRunning = Boolean(running);
      els.browserStatus.textContent = running
        ? `本地 Chrome 已连接${data.browser?.headless ? " · 无界面" : ""}`
        : "本地 Chrome 未启动（抓取时自动启动）";
      els.browserDot.className = `auto-status-dot ${running ? "is-live" : ""}`;
      els.consoleBrowser.textContent = running ? "Chrome 已连接" : "Chrome 未启动";
      els.consoleLight.className = `console-light ${running ? "is-live" : ""}`;
      if (!running) els.consoleLogin.textContent = "首次需登录";
    } catch {
      state.serverReady = false;
      state.browserRunning = false;
      els.browserStatus.textContent = "本地抓取服务未连接";
      els.browserDot.className = "auto-status-dot is-error";
      els.consoleBrowser.textContent = "服务未连接";
      els.consoleLight.className = "console-light";
      els.serviceWarning.hidden = false;
    }
  }

  async function postJson(url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(25000)
    });
    let data = null;
    try {
      data = await response.json();
    } catch {
      // Fall through to the status error.
    }
    if (!response.ok || data?.ok === false) {
      throw new Error(data?.error || `请求失败（${response.status}）`);
    }
    return data;
  }

  async function prewarmLogin() {
    if (location.protocol === "file:" || state.demo || state.browserRunning) return;
    try {
      setConsoleLog("prewarming the first login page");
      await postJson("/api/browser/prewarm");
      setConsoleLog("first login page ready in the background");
      await refreshStatus();
    } catch (error) {
      setConsoleLog(`prewarm skipped: ${error.message}`);
    }
  }

  async function openLogin() {
    if (state.running) {
      toast("先等当前抓取完成");
      return;
    }
    els.loginBtn.disabled = true;
    els.loginBtn.textContent = "正在打开…";
    state.loginIndex = 0;
    state.loginCompleted = [];
    state.loginTabs = [];
    state.activeLoginId = null;
    renderLoginTabs();
    updateLoginControls();
    setConsoleLog("launching chrome + first login page");
    try {
      await startPlatformLogin(0, { scroll: true });
      els.consoleLogin.textContent = "登录页已打开";
      toast("先登录淘宝，完成后点“下一家：京东”");
    } catch (error) {
      toast(`打开登录页失败：${error.message}`);
      setConsoleLog(`error: ${error.message}`);
    } finally {
      els.loginBtn.disabled = false;
      els.loginBtn.textContent = "逐家登录";
    }
  }

  async function startBrowser() {
    els.startBrowserBtn.disabled = true;
    els.startBrowserBtn.textContent = "正在启动…";
    setConsoleLog("starting chrome for scraping");
    try {
      await postJson("/api/browser/start");
      toast("抓取浏览器已启动");
      setConsoleLog("chrome ready");
      await refreshStatus();
    } catch (error) {
      toast(`启动失败：${error.message}`);
      setConsoleLog(`error: ${error.message}`);
    } finally {
      els.startBrowserBtn.disabled = false;
      els.startBrowserBtn.textContent = "打开抓取浏览器";
    }
  }

  async function closeBrowser() {
    try {
      await postJson("/api/browser/close");
      toast("抓取浏览器已关闭");
      els.consoleLogin.textContent = "首次需登录";
      setConsoleLog("chrome closed");
      await refreshStatus();
    } catch (error) {
      toast(`关闭失败：${error.message}`);
    }
  }

  async function activateTab(targetId) {
    try {
      await postJson("/api/browser/activate", { targetId });
      toast("已切到对应页面，请完成登录或验证");
    } catch (error) {
      toast(`切换页面失败：${error.message}`);
    }
  }

  async function switchToQrLogin() {
    const tab = activeLoginTab();
    if (!tab) {
      toast("先打开登录页");
      return;
    }
    els.qrLoginBtn.disabled = true;
    els.qrLoginBtn.textContent = "正在切换…";
    try {
      const data = await postJson("/api/browser/click-text", {
        targetId: tab.targetId,
        platform: tab.id
      });
      toast(data.message || "已尝试切换扫码登录");
      await new Promise((resolve) => setTimeout(resolve, 1200));
      loadLoginShot();
    } catch (error) {
      toast(`切换失败：${error.message}`);
    } finally {
      els.qrLoginBtn.disabled = false;
      els.qrLoginBtn.textContent = "切换扫码登录";
    }
  }

  function handleMessage(message) {
    if (message.type === "meta") {
      if (message.demo) {
        setConsoleLog("demo mode · 使用演示数据");
      } else {
        setConsoleLog(`searching ${message.query} · three platforms`);
      }
      return;
    }
    if (message.type === "platform") {
      const result = message.platform;
      if (!result?.id) return;
      state.results[result.id] = result;
      updateCard(result);
      renderTable();
      updateSearchState();
      const done = Object.keys(state.results).length;
      setConsoleLog(`${result.id} · ${result.status} · ${result.tookMs || 0}ms · ${done}/3`);
      return;
    }
    if (message.type === "error") {
      toast(message.message);
      setConsoleLog(`error: ${message.message}`);
      return;
    }
    if (message.type === "done") {
      setConsoleLog(message.cached ? "done · from cache" : "done · three platforms");
    }
  }

  async function runSearch(query, { demo = false } = {}) {
    if (state.running) {
      toast("正在抓取，请稍等");
      return;
    }
    if (location.protocol === "file:") {
      els.serviceWarning.hidden = false;
      toast("请先运行 start-auto.bat，通过本地服务打开");
      return;
    }

    state.query = query;
    state.running = true;
    state.results = {};
    state.startedAt = Date.now();
    els.resultQuery.textContent = `正在比较「${query}」`;
    els.searchBtn.disabled = true;
    els.query.value = query;
    resetResults();
    renderTable();
    startTimer();
    setConsoleLog(`opening three search pages · ${query}`);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("autoResults").scrollIntoView({
      behavior: reduceMotion || demo ? "auto" : "smooth",
      block: "start"
    });

    state.controller = new AbortController();
    const timeout = window.setTimeout(() => state.controller?.abort(), 120000);
    try {
      const params = new URLSearchParams({ q: query });
      if (demo) params.set("demo", "1");
      const response = await fetch(`/api/search?${params.toString()}`, {
        signal: state.controller.signal,
        headers: { Accept: "application/x-ndjson, application/json" }
      });

      const contentType = response.headers.get("content-type") || "";
      if (!response.ok && !contentType.includes("ndjson")) {
        let errorMessage = `抓取服务返回 ${response.status}`;
        try {
          const data = await response.json();
          if (data?.error) errorMessage = data.error;
        } catch {
          // Keep the status message.
        }
        throw new Error(errorMessage);
      }
      if (!response.body) throw new Error("浏览器不支持流式读取");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;

      while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let message;
          try {
            message = JSON.parse(line);
          } catch {
            continue;
          }
          handleMessage(message);
          if (message.type === "done") finished = true;
        }
      }
      if (buffer.trim()) {
        try {
          handleMessage(JSON.parse(buffer));
        } catch {
          // Ignore a partial trailing line.
        }
      }
      if (!finished) {
        setConsoleLog("stream ended without done marker");
      }
    } catch (error) {
      const message = error.name === "AbortError"
        ? "抓取超时，请检查 Chrome 页面是否卡住"
        : `连接本地抓取服务失败：${error.message}`;
      toast(message);
      setConsoleLog(`error: ${message}`);
      if (!state.serverReady) els.serviceWarning.hidden = false;
    } finally {
      window.clearTimeout(timeout);
      state.running = false;
      state.controller = null;
      state.timer = 0;
      stopTimer();
      els.searchBtn.disabled = false;
      markMissingResults("这次没有收到该平台的结果，请重新抓取");
      els.resultQuery.textContent = `上次比较「${state.query}」`;
      updateSearchState();
      renderTable();
      saveRecent(query);
      await refreshStatus();
    }
  }

  function submitSearch(event) {
    event.preventDefault();
    if (state.running) {
      toast("正在抓取，请稍等");
      return;
    }
    const query = els.query.value.trim();
    if (!query) {
      els.form.classList.remove("shake");
      void els.form.offsetWidth;
      els.form.classList.add("shake");
      els.query.focus();
      toast("先输入一个商品名称");
      return;
    }
    runSearch(query);
  }

  function bindEvents() {
    els.form.addEventListener("submit", submitSearch);
    els.loginBtn.addEventListener("click", openLogin);
    els.startBrowserBtn.addEventListener("click", startBrowser);
    els.closeBrowserBtn.addEventListener("click", closeBrowser);
    els.platformFilters.addEventListener("click", (event) => {
      const button = event.target.closest("[data-filter]");
      if (!button) return;
      state.platformFilter = button.dataset.filter;
      renderTable();
    });
    els.sortSelect.addEventListener("change", (event) => {
      state.sortMode = event.target.value;
      renderTable();
    });
    els.loginClose.addEventListener("click", () => {
      els.loginPanel.hidden = true;
      stopLoginAutoRefresh();
    });
    els.refreshLoginShot.addEventListener("click", async () => {
      const tab = activeLoginTab();
      if (!tab) {
        toast("先打开登录页");
        return;
      }
      els.refreshLoginShot.disabled = true;
      const oldLabel = els.refreshLoginShot.textContent;
      els.refreshLoginShot.textContent = "刷新中…";
      try {
        await postJson("/api/browser/reload-login", { targetId: tab.targetId });
        state.hasLoginShot = false;
        els.loginShot.removeAttribute("src");
        els.loginShot.style.opacity = "0";
        els.loginShotEmpty.hidden = false;
        els.loginShotEmpty.textContent = "正在刷新二维码…";
        loadLoginShot(true);
      } catch (error) {
        toast(`刷新失败：${error.message}`);
      } finally {
        els.refreshLoginShot.disabled = false;
        els.refreshLoginShot.textContent = oldLabel;
      }
    });
    els.qrLoginBtn.addEventListener("click", switchToQrLogin);
    els.openLoginWindow.addEventListener("click", () => {
      const tab = activeLoginTab();
      if (tab) activateTab(tab.targetId);
    });
    els.loginPrev.addEventListener("click", async () => {
      if (state.loginBusy || state.loginIndex <= 0) return;
      try {
        await startPlatformLogin(state.loginIndex - 1, { scroll: false });
        toast(`已切回${PLATFORMS[state.loginIndex].name}登录页`);
      } catch (error) {
        toast(`切换失败：${error.message}`);
      }
    });

    els.loginDone.addEventListener("click", async () => {
      if (state.loginBusy) return;
      const current = PLATFORMS[state.loginIndex];
      if (current && !state.loginCompleted.includes(current.id)) {
        state.loginCompleted.push(current.id);
      }
      renderLoginTabs();
      updateLoginControls();

      if (state.loginIndex < PLATFORMS.length - 1) {
        try {
          await startPlatformLogin(state.loginIndex + 1, { scroll: false });
          toast(`请继续登录${PLATFORMS[state.loginIndex].name}`);
        } catch (error) {
          toast(`打开下一家失败：${error.message}`);
        }
        return;
      }

      els.loginPanel.hidden = true;
      stopLoginAutoRefresh();
      els.consoleLogin.textContent = "登录流程完成";
      els.query.focus();
      toast("登录流程完成；输入商品名，点“抓取价格”");
    });

    els.recentChips.addEventListener("click", (event) => {
      const button = event.target.closest("[data-recent]");
      if (!button) return;
      let recents = [];
      try {
        recents = JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]");
      } catch {
        recents = [];
      }
      const query = recents[Number(button.dataset.recent)];
      if (query) runSearch(query);
    });

    els.grid.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) return;
      if (button.dataset.action === "activate") {
        activateTab(button.dataset.target);
      } else if (button.dataset.action === "login") {
        openLogin();
      } else if (button.dataset.action === "retry") {
        if (state.query) runSearch(state.query);
      }
    });

    document.addEventListener("keydown", (event) => {
      const target = event.target;
      const typing = target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable;
      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        els.query.focus();
        return;
      }
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        if (!state.running) els.form.requestSubmit();
      }
    });
  }

  function init() {
    renderInitialCards();
    renderTable();
    renderRecents();
    renderLoginTabs();
    updateLoginControls();
    bindEvents();

    if (location.protocol === "file:") {
      state.serverReady = false;
      els.serviceWarning.hidden = false;
      els.browserStatus.textContent = "需要通过本地服务打开";
      els.browserDot.className = "auto-status-dot is-error";
      els.searchBtn.disabled = true;
      els.loginBtn.disabled = true;
      els.startBrowserBtn.disabled = true;
      els.closeBrowserBtn.disabled = true;
      return;
    }

    refreshStatus().then(() => {
      if (state.serverReady && !state.browserRunning) prewarmLogin();
    });
    if (state.demo) {
      els.query.value = "AirPods Pro 2";
      window.setTimeout(() => runSearch("AirPods Pro 2", { demo: true }), 450);
    }
  }

  init();
})();
