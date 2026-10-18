(() => {
  "use strict";

  const PLATFORMS = [
    {
      id: "taobao",
      name: "淘宝",
      short: "淘",
      tagline: "商品搜索",
      color: "#ff5000",
      accent: "#ff5000",
      url: (q) => `https://s.taobao.com/search?q=${encodeURIComponent(q)}`
    },
    {
      id: "jd",
      name: "京东",
      short: "京",
      tagline: "商品搜索",
      color: "#e1251b",
      accent: "#e1251b",
      url: (q) => `https://search.jd.com/Search?keyword=${encodeURIComponent(q)}&enc=utf-8`
    },
    {
      id: "pdd",
      name: "拼多多",
      short: "拼",
      tagline: "商品搜索",
      color: "#e02e24",
      accent: "#e02e24",
      url: (q) => `https://mobile.yangkeduo.com/search_result.html?search_key=${encodeURIComponent(q)}`
    }
  ];

  const STORAGE = {
    records: "price-desk.records.v1",
    recents: "price-desk.recents.v1",
    draft: "price-desk.draft.v1"
  };
  const MAX_RECORDS = 12;
  const MAX_RECENTS = 6;

  const state = {
    query: "",
    prices: {},
    notes: {}
  };

  const els = {
    form: document.getElementById("searchForm"),
    query: document.getElementById("queryInput"),
    recentWrap: document.getElementById("recentWrap"),
    recentChips: document.getElementById("recentChips"),
    grid: document.getElementById("platformGrid"),
    queryLine: document.getElementById("queryLine"),
    clearBtn: document.getElementById("clearBtn"),
    openAllBtn: document.getElementById("openAllBtn"),
    openNextLabel: document.getElementById("openNextLabel"),
    openProgress: document.getElementById("openProgress"),
    resultBody: document.getElementById("resultBody"),
    saveBtn: document.getElementById("saveBtn"),
    copyBtn: document.getElementById("copyBtn"),
    historyList: document.getElementById("historyList"),
    clearHistoryBtn: document.getElementById("clearHistoryBtn"),
    toast: document.getElementById("toast")
  };

  const cards = {};
  let toastTimer = 0;
  let draftTimer = 0;
  let openCursor = 0;
  let openCycleDone = false;

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function parsePrice(raw) {
    const normalized = String(raw ?? "")
      .replace(/[,，\s¥￥元]/g, "")
      .trim();
    if (!normalized || !/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null;
    const value = Number(normalized);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function money(value) {
    return Number(value).toLocaleString("zh-CN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  }

  function formatInputPrice(value) {
    return money(value);
  }

  function platformById(id) {
    return PLATFORMS.find((platform) => platform.id === id);
  }

  function validEntries() {
    return PLATFORMS.map((platform) => {
      const raw = state.prices[platform.id] ?? "";
      const price = parsePrice(raw);
      return { platform, raw, price, note: state.notes[platform.id] ?? "" };
    }).filter((entry) => entry.price !== null);
  }

  function toast(message) {
    window.clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("show");
    toastTimer = window.setTimeout(() => {
      els.toast.classList.remove("show");
    }, 2600);
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // The page still works without persistence.
    }
  }

  function readHashQuery() {
    const match = location.hash.match(/[#&]q=([^&]*)/);
    if (!match) return "";
    try {
      return decodeURIComponent(match[1].replace(/\+/g, " ")).trim();
    } catch {
      return "";
    }
  }

  function setHash(query) {
    try {
      const next = `#q=${encodeURIComponent(query)}`;
      if (location.hash !== next) {
        history.replaceState(null, "", next);
      }
    } catch {
      // file:// in some browsers disallows history updates; not critical.
    }
  }

  function saveDraft() {
    window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(() => {
      try {
        sessionStorage.setItem(STORAGE.draft, JSON.stringify({
          query: state.query,
          prices: state.prices,
          notes: state.notes
        }));
      } catch {
        // Draft persistence is a convenience only.
      }
    }, 180);
  }

  function readDraft() {
    try {
      const raw = sessionStorage.getItem(STORAGE.draft);
      const draft = raw ? JSON.parse(raw) : null;
      if (!draft || typeof draft.query !== "string") return null;
      return {
        query: draft.query.trim(),
        prices: draft.prices && typeof draft.prices === "object" ? draft.prices : {},
        notes: draft.notes && typeof draft.notes === "object" ? draft.notes : {}
      };
    } catch {
      return null;
    }
  }

  function loadRecords() {
    const records = readJson(STORAGE.records, []);
    return Array.isArray(records) ? records : [];
  }

  function loadRecents() {
    const recents = readJson(STORAGE.recents, []);
    return Array.isArray(recents) ? recents.filter((item) => typeof item === "string") : [];
  }

  function addRecent(query) {
    const next = [query, ...loadRecents().filter((item) => item !== query)].slice(0, MAX_RECENTS);
    writeJson(STORAGE.recents, next);
    renderRecents();
  }

  function renderRecents() {
    const recents = loadRecents();
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

  function buildPlatformCards() {
    els.grid.innerHTML = PLATFORMS.map((platform) => `
      <article class="platform-card is-idle" data-id="${platform.id}" style="--brand:${platform.color};--brand-accent:${platform.accent}">
        <div class="platform-head">
          <div class="platform-identity">
            <span class="platform-logo" aria-hidden="true">${platform.short}</span>
            <div>
              <h3>${platform.name}</h3>
              <p>${platform.tagline}</p>
            </div>
          </div>
          <a class="open-link is-disabled" data-role="link" aria-disabled="true" tabindex="-1">
            <span>待搜索</span>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M5 11 11 5M6 5h5v5"></path>
            </svg>
          </a>
        </div>
        <label class="price-field">
          <span class="currency" aria-hidden="true">¥</span>
          <input class="price-input" data-role="price" type="text" inputmode="decimal" placeholder="0.00" aria-label="${platform.name}到手价" autocomplete="off" disabled>
          <span class="unit">到手价</span>
        </label>
        <input class="note-input" data-role="note" type="text" maxlength="48" placeholder="备注店铺 / 券后 / 型号" aria-label="${platform.name}备注" autocomplete="off" disabled>
        ${platform.fallback ? `<p class="card-hint"><a data-role="fallback" href="#" target="_blank" rel="noopener noreferrer" tabindex="-1" hidden>${platform.fallbackLabel}</a></p>` : ""}
        <div class="card-foot">
          <span class="card-status" data-role="status">输入关键词后启用</span>
          <button class="copy-link" data-role="copy" type="button" disabled>复制链接</button>
        </div>
      </article>
    `).join("");

    PLATFORMS.forEach((platform) => {
      const root = els.grid.querySelector(`[data-id="${platform.id}"]`);
      cards[platform.id] = {
        root,
        link: root.querySelector('[data-role="link"]'),
        price: root.querySelector('[data-role="price"]'),
        note: root.querySelector('[data-role="note"]'),
        fallback: root.querySelector('[data-role="fallback"]'),
        status: root.querySelector('[data-role="status"]'),
        copy: root.querySelector('[data-role="copy"]')
      };

      cards[platform.id].price.addEventListener("input", (event) => {
        state.prices[platform.id] = event.target.value;
        saveDraft();
        renderPrices();
      });

      cards[platform.id].price.addEventListener("blur", (event) => {
        const price = parsePrice(event.target.value);
        if (price !== null) {
          event.target.value = formatInputPrice(price);
          state.prices[platform.id] = event.target.value;
          saveDraft();
          renderPrices();
        }
      });

      cards[platform.id].note.addEventListener("input", (event) => {
        state.notes[platform.id] = event.target.value;
        saveDraft();
      });

      cards[platform.id].copy.addEventListener("click", () => {
        if (!state.query) return;
        copyText(platform.url(state.query)).then((ok) => {
          toast(ok ? `${platform.name}搜索链接已复制` : "复制失败，请手动复制地址栏链接");
        });
      });
    });
  }

  function enablePlatformCards() {
    PLATFORMS.forEach((platform) => {
      const card = cards[platform.id];
      const url = platform.url(state.query);

      card.root.classList.remove("is-idle");
      card.price.disabled = false;
      card.note.disabled = false;
      card.copy.disabled = false;

      card.link.href = url;
      card.link.classList.remove("is-disabled");
      card.link.removeAttribute("aria-disabled");
      card.link.tabIndex = 0;
      card.link.querySelector("span").textContent = "打开搜索";

      if (card.fallback) {
        card.fallback.href = platform.fallback(state.query);
        card.fallback.hidden = false;
        card.fallback.tabIndex = 0;
      }
    });
  }

  function resetCardInputs() {
    PLATFORMS.forEach((platform) => {
      const card = cards[platform.id];
      card.price.value = "";
      card.note.value = "";
      card.price.removeAttribute("aria-invalid");
    });
  }

  function renderPrices() {
    const entries = validEntries();
    const minimum = entries.length ? Math.min(...entries.map((entry) => entry.price)) : null;

    PLATFORMS.forEach((platform) => {
      const card = cards[platform.id];
      const raw = state.prices[platform.id] ?? "";
      const price = parsePrice(raw);
      const hasRaw = String(raw).trim().length > 0;

      card.root.classList.toggle("has-price", price !== null);
      card.root.classList.toggle("is-best", price !== null && price === minimum);

      if (!hasRaw) {
        card.status.textContent = state.query ? "等待填写价格" : "输入关键词后启用";
        card.price.removeAttribute("aria-invalid");
      } else if (price === null) {
        card.status.textContent = "请检查价格格式";
        card.price.setAttribute("aria-invalid", "true");
      } else if (price === minimum) {
        card.status.textContent = "当前最低";
        card.price.removeAttribute("aria-invalid");
      } else {
        card.status.textContent = `比最低高 ¥${money(price - minimum)}`;
        card.price.removeAttribute("aria-invalid");
      }
    });

    renderResult(entries, minimum);
    const canUse = Boolean(state.query && entries.length);
    els.saveBtn.disabled = !canUse;
    els.copyBtn.disabled = !canUse;
  }

  function renderResult(entries, minimum) {
    if (!entries.length) {
      els.resultBody.innerHTML = `
        <div class="result-empty">
          <div class="empty-tag" aria-hidden="true"><span>¥</span><strong>—</strong></div>
          <h3>填入价格，差价立刻出现</h3>
          <p>任意填写两个平台，就能看到排序、最低价与最大差价。</p>
        </div>
      `;
      return;
    }

    if (entries.length === 1) {
      const only = entries[0];
      els.resultBody.innerHTML = `
        <div class="single-price">
          <span class="best-label">已记录价格</span>
          <div class="single-line">
            <span class="single-platform" style="--c:${only.platform.color}"><i></i>${only.platform.name}</span>
            <strong>¥ ${money(only.price)}</strong>
          </div>
          <p>再填入一个平台的价格，就能算出最低价与差价。</p>
        </div>
      `;
      return;
    }

    const sorted = [...entries].sort((a, b) => a.price - b.price);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const difference = worst.price - best.price;
    const maxPrice = worst.price;
    const tiedBest = sorted.filter((entry) => entry.price === best.price).length > 1;

    const rows = sorted.map((entry, index) => `
      <li class="rank-item ${entry.price === best.price ? "is-best" : ""}" style="--c:${entry.platform.color}">
        <span class="rank-no">${String(index + 1).padStart(2, "0")}</span>
        <div class="rank-main">
          <div class="rank-name">
            <span class="rank-logo" aria-hidden="true">${entry.platform.short}</span>
            <span>${entry.platform.name}</span>
            ${entry.price === best.price ? `<span class="best-tag">${tiedBest ? "并列最低" : "最低"}</span>` : ""}
            ${entry.note ? `<span class="rank-note">${escapeHtml(entry.note)}</span>` : ""}
          </div>
          <div class="rank-track" aria-hidden="true"><i style="--w:${Math.max(14, (entry.price / maxPrice) * 100).toFixed(1)}%"></i></div>
        </div>
        <div class="rank-price">
          <strong>¥${money(entry.price)}</strong>
          <small>${entry.price === best.price ? "基准价" : `+¥${money(entry.price - best.price)}`}</small>
        </div>
      </li>
    `).join("");

    const savingCopy = difference > 0
      ? `比最高价 <span>${worst.platform.name} ¥${money(worst.price)}</span> 省 <strong>¥${money(difference)}</strong>`
      : "几个平台目前价格一致，可以再对比一下运费与赠品";

    els.resultBody.innerHTML = `
      <div class="best-card">
        <span class="best-label">CURRENT BEST / 当前最低</span>
        <div class="best-line">
          <span class="best-platform">${best.platform.name}</span>
          <span class="best-price">¥ ${money(best.price)}</span>
        </div>
        <div class="save-line">${savingCopy}</div>
      </div>
      <ol class="rank-list">${rows}</ol>
      <p class="result-note">已填写 ${entries.length}/4 个平台 · ${difference > 0 ? `最高与最低相差 <strong>¥${money(difference)}</strong>` : "暂未发现价差"}</p>
    `;
  }

  function applyQuery(query, options = {}) {
    const normalized = String(query).trim();
    const { reset = true, scroll = false, addToRecent = false } = options;
    if (!normalized) return;

    const changed = normalized !== state.query;
    if (changed) {
      if (reset) {
        state.prices = {};
        state.notes = {};
        resetCardInputs();
      }
      resetOpenButton();
    }

    state.query = normalized;
    els.query.value = normalized;
    document.title = `${normalized} · 比价台`;
    els.queryLine.textContent = `正在比较「${normalized}」· 点击卡片右上角打开搜索`;
    enablePlatformCards();

    PLATFORMS.forEach((platform) => {
      const value = state.prices[platform.id];
      cards[platform.id].price.value = value === undefined || value === null
        ? ""
        : (typeof value === "number" ? formatInputPrice(value) : String(value));
      cards[platform.id].note.value = state.notes[platform.id] ?? "";
    });

    renderPrices();
    setHash(normalized);
    saveDraft();
    if (addToRecent) addRecent(normalized);

    if (scroll) {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById("workspace").scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start"
      });
    }
  }

  function submitSearch(event) {
    event.preventDefault();
    const query = els.query.value.trim();
    if (!query) {
      els.form.classList.remove("shake");
      void els.form.offsetWidth;
      els.form.classList.add("shake");
      els.query.focus();
      toast("先输入一个商品名称");
      return;
    }

    const changed = query !== state.query;
    applyQuery(query, { reset: changed, scroll: true, addToRecent: true });
    if (!changed) toast(`继续填写「${query}」的到手价`);
  }

  function resetOpenButton() {
    openCursor = 0;
    openCycleDone = false;
    updateOpenButton();
  }

  function updateOpenButton() {
    if (!state.query) {
      els.openNextLabel.textContent = "逐个打开";
      els.openProgress.textContent = `0/${PLATFORMS.length}`;
      return;
    }
    if (openCycleDone) {
      els.openNextLabel.textContent = "重新开始";
      els.openProgress.textContent = `${PLATFORMS.length}/${PLATFORMS.length}`;
      return;
    }
    if (openCursor === 0) {
      els.openNextLabel.textContent = "逐个打开";
      els.openProgress.textContent = `0/${PLATFORMS.length}`;
      return;
    }
    els.openNextLabel.textContent = `下一个：${PLATFORMS[openCursor].name}`;
    els.openProgress.textContent = `${openCursor}/${PLATFORMS.length}`;
  }

  function openNext() {
    if (!state.query) {
      els.query.focus();
      toast("先输入商品名称，再打开三个平台");
      return;
    }

    if (openCycleDone) {
      openCursor = 0;
      openCycleDone = false;
    }

    const platform = PLATFORMS[openCursor];
    const win = window.open(platform.url(state.query), "_blank");
    if (!win) {
      toast("浏览器拦截了窗口，请允许弹窗，或直接点卡片右上角的「打开搜索」");
      return;
    }
    win.opener = null;

    openCursor += 1;
    openCycleDone = openCursor >= PLATFORMS.length;
    updateOpenButton();

    if (openCycleDone) {
      toast("三个平台都已打开；回来填好价格，再点「保存本次」");
    } else {
      toast(`已打开${platform.name}；看完价格回来，再打开${PLATFORMS[openCursor].name}`);
    }
  }

  function clearPrices() {
    const hasAnything = Object.values(state.prices).some((value) => String(value ?? "").trim());
    if (!hasAnything) {
      toast("还没有填写价格");
      return;
    }
    state.prices = {};
    state.notes = {};
    resetCardInputs();
    renderPrices();
    saveDraft();
    toast("价格已清空，可以重新填写");
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fall through to the legacy copy path.
      }
    }

    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.top = "-1000px";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }

  function summaryText() {
    const entries = validEntries().sort((a, b) => a.price - b.price);
    if (!entries.length) return "";

    const lines = [`【比价台】${state.query}`, ""];
    entries.forEach((entry, index) => {
      const note = entry.note.trim() ? `（${entry.note.trim()}）` : "";
      lines.push(`${index + 1}. ${entry.platform.name}  ¥${money(entry.price)}${note}`);
    });

    if (entries.length > 1) {
      const difference = entries[entries.length - 1].price - entries[0].price;
      lines.push("", difference > 0
        ? `最低比最高省 ¥${money(difference)}`
        : "目前各平台价格一致");
    }

    lines.push("", "价格以各平台结算页为准");
    return lines.join("\n");
  }

  async function copySummary() {
    const text = summaryText();
    if (!text) {
      toast("先填写至少一个价格");
      return;
    }
    const ok = await copyText(text);
    toast(ok ? "比价结果已复制" : "复制失败，请手动选择文字");
  }

  function saveRecord() {
    const entries = validEntries();
    if (!state.query || !entries.length) {
      toast("填写价格后才能保存");
      return;
    }

    const prices = {};
    const notes = {};
    entries.forEach((entry) => {
      prices[entry.platform.id] = entry.price;
      if (entry.note.trim()) notes[entry.platform.id] = entry.note.trim();
    });

    const records = loadRecords();
    const signature = JSON.stringify(prices);
    const duplicateIndex = records.findIndex((record) => record.query === state.query && JSON.stringify(record.prices) === signature);
    if (duplicateIndex >= 0) records.splice(duplicateIndex, 1);

    records.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      query: state.query,
      prices,
      notes,
      savedAt: new Date().toISOString()
    });

    writeJson(STORAGE.records, records.slice(0, MAX_RECORDS));
    renderHistory();
    toast("已保存到本机，下次可以直接载入");
  }

  function formatWhen(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const now = new Date();
    const time = date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    if (date.toDateString() === now.toDateString()) return `今天 ${time}`;

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return `昨天 ${time}`;
    return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
  }

  function recordSummary(record) {
    const entries = PLATFORMS
      .map((platform) => ({
        platform,
        price: parsePrice(record.prices?.[platform.id])
      }))
      .filter((entry) => entry.price !== null)
      .sort((a, b) => a.price - b.price);

    if (!entries.length) return { html: "暂无价格", name: "", color: "#858075" };
    const best = entries[0];
    const worst = entries[entries.length - 1];
    const difference = worst.price - best.price;
    const tail = entries.length > 1 && difference > 0 ? ` · 省 ¥${money(difference)}` : "";
    return {
      html: `${escapeHtml(best.platform.name)} ¥${money(best.price)}${tail}`,
      name: best.platform.name,
      color: best.platform.color
    };
  }

  function renderHistory() {
    const records = loadRecords();
    els.clearHistoryBtn.disabled = records.length === 0;

    if (!records.length) {
      els.historyList.innerHTML = `
        <div class="history-empty">
          <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="16" cy="17" r="9"></circle>
            <path d="M16 12v5l3 2M12 5h8M16 5v3"></path>
          </svg>
          <h3>还没有比价单</h3>
          <p>填好价格后点「保存本次」，下次回来可以直接载入。</p>
        </div>
      `;
      return;
    }

    els.historyList.innerHTML = `
      <div class="history-list">
        ${records.map((record) => {
          const summary = recordSummary(record);
          return `
            <article class="history-item">
              <div class="history-info">
                <p class="history-query" title="${escapeHtml(record.query)}">${escapeHtml(record.query)}</p>
                <p class="history-meta">
                  <i style="--c:${summary.color}"></i>
                  ${summary.html}
                  <span class="meta-sep">·</span>
                  ${escapeHtml(formatWhen(record.savedAt))}
                </p>
              </div>
              <button class="load-btn" type="button" data-load="${escapeHtml(record.id)}">
                载入
                <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M2 6h8M7 3l3 3-3 3"></path>
                </svg>
              </button>
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  function loadRecord(id) {
    const record = loadRecords().find((item) => item.id === id);
    if (!record) return;

    const prices = {};
    const notes = {};
    PLATFORMS.forEach((platform) => {
      const price = parsePrice(record.prices?.[platform.id]);
      if (price !== null) prices[platform.id] = price;
      if (record.notes?.[platform.id]) notes[platform.id] = record.notes[platform.id];
    });

    state.prices = prices;
    state.notes = notes;
    els.query.value = record.query;
    applyQuery(record.query, { reset: false, scroll: true });
    toast("已载入这条比价记录");
  }

  function clearHistory() {
    const records = loadRecords();
    if (!records.length) return;
    if (!window.confirm(`确定清空 ${records.length} 条比价记录吗？清空后无法恢复。`)) return;
    try {
      localStorage.removeItem(STORAGE.records);
    } catch {
      // Ignore storage failures.
    }
    renderHistory();
    toast("比价记录已清空");
  }

  function bindEvents() {
    els.form.addEventListener("submit", submitSearch);
    els.openAllBtn.addEventListener("click", openNext);
    els.clearBtn.addEventListener("click", clearPrices);
    els.saveBtn.addEventListener("click", saveRecord);
    els.copyBtn.addEventListener("click", copySummary);
    els.clearHistoryBtn.addEventListener("click", clearHistory);

    els.recentChips.addEventListener("click", (event) => {
      const button = event.target.closest("[data-recent]");
      if (!button) return;
      const query = loadRecents()[Number(button.dataset.recent)];
      if (!query) return;
      els.query.value = query;
      applyQuery(query, { reset: query !== state.query, scroll: true, addToRecent: true });
    });

    els.historyList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-load]");
      if (button) loadRecord(button.dataset.load);
    });

    document.addEventListener("keydown", (event) => {
      const target = event.target;
      const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable;

      if (event.key === "/" && !isTyping && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        els.query.focus();
        return;
      }

      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        openNext();
      }
    });

    window.addEventListener("hashchange", () => {
      const query = readHashQuery();
      if (query && query !== state.query) {
        els.query.value = query;
        applyQuery(query, { reset: true, scroll: false });
      }
    });
  }

  function init() {
    buildPlatformCards();
    bindEvents();
    renderRecents();
    renderHistory();
    renderPrices();
    updateOpenButton();

    const hashQuery = readHashQuery();
    const draft = readDraft();

    if (hashQuery) {
      els.query.value = hashQuery;
      if (draft && draft.query === hashQuery) {
        state.prices = draft.prices;
        state.notes = draft.notes;
        applyQuery(hashQuery, { reset: false, scroll: false, addToRecent: true });
      } else {
        applyQuery(hashQuery, { reset: true, scroll: false, addToRecent: true });
      }
    } else if (draft && draft.query) {
      state.prices = draft.prices;
      state.notes = draft.notes;
      els.query.value = draft.query;
      applyQuery(draft.query, { reset: false, scroll: false });
    }
  }

  init();
})();
