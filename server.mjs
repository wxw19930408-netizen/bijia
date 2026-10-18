import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const HEADLESS = process.env.HEADLESS === "1";
const FORCE_DEMO = process.env.DEMO === "1";
const PROFILE_DIR = path.join(ROOT, ".chrome-profile");
const SEARCH_TIMEOUT = Number(process.env.SEARCH_TIMEOUT || 24000);
const CACHE_TTL = 3 * 60 * 1000;

const PLATFORMS = [
  {
    id: "taobao",
    name: "淘宝",
    short: "淘",
    color: "#ff5000",
    tagline: "搜索页抓取",
    loginUrl: "https://login.taobao.com/member/login.jhtml",
    searchUrl: (query) => `https://s.taobao.com/search?q=${encodeURIComponent(query)}`,
    mobile: false,
    cardSelectors: [
      'div[class*="Card--doubleCardWrapper"]',
      'div[class*="Content--contentWrap"]',
      'div[class*="Card--"]'
    ],
    titleSelectors: ['[class*="Title--title"]', '[class*="title"]', ".row-2"],
    priceSelectors: ['[class*="Price--priceText"]', '[class*="price"]', ".price"],
    shopSelectors: ['[class*="ShopInfo--shopName"]', '[class*="shopName"]', '[class*="shop"]'],
    salesSelectors: ['[class*="realSales"]', '[class*="sales"]'],
    linkSelectors: [
      'a[href*="item.taobao.com"]',
      'a[href*="detail.tmall.com"]',
      'a[href*="item.tmall.com"]'
    ],
    linkPattern: "item\\.taobao\\.com|detail\\.tmall\\.com|item\\.tmall\\.com",
    loginMarkers: ["亲，请登录", "请登录", "免费注册"],
    verifyMarkers: ["呀，不知道哪里出了问题", "安全验证", "滑块", "验证码"]
  },
  {
    id: "jd",
    name: "京东",
    short: "京",
    color: "#e1251b",
    tagline: "搜索页抓取",
    loginUrl: "https://passport.jd.com/new/login.aspx",
    searchUrl: (query) => `https://search.jd.com/Search?keyword=${encodeURIComponent(query)}&enc=utf-8`,
    mobile: false,
    cardSelectors: [
      ".plugin_goodsCardWrapper",
      "#J_goodsList .gl-item",
      ".gl-item",
      "li[data-sku]"
    ],
    titleSelectors: [
      "span[title]",
      '[class*="_goods_title"] span',
      ".p-name em",
      ".p-name",
      '[class*="p-name"]'
    ],
    priceSelectors: ['[class*="_price_"]', ".p-price i", ".p-price", '[class*="p-price"]'],
    shopSelectors: ['[class*="_shop"]', ".p-shop a", ".p-shop", '[class*="p-shop"]'],
    salesSelectors: ['[class*="_sales"]', ".p-commit strong", ".p-commit", '[class*="p-commit"]'],
    linkSelectors: [".p-name a", 'a[href*="item.jd.com"]'],
    linkPattern: "item\\.jd\\.com|item\\.m\\.jd\\.com|item\\.jd\\.hk",
    skuAttribute: "data-sku",
    linkTemplate: "https://item.jd.com/{sku}.html",
    priceAnchorFallback: true,
    loginMarkers: ["欢迎登录", "扫码登录", "密码登录", "短信登录"],
    verifyMarkers: ["京东验证", "安全验证", "验证码", "risk_handler"]
  },
  {
    id: "pdd",
    name: "拼多多",
    short: "拼",
    color: "#e02e24",
    tagline: "移动搜索页抓取",
    loginUrl: "https://mobile.yangkeduo.com/login.html",
    searchUrl: (query) => `https://mobile.yangkeduo.com/search_result.html?search_key=${encodeURIComponent(query)}`,
    mobile: true,
    cardSelectors: [
      'div[class*="_3glhOBhU"]',
      'div[class*="_2Wah34Ix"] > div',
      'a[href*="goods.html"]',
      'div[class*="goods-item"]',
      'div[class*="goodsItem"]',
      'div[class*="goods"]'
    ],
    titleSelectors: [
      'div[class*="goods-name"]',
      'div[class*="goodsName"]',
      'span[class*="goods-name"]',
      ".goods-name"
    ],
    priceSelectors: ['span[class*="price"]', 'div[class*="price"]', ".price"],
    shopSelectors: ['div[class*="mall"]', 'span[class*="mall"]', '[class*="shop"]'],
    salesSelectors: ['span[class*="sales"]', 'div[class*="sales"]'],
    linkSelectors: ['a[href*="goods.html"]'],
    linkPattern: "goods\\.html",
    priceAnchorFallback: true,
    loginMarkers: ["手机号登录", "微信登录", "登录", "拼多多登录"],
    verifyMarkers: ["安全验证", "滑块", "验证码"]
  }
];

const demoItems = {
  taobao: [
    {
      title: "Apple AirPods Pro 2 主动降噪无线蓝牙耳机 国行",
      price: 1499,
      shop: "Apple 官方旗舰店",
      sales: "1万+人付款",
      link: "https://s.taobao.com/search?q=AirPods%20Pro%202"
    },
    {
      title: "AirPods Pro 2 全新未拆封 国行正品 顺丰包邮",
      price: 1399,
      shop: "数码优选店",
      sales: "3000+人付款",
      link: "https://s.taobao.com/search?q=AirPods%20Pro%202"
    }
  ],
  jd: [
    {
      title: "Apple AirPods Pro 2 USB-C 接口 主动降噪耳机",
      price: 1399,
      shop: "Apple 产品京东自营旗舰店",
      sales: "10万+条评价",
      link: "https://search.jd.com/Search?keyword=AirPods%20Pro%202"
    },
    {
      title: "AirPods Pro 2 无线降噪耳机 国行 京东自营",
      price: 1449,
      shop: "京东自营",
      sales: "5万+条评价",
      link: "https://search.jd.com/Search?keyword=AirPods%20Pro%202"
    }
  ],
  pdd: [
    {
      title: "Apple AirPods Pro 2 降噪耳机 国行正品 百亿补贴",
      price: 1299,
      shop: "Apple 品牌专区",
      sales: "10万+件已拼",
      link: "https://mobile.yangkeduo.com/search_result.html?search_key=AirPods%20Pro%202"
    },
    {
      title: "AirPods Pro 2 无线蓝牙耳机 全新未拆封",
      price: 1268,
      shop: "数码专营店",
      sales: "2万+件已拼",
      link: "https://mobile.yangkeduo.com/search_result.html?search_key=AirPods%20Pro%202"
    }
  ]
};

const STATIC_FILES = new Map([
  ["/", "auto.html"],
  ["/auto", "auto.html"],
  ["/auto.html", "auto.html"],
  ["/manual", "index.html"],
  ["/manual.html", "index.html"],
  ["/index.html", "index.html"],
  ["/styles.css", "styles.css"],
  ["/auto.css", "auto.css"],
  ["/auto.js", "auto.js"],
  ["/app.js", "app.js"]
]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

const searchCache = new Map();
let activeSearch = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeForMatch(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function bigrams(value) {
  const text = normalizeForMatch(value);
  const result = new Set();
  if (text.length < 2) {
    if (text) result.add(text);
    return result;
  }
  for (let index = 0; index < text.length - 1; index += 1) {
    result.add(text.slice(index, index + 2));
  }
  return result;
}

function matchScore(query, title) {
  const q = normalizeForMatch(query);
  const t = normalizeForMatch(title);
  if (!q || !t) return 0;
  if (t.includes(q)) return 1;

  const qSet = bigrams(q);
  const tSet = bigrams(t);
  let intersection = 0;
  for (const token of qSet) {
    if (tSet.has(token)) intersection += 1;
  }
  const bigramScore = intersection / Math.max(1, qSet.size);

  const words = String(query)
    .toLowerCase()
    .split(/[\s,，/|+]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 1);
  const hitWords = words.filter((word) => t.includes(normalizeForMatch(word))).length;
  const wordScore = words.length ? hitWords / words.length : 0;

  return Math.min(1, bigramScore * 0.72 + wordScore * 0.28);
}

function rankItems(items, query) {
  const seen = new Set();
  const ranked = [...items]
    .filter((item) => item && item.title && Number(item.price) > 0)
    .map((item) => ({
      ...item,
      title: normalizeText(item.title).slice(0, 160),
      shop: normalizeText(item.shop).slice(0, 80),
      sales: normalizeText(item.sales).slice(0, 60),
      matchScore: Number(matchScore(query, item.title).toFixed(3))
    }))
    .filter((item) => {
      const key = `${item.link.split("#")[0]}|${item.title.slice(0, 48)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.matchScore - a.matchScore || a.price - b.price)
    .slice(0, 40);
  return ranked.sort((a, b) => a.price - b.price || b.matchScore - a.matchScore);
}

function bestMatch(items) {
  return [...items]
    .sort((a, b) => b.matchScore - a.matchScore || a.price - b.price)[0] || null;
}

function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ].filter(Boolean);

  return candidates.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch {
      return false;
    }
  }) || null;
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

class MiniWebSocket {
  constructor(url) {
    this.url = new URL(url);
    this.buffer = Buffer.alloc(0);
    this.fragments = [];
    this.handshaken = false;
    this.closed = false;
    this.onmessage = null;
    this.onclose = null;
    this.ready = new Promise((resolve, reject) => {
      this.resolveHandshake = resolve;
      this.rejectHandshake = reject;
      this.socket = net.connect(Number(this.url.port), this.url.hostname, () => {
        const key = crypto.randomBytes(16).toString("base64");
        this.socket.write(
          `GET ${this.url.pathname}${this.url.search} HTTP/1.1\r\n` +
          `Host: ${this.url.host}\r\n` +
          "Upgrade: websocket\r\n" +
          "Connection: Upgrade\r\n" +
          `Sec-WebSocket-Key: ${key}\r\n` +
          "Sec-WebSocket-Version: 13\r\n\r\n"
        );
      });
      this.socket.on("data", (chunk) => this.handleData(chunk));
      this.socket.on("error", (error) => {
        this.closed = true;
        this.rejectHandshake?.(error);
        this.onclose?.(error);
      });
      this.socket.on("close", () => {
        this.closed = true;
        this.rejectHandshake?.(new Error("WebSocket closed"));
        this.onclose?.();
      });
    });
  }

  handleData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    if (!this.handshaken) {
      const headerEnd = this.buffer.indexOf(Buffer.from("\r\n\r\n"));
      if (headerEnd < 0) return;
      const header = this.buffer.subarray(0, headerEnd).toString("utf8");
      this.buffer = this.buffer.subarray(headerEnd + 4);
      if (!/^HTTP\/1\.1 101/m.test(header)) {
        this.rejectHandshake?.(new Error(`WebSocket handshake failed: ${header.slice(0, 160)}`));
        this.socket.destroy();
        return;
      }
      this.handshaken = true;
      this.resolveHandshake?.();
      this.resolveHandshake = null;
      this.rejectHandshake = null;
    }

    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let length = second & 0x7f;
      let offset = 2;

      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        length = Number(this.buffer.readBigUInt64BE(2));
        offset = 10;
      }

      let maskKey = null;
      if (masked) {
        if (this.buffer.length < offset + 4) return;
        maskKey = this.buffer.subarray(offset, offset + 4);
        offset += 4;
      }
      if (this.buffer.length < offset + length) return;

      let payload = Buffer.from(this.buffer.subarray(offset, offset + length));
      this.buffer = this.buffer.subarray(offset + length);
      if (maskKey) {
        for (let index = 0; index < payload.length; index += 1) {
          payload[index] ^= maskKey[index % 4];
        }
      }

      if (opcode === 0x9) {
        this.sendFrame(0xa, payload);
        continue;
      }
      if (opcode === 0x8) {
        this.socket.end();
        return;
      }
      if (opcode === 0x1 || opcode === 0x2) {
        if (first & 0x80) {
          this.deliver(payload.toString("utf8"));
        } else {
          this.fragments = [payload];
        }
      } else if (opcode === 0x0) {
        this.fragments.push(payload);
        if (first & 0x80) {
          this.deliver(Buffer.concat(this.fragments).toString("utf8"));
          this.fragments = [];
        }
      }
    }
  }

  deliver(text) {
    this.onmessage?.({ data: text });
  }

  sendFrame(opcode, payload) {
    if (this.closed) throw new Error("WebSocket is closed");
    const mask = crypto.randomBytes(4);
    let header;
    if (payload.length < 126) {
      header = Buffer.from([0x80 | opcode, 0x80 | payload.length]);
    } else if (payload.length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(payload.length), 2);
    }
    const masked = Buffer.alloc(payload.length);
    for (let index = 0; index < payload.length; index += 1) {
      masked[index] = payload[index] ^ mask[index % 4];
    }
    this.socket.write(Buffer.concat([header, mask, masked]));
  }

  send(text) {
    this.sendFrame(0x1, Buffer.from(text));
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try {
      this.sendFrame(0x8, Buffer.alloc(0));
    } catch {
      // Ignore socket errors while closing.
    }
    this.socket.end();
  }
}

class CdpConnection {
  constructor(url) {
    this.ws = new MiniWebSocket(url);
    this.sequence = 0;
    this.pending = new Map();
    this.closed = false;
    this.ws.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!message.id) return;
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      clearTimeout(waiter.timer);
      if (message.error) {
        waiter.reject(new Error(`${waiter.method}: ${message.error.message || "CDP error"}`));
      } else {
        waiter.resolve(message.result);
      }
    };
    this.ws.onclose = () => {
      this.closed = true;
      for (const waiter of this.pending.values()) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error("Browser connection closed"));
      }
      this.pending.clear();
    };
  }

  async send(method, params = {}, sessionId, timeout = 30000) {
    await this.ws.ready;
    if (this.closed) throw new Error("Browser connection closed");
    const id = ++this.sequence;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${timeout}ms`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer, method });
    });
  }

  close() {
    this.closed = true;
    this.ws.close();
  }
}

class BrowserManager {
  constructor() {
    this.process = null;
    this.cdp = null;
    this.port = null;
    this.version = null;
    this.launching = null;
    this.stderr = "";
    this.sessions = new Map();
    this.loginTabs = new Set();
    this.loginMeta = new Map();
    this.prewarming = null;
    this.diagnosticTabs = new Set();
  }

  async ensure() {
    if (this.cdp && !this.cdp.closed) {
      return;
    }
    if (!this.launching) {
      this.launching = this.launch().finally(() => {
        this.launching = null;
      });
    }
    await this.launching;
  }

  async launch() {
    const chrome = findChromeExecutable();
    if (!chrome) {
      throw new Error("没有找到 Chrome 或 Edge，请安装 Chrome 后重试");
    }

    await fsp.mkdir(PROFILE_DIR, { recursive: true });
    const port = await getFreePort();
    const args = [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${PROFILE_DIR}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--disable-features=Translate,OptimizationHints",
      "--window-size=1280,900",
      "--lang=zh-CN",
      // This local tool runs inside a restricted desktop session where Chrome's
      // GPU process and sandbox can fail before the login window appears.
      "--disable-gpu",
      "--no-sandbox"
    ];
    if (HEADLESS) {
      args.push(
        "--headless=new",
        "--disable-software-rasterizer",
        "--disable-dev-shm-usage"
      );
    }
    args.push("about:blank");

    const child = spawn(chrome, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: false
    });
    this.process = child;
    this.port = port;
    this.stderr = "";

    child.stderr.on("data", (chunk) => {
      this.stderr = (this.stderr + chunk.toString()).slice(-6000);
    });
    child.on("exit", () => {
      if (this.process === child) {
        this.cdp = null;
        this.process = null;
        this.port = null;
      }
    });

    const deadline = Date.now() + 20000;
    let version = null;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(`Chrome 启动失败：${this.stderr.slice(-600)}`);
      }
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
          signal: AbortSignal.timeout(1200)
        });
        if (response.ok) {
          version = await response.json();
          break;
        }
      } catch {
        await sleep(350);
      }
    }

    if (!version?.webSocketDebuggerUrl) {
      try {
        child.kill();
      } catch {
        // Ignore.
      }
      throw new Error(`Chrome 调试端口未就绪。请关闭旧的抓取窗口后重试。${this.stderr.slice(-300)}`);
    }

    this.cdp = new CdpConnection(version.webSocketDebuggerUrl);
    this.version = await this.cdp.send("Browser.getVersion");
  }

  async openTab(url, { mobile = false, activate = false } = {}) {
    await this.ensure();
    const { targetId } = await this.cdp.send("Target.createTarget", { url });
    const { sessionId } = await this.cdp.send("Target.attachToTarget", {
      targetId,
      flatten: true
    });
    this.sessions.set(targetId, sessionId);

    await this.cdp.send("Page.enable", {}, sessionId);
    await this.cdp.send("Runtime.enable", {}, sessionId);
    if (mobile) {
      await this.cdp.send("Emulation.setDeviceMetricsOverride", {
        width: 390,
        height: 844,
        deviceScaleFactor: 2,
        mobile: true
      }, sessionId);
    }
    await sleep(250);
    if (activate) {
      await this.activate(targetId);
    }
    return { targetId, sessionId };
  }

  async activate(targetId) {
    if (!this.cdp) return;
    try {
      const { windowId } = await this.cdp.send("Browser.getWindowForTarget", { targetId });
      await this.cdp.send("Browser.setWindowBounds", {
        windowId,
        bounds: { windowState: "normal" }
      });
    } catch {
      // Window bounds are best effort.
    }
    await this.cdp.send("Target.activateTarget", { targetId });
  }

  async closeTab(targetId) {
    if (!targetId || !this.cdp) return;
    try {
      await this.cdp.send("Target.closeTarget", { targetId });
    } catch {
      // The tab may already be closed.
    }
    this.sessions.delete(targetId);
    this.diagnosticTabs.delete(targetId);
    this.loginTabs.delete(targetId);
    this.loginMeta.delete(targetId);
  }

  async openLoginTabs(platformId = null) {
    await this.ensure();
    if (this.prewarming) {
      try {
        await this.prewarming;
      } catch {
        // Prewarm is best effort.
      }
    }
    const selected = platformId
      ? PLATFORMS.filter((platform) => platform.id === platformId)
      : PLATFORMS;
    if (!selected.length) {
      throw new Error("未知的登录平台");
    }

    if (platformId) {
      const platform = selected[0];
      const existing = [...this.loginTabs]
        .find((targetId) => this.loginMeta.get(targetId)?.id === platform.id);
      if (existing && this.sessions.has(existing)) {
        return [{
          id: platform.id,
          name: platform.name,
          targetId: existing,
          url: platform.loginUrl
        }];
      }
    }

    for (const targetId of [...this.loginTabs]) {
      await this.closeTab(targetId);
    }

    const tabs = [];
    for (const platform of selected) {
      const tab = await this.openTab(platform.loginUrl, {
        mobile: platform.mobile,
        activate: false
      });
      this.loginTabs.add(tab.targetId);
      this.loginMeta.set(tab.targetId, { id: platform.id, name: platform.name });
      tabs.push({
        id: platform.id,
        name: platform.name,
        targetId: tab.targetId,
        url: platform.loginUrl
      });
    }
    if (tabs[0]) await this.activate(tabs[0].targetId);
    return tabs;
  }

  async prewarm() {
    if (this.prewarming) return this.prewarming;
    this.prewarming = this.prewarmOnce().finally(() => {
      this.prewarming = null;
    });
    return this.prewarming;
  }

  async prewarmOnce() {
    await this.ensure();
    const platform = PLATFORMS[0];
    const existing = [...this.loginTabs]
      .find((targetId) => this.loginMeta.get(targetId)?.id === platform.id);
    if (existing) {
      return {
        id: platform.id,
        name: platform.name,
        targetId: existing,
        url: platform.loginUrl
      };
    }

    const tab = await this.openTab(platform.loginUrl, {
      mobile: platform.mobile,
      activate: false
    });
    this.loginTabs.add(tab.targetId);
    this.loginMeta.set(tab.targetId, { id: platform.id, name: platform.name });
    return {
      id: platform.id,
      name: platform.name,
      targetId: tab.targetId,
      url: platform.loginUrl
    };
  }

  async closeDiagnosticTabs() {
    for (const targetId of [...this.diagnosticTabs]) {
      await this.closeTab(targetId);
    }
    this.diagnosticTabs.clear();
  }

  async close() {
    const child = this.process;
    if (this.cdp) {
      try {
        await this.cdp.send("Browser.close", {}, undefined, 3000);
      } catch {
        // Ignore.
      }
      this.cdp.close();
      this.cdp = null;
    }
    if (child) {
      // Give Chrome time to flush cookies and local storage to the profile.
      // Killing it immediately can make the next launch look logged out.
      if (child.exitCode === null) {
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 5000);
          child.once("exit", () => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
      if (child.exitCode === null) {
        try {
          child.kill();
        } catch {
          // Ignore.
        }
        await sleep(800);
      }
      if (this.process === child) this.process = null;
    }
    if (this.process) {
      try {
        this.process.kill();
      } catch {
        // Ignore.
      }
      this.process = null;
    }
    this.port = null;
    this.sessions.clear();
    this.loginTabs.clear();
    this.loginMeta.clear();
    this.prewarming = null;
    this.diagnosticTabs.clear();
  }

  status() {
    return {
      running: Boolean(this.cdp && !this.cdp.closed),
      headless: HEADLESS,
      port: this.port,
      version: this.version?.product || null,
      chrome: findChromeExecutable()
    };
  }
}

const browser = new BrowserManager();

async function evaluate(sessionId, expression, timeout = 12000) {
  if (!browser.cdp) throw new Error("Browser is not connected");
  const result = await browser.cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: false
  }, sessionId, timeout);
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ||
      result.exceptionDetails.text ||
      "Page evaluation failed"
    );
  }
  return result.result?.value;
}

function extractionExpression(platform) {
  const config = {
    cardSelectors: platform.cardSelectors,
    titleSelectors: platform.titleSelectors,
    priceSelectors: platform.priceSelectors,
    shopSelectors: platform.shopSelectors,
    salesSelectors: platform.salesSelectors,
    linkSelectors: platform.linkSelectors,
    linkPattern: platform.linkPattern,
    skuAttribute: platform.skuAttribute || "",
    linkTemplate: platform.linkTemplate || "",
    priceAnchorFallback: Boolean(platform.priceAnchorFallback),
    limit: 40
  };
  return `(() => {
    const cfg = ${JSON.stringify(config)};
    const linkRe = new RegExp(cfg.linkPattern, "i");
    const norm = (value) => String(value || "").replace(/\\s+/g, " ").trim();
    const textOf = (root, selectors) => {
      for (const selector of selectors) {
        try {
          const element = root.querySelector(selector);
          const text = norm(element?.innerText || element?.textContent);
          if (text) return text;
        } catch {}
      }
      return "";
    };
    const numberFrom = (value) => {
      const parsed = Number(String(value || "").replace(/,/g, ""));
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    };
    const parsePrice = (value, allowBare = false, aggressive = false) => {
      let text = norm(value);
      if (!text) return null;
      // Masked digits (1xxxx / 1????) count as zero for numeric ordering,
      // while the original string is kept separately for display.
      text = text.replace(/[xX?？]/g, "0");
      text = text.replace(/([,.])\s+(?=\\d)/g, "$1");
      // Reattach split integer groups such as "¥ 1 299" or "¥ 3 799".
      text = text.replace(/[¥￥]\\s*(\\d{1,3})(?:\\s+(\\d{2,3}))?/g, (match, first, second) => "¥" + first + (second || ""));
      const wanMatch = text.match(/[¥￥]\\s*(\\d+(?:\\.\\d+)?)\\s*万/);
      if (wanMatch) {
        const wanValue = Number(wanMatch[1]) * 10000;
        if (Number.isFinite(wanValue) && wanValue > 0) return wanValue;
      }
      const candidates = [...text.matchAll(/[¥￥]\\s*([0-9][0-9,.]*)/g)]
        .map((match) => numberFrom(match[1].replace(/[,.]$/, "")))
        .filter((number) => number && number < 1000000);
      if (candidates.length) {
        return candidates.find((number) => number >= 10) ?? candidates[0];
      }
      if (allowBare && /^[0-9][0-9,.]*$/.test(text)) {
        const parsed = numberFrom(text.replace(/[,.]$/, ""));
        if (parsed && parsed < 1000000) return parsed;
      }
      return null;
    };

    const nodes = [];
    for (const selector of cfg.cardSelectors) {
      try {
        document.querySelectorAll(selector).forEach((node) => nodes.push(node));
      } catch {}
    }

    for (const anchor of document.querySelectorAll("a[href]")) {
      const href = anchor.href || "";
      if (!linkRe.test(href)) continue;
      let card = anchor;
      let text = norm(card.innerText);
      for (let depth = 0; depth < 4 && text.length < 18; depth += 1) {
        if (!card.parentElement) break;
        card = card.parentElement;
        text = norm(card.innerText);
      }
      if (text.length >= 12 && text.length <= 2200) nodes.push(card);
      if (nodes.length > 420) break;
    }

    if (cfg.priceAnchorFallback) {
      const priceNodes = [...document.querySelectorAll("span, div")]
        .filter((element) => {
          const text = norm(element.innerText || element.textContent);
          return /^[¥￥]/.test(text) && text.length <= 60;
        })
        .slice(0, 100);
      for (const priceNode of priceNodes) {
        let card = priceNode;
        let text = norm(card.innerText || card.textContent);
        for (let depth = 0; depth < 7 && card.parentElement; depth += 1) {
          if (text.length >= 35 && text.length <= 1000) break;
          card = card.parentElement;
          text = norm(card.innerText || card.textContent);
        }
        if (text.length >= 20 && text.length <= 1000) nodes.push(card);
      }
      if (nodes.length > 420) nodes.length = 420;
    }

    const seenNodes = new Set();
    const seenItems = new Set();
    const items = [];
    for (const node of nodes) {
      let card = node;
      let cardText = norm(card?.innerText || card?.textContent);
      for (let depth = 0; depth < 3 && cardText.length < 12 && card?.parentElement; depth += 1) {
        card = card.parentElement;
        cardText = norm(card.innerText || card.textContent);
      }
      if (!card || seenNodes.has(card)) continue;
      seenNodes.add(card);
      if (cardText.length < 8 || cardText.length > 2600) continue;

      let linkElement = card.matches?.("a[href]")
        ? card
        : card.querySelector(cfg.linkSelectors.join(","));
      if (!linkElement) {
        linkElement = [...card.querySelectorAll("a[href]")].find((anchor) => linkRe.test(anchor.href));
      }

      let title = textOf(card, cfg.titleSelectors);
      if (!title && linkElement) {
        title = norm(
          linkElement.getAttribute("title") ||
          linkElement.getAttribute("aria-label") ||
          linkElement.innerText ||
          linkElement.textContent
        );
      }
      if (!title) {
        const image = card.querySelector("img[alt]");
        title = norm(image?.alt);
      }
      if (!title) {
        const beforePrice = cardText.split(/[¥￥]/)[0];
        const cleanedCard = beforePrice
          .replace(/[\uE000-\uF8FF]/g, " ")
          .replace(/(?:仅剩|剩余)\s*\d+\s*件/g, " ")
          .replace(/即将恢复原价|已抢[\d.万+]+件|已拼[\d.万+]+件|本店已拼[\d.万+]+/g, " ")
          .replace(/[¥￥]\\s*[0-9][0-9,.]*/g, " ")
          .replace(/\\d+(?:\\.\\d+)?万?\\+?\\s*(?:人付款|人已买|件已拼|条评价)/g, " ")
          .replace(/\\s+/g, " ")
          .trim();
        if (cleanedCard.length >= 4 && cleanedCard.length <= 110) title = cleanedCard;
      }
      title = title
        .replace(/[\uE000-\uF8FF]/g, " ")
        .replace(/(?:仅剩|剩余)\s*\d+\s*件/g, " ")
        .replace(/即将恢复原价|已抢[\d.万+]+件|已拼[\d.万+]+件|本店已拼[\d.万+]+/g, " ")
        .replace(/[¥￥]\\s*[0-9][0-9,.]*/g, " ")
        .replace(/\\d+(?:\\.\\d+)?万?\\+?\\s*(?:人付款|人已买|件已拼|条评价)/g, " ")
        .replace(/\\s+/g, " ")
        .trim();
      if (!title || title.length < 3) continue;

      const priceText = textOf(card, cfg.priceSelectors);
      let price = parsePrice(priceText, true, true) || parsePrice(cardText, false);
      if (!price || price < 10) {
        const fullTextPrice = parsePrice(cardText, false);
        if (fullTextPrice && (!price || fullTextPrice > price)) {
          price = fullTextPrice;
        }
      }
      if (!price) continue;

      let link = linkElement?.href || "";
      if (!link && cfg.skuAttribute && cfg.linkTemplate) {
        const skuSelector = "[" + cfg.skuAttribute + "]";
        const skuNode = card.closest(skuSelector) ||
          card.querySelector(skuSelector) ||
          card;
        const sku = skuNode.getAttribute?.(cfg.skuAttribute);
        if (sku) link = cfg.linkTemplate.replace("{sku}", encodeURIComponent(sku));
      }
      if (!link || link.startsWith("javascript:")) {
        const anchor = [...card.querySelectorAll("a[href]")].find((item) => linkRe.test(item.href));
        link = anchor?.href || location.href;
      }

      const image = card.querySelector("img");
      let imageUrl = image?.currentSrc || image?.src || "";
      if (!/^https?:/i.test(imageUrl)) imageUrl = "";

      const key = link.split("#")[0] + "|" + title.slice(0, 48).toLowerCase();
      if (seenItems.has(key)) continue;
      seenItems.add(key);

      const salesText = textOf(card, cfg.salesSelectors) ||
        (cardText.match(/(?:已售|已拼|已抢|本店已拼)[^ ]{0,16}/) || [""])[0];
      const placeholderMatch = /[xX?？]/.test(priceText)
        ? priceText.match(/[¥￥]?\\s*[0-9][0-9,.\\s]*[xX?？][0-9xX?？,.\\s]*/)
        : (/[xX?？]/.test(cardText)
          ? cardText.match(/[¥￥]\\s*[0-9][0-9,.\\s]*[xX?？][0-9xX?？,.\\s]*/)
          : null);
      const priceDisplay = placeholderMatch
        ? placeholderMatch[0].replace(/\\s+/g, " ").replace(/^[¥￥]\\s+/, "¥").trim().slice(0, 40)
        : "";
      items.push({
        title: title.slice(0, 170),
        price,
        priceDisplay,
        shop: textOf(card, cfg.shopSelectors).slice(0, 90),
        sales: salesText.slice(0, 70),
        link,
        image: imageUrl.slice(0, 500)
      });
      if (items.length >= cfg.limit) break;
    }

    return {
      items,
      url: location.href,
      title: document.title,
      ready: document.readyState,
      text: norm(document.body?.innerText).slice(0, 7000)
    };
  })()`;
}

async function extractPage(sessionId, platform) {
  try {
    return await evaluate(sessionId, extractionExpression(platform), 12000);
  } catch (error) {
    return {
      items: [],
      url: "",
      title: "",
      ready: "unknown",
      text: "",
      error: error.message
    };
  }
}

async function probePage(sessionId) {
  try {
    return await evaluate(sessionId, `(() => ({
      url: location.href,
      title: document.title,
      ready: document.readyState,
      text: String(document.body?.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 5000),
      anchors: document.querySelectorAll("a[href]").length
    }))()`, 8000);
  } catch (error) {
    return {
      url: "",
      title: "",
      ready: "unknown",
      text: "",
      anchors: 0,
      error: error.message
    };
  }
}

async function findQrClip(sessionId) {
  try {
    return await evaluate(sessionId, `(() => {
      const candidates = [];
      const add = (element, bonus = 0) => {
        if (!element) return;
        const rect = element.getBoundingClientRect();
        if (rect.width < 100 || rect.height < 100) return;
        if (rect.width > 700 || rect.height > 700) return;
        if (Math.abs(rect.width - rect.height) > Math.min(rect.width, rect.height) * 0.45) return;
        if ((element.innerText || "").trim().length > 40) return;
        candidates.push({ element, score: bonus + rect.width * rect.height });
      };
      document.querySelectorAll(
        '[id*="qrcode" i], [class*="qrcode" i], [class*="qr-code" i], [class*="qrCode" i]'
      ).forEach((element) => add(element, 300));
      document.querySelectorAll("canvas").forEach((element) => add(element, 200));
      document.querySelectorAll("img").forEach((element) => {
        const hint = String(element.id) + " " + String(element.className) + " " +
          String(element.alt || "") + " " + String(element.src || "");
        if (/qr|code|二维码/i.test(hint)) add(element, 250);
      });
      if (!candidates.length) return null;
      candidates.sort((a, b) => b.score - a.score);
      const chosen = candidates[0].element;
      chosen.scrollIntoView({ block: "center", inline: "center" });
      const rect = chosen.getBoundingClientRect();
      return {
        x: rect.left + window.scrollX,
        y: rect.top + window.scrollY,
        width: rect.width,
        height: rect.height
      };
    })()`, 5000);
  } catch {
    return null;
  }
}

async function waitForDocument(sessionId, timeout = 8000) {
  const deadline = Date.now() + timeout;
  let snapshot = null;
  while (Date.now() < deadline) {
    snapshot = await probePage(sessionId);
    const url = String(snapshot.url || "");
    const text = String(snapshot.text || "");
    const title = String(snapshot.title || "");
    if (
      url &&
      !/^about:blank/i.test(url) &&
      (text.length > 12 || /登录|验证|搜索/.test(title))
    ) {
      return snapshot;
    }
    await sleep(350);
  }
  return snapshot || probePage(sessionId);
}

function classifySnapshot(snapshot, platform) {
  if (snapshot.items?.length) return "ok";
  const text = String(snapshot.text || "").toLowerCase();
  const title = String(snapshot.title || "").toLowerCase();
  const url = String(snapshot.url || "").toLowerCase();

  const verifySignal =
    platform.verifyMarkers.some((marker) => text.includes(marker.toLowerCase())) ||
    /risk_handler|captcha|verify|验证码中间页/.test(`${url} ${title}`);
  const loginSignal =
    /login|passport/.test(url) ||
    /登录/.test(title) ||
    platform.loginMarkers.some((marker) => text.includes(marker.toLowerCase()));

  if (loginSignal && !/risk_handler|captcha|验证码中间页/.test(`${url} ${title}`)) {
    return "login";
  }
  if (verifySignal) {
    return "verify";
  }
  if (loginSignal) {
    return "login";
  }
  return "empty";
}

function statusMessage(status, platform) {
  if (status === "login") return `需要先登录${platform.name}，登录后重新抓取`;
  if (status === "verify") return `${platform.name}触发了验证码或风控，请在弹出的 Chrome 中完成验证后重试`;
  if (status === "empty") return "没有识别到商品，页面可能改版、尚未加载完或账号权限不足";
  return "抓取失败";
}

async function scrollPage(sessionId) {
  for (let index = 0; index < 4; index += 1) {
    try {
      await evaluate(
        sessionId,
        "window.scrollBy(0, Math.max(520, Math.round(window.innerHeight * 0.85))); true",
        4000
      );
    } catch {
      return;
    }
    await sleep(650);
  }
}

async function clickPriceSort(sessionId) {
  try {
    return await evaluate(sessionId, `(() => {
      const nodes = [...document.querySelectorAll("button, a, span, div, li")];
      const isPriceTab = (element) => {
        const text = (element.innerText || "").trim();
        if (!/^价格\s*(?:[↑↓]|从低到高|升序)?$/.test(text)) return false;
        const parent = element.parentElement;
        const context = [
          parent?.innerText || "",
          String(parent?.className || ""),
          String(element.className || "")
        ].join(" ");
        return /综合|销量|排序|sort|filter/i.test(context);
      };
      const matches = nodes
        .filter(isPriceTab)
        .sort((a, b) =>
          (a.innerText || "").length - (b.innerText || "").length ||
          a.children.length - b.children.length
        );
      if (!matches.length) return null;
      const target = matches[0];
      target.click();
      return {
        text: (target.innerText || "").trim(),
        className: String(target.className || "").slice(0, 100)
      };
    })()`, 5000);
  } catch {
    return null;
  }
}

function priceOrder(items) {
  const prices = items
    .slice(0, 10)
    .map((item) => Number(item?.price))
    .filter((price) => Number.isFinite(price) && price > 0);
  let increases = 0;
  let decreases = 0;
  for (let index = 1; index < prices.length; index += 1) {
    if (prices[index] > prices[index - 1] * 1.02) increases += 1;
    if (prices[index] < prices[index - 1] * 0.98) decreases += 1;
  }
  return {
    prices,
    ascending: increases >= decreases,
    descending: decreases > increases
  };
}

function failureResult(platform, status, snapshot, tab, started) {
  if (tab?.targetId) browser.diagnosticTabs.add(tab.targetId);
  return {
    id: platform.id,
    name: platform.name,
    short: platform.short,
    color: platform.color,
    status,
    message: statusMessage(status, platform),
    items: [],
    best: null,
    targetId: tab?.targetId || null,
    pageUrl: snapshot?.url || "",
    pageTitle: snapshot?.title || "",
    debugText: String(snapshot?.text || "").slice(0, 1800),
    tookMs: Date.now() - started
  };
}

async function searchPlatform(platform, query) {
  const started = Date.now();
  let tab = null;
  try {
    tab = await browser.openTab(platform.searchUrl(query), {
      mobile: platform.mobile,
      activate: false
    });

    let snapshot = await waitForDocument(tab.sessionId, 7000);
    await sleep(700);
    snapshot = await probePage(tab.sessionId);
    let classification = classifySnapshot(snapshot, platform);
    if (classification === "verify" || classification === "login") {
      return failureResult(platform, classification, snapshot, tab, started);
    }

    await sleep(500);
    let sortClick = await clickPriceSort(tab.sessionId);
    if (sortClick) await sleep(1500);

    snapshot = await extractPage(tab.sessionId, platform);
    classification = classifySnapshot(snapshot, platform);

    if (!snapshot.items?.length && classification === "empty") {
      await scrollPage(tab.sessionId);
      snapshot = await extractPage(tab.sessionId, platform);
      classification = classifySnapshot(snapshot, platform);
    }

    const deadline = Date.now() + SEARCH_TIMEOUT;
    while (!snapshot.items?.length && Date.now() < deadline) {
      classification = classifySnapshot(snapshot, platform);
      if (classification === "verify" || classification === "login") break;
      await sleep(1100);
      snapshot = await extractPage(tab.sessionId, platform);
    }

    if (snapshot.items?.length) {
      if (!sortClick) {
        sortClick = await clickPriceSort(tab.sessionId);
        if (sortClick) {
          await sleep(1500);
          const resorted = await extractPage(tab.sessionId, platform);
          if (resorted.items?.length) snapshot = resorted;
        }
      }

      let sortAscending = false;
      let sortNote = "未找到价格排序控件";
      if (sortClick) {
        const beforeOrder = priceOrder(snapshot.items);
        if (beforeOrder.descending) {
          await clickPriceSort(tab.sessionId);
          await sleep(1500);
          const toggled = await extractPage(tab.sessionId, platform);
          if (toggled.items?.length) snapshot = toggled;
        }
        const finalOrder = priceOrder(snapshot.items);
        sortAscending = finalOrder.ascending;
        sortNote = sortAscending ? "已按价格从低到高排序" : "已点击价格排序";
      }

      const items = rankItems(snapshot.items, query);
      const best = bestMatch(items);
      await browser.closeTab(tab.targetId);
      return {
        id: platform.id,
        name: platform.name,
        short: platform.short,
        color: platform.color,
        status: "ok",
        message: `已抓取 ${items.length} 件商品`,
        items,
        best,
        sortApplied: Boolean(sortClick),
        sortAscending,
        sortNote,
        tookMs: Date.now() - started
      };
    }

    const status = classifySnapshot(snapshot, platform);
    return failureResult(platform, status, snapshot, tab, started);
  } catch (error) {
    if (tab?.targetId) {
      browser.diagnosticTabs.add(tab.targetId);
    }
    return {
      id: platform.id,
      name: platform.name,
      short: platform.short,
      color: platform.color,
      status: "error",
      message: `抓取失败：${error.message}`,
      items: [],
      best: null,
      targetId: tab?.targetId || null,
      pageUrl: tab ? platform.searchUrl(query) : "",
      debugText: String(error.message || "").slice(0, 1800),
      tookMs: Date.now() - started
    };
  }
}

function demoResult(platform, query) {
  const items = rankItems(demoItems[platform.id] || [], query);
  return {
    id: platform.id,
    name: platform.name,
    short: platform.short,
    color: platform.color,
    status: "ok",
    message: `已抓取 ${items.length} 件商品（演示数据）`,
    items,
    best: bestMatch(items),
    sortApplied: true,
    sortAscending: true,
    sortNote: "已按价格从低到高排序（演示）",
    tookMs: 420,
    demo: true
  };
}

function writeJson(response, statusCode, value) {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body)
  });
  response.end(body);
}

function setStreamHeaders(response) {
  response.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    "X-Accel-Buffering": "no",
    Connection: "keep-alive"
  });
  response.flushHeaders?.();
}

async function readRequestBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 50000) throw new Error("Request body too large");
  }
  if (!body) return {};
  return JSON.parse(body);
}

async function handleSearch(request, response, url) {
  const query = normalizeText(url.searchParams.get("q")).slice(0, 100);
  const demo = FORCE_DEMO || url.searchParams.get("demo") === "1";
  if (!query) {
    writeJson(response, 400, { ok: false, error: "请输入商品名称" });
    return;
  }
  if (activeSearch && !demo) {
    writeJson(response, 429, { ok: false, error: "已有抓取任务在运行，请稍后再试" });
    return;
  }

  setStreamHeaders(response);
  let clientClosed = false;
  response.on("close", () => {
    clientClosed = true;
  });
  const send = (value) => {
    if (clientClosed || response.writableEnded || response.destroyed) return;
    response.write(`${JSON.stringify(value)}\n`);
  };

  send({
    type: "meta",
    query,
    demo,
    headless: HEADLESS,
    startedAt: new Date().toISOString()
  });

  if (demo) {
    const delays = [450, 800, 1150];
    for (let index = 0; index < PLATFORMS.length; index += 1) {
      await sleep(delays[index] || 500);
      send({ type: "platform", platform: demoResult(PLATFORMS[index], query) });
    }
    send({ type: "done", demo: true });
    response.end();
    return;
  }

  const cacheKey = query.toLowerCase();
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    for (const result of cached.results) {
      send({ type: "platform", platform: { ...result, cached: true } });
    }
    send({ type: "done", cached: true });
    response.end();
    return;
  }

  activeSearch = true;
  try {
    await browser.ensure();
    await browser.closeDiagnosticTabs();

    const results = await Promise.all(PLATFORMS.map(async (platform) => {
      const result = await searchPlatform(platform, query);
      send({ type: "platform", platform: result });
      return result;
    }));

    // Only cache complete successes. Failure results point at diagnostic tabs
    // that may already be closed, and the user needs to act on them anyway.
    if (results.every((result) => result.status === "ok")) {
      searchCache.set(cacheKey, { at: Date.now(), results });
    }
    send({ type: "done", cached: false });
  } catch (error) {
    send({
      type: "error",
      message: `本地抓取服务出错：${error.message}`
    });
    send({ type: "done", error: true });
  } finally {
    activeSearch = false;
    if (!response.writableEnded) response.end();
  }
}

async function handleApi(request, response, url) {
  const { pathname } = url;

  if (pathname === "/api/status" && request.method === "GET") {
    writeJson(response, 200, {
      ok: true,
      demo: FORCE_DEMO,
      browser: browser.status(),
      platforms: PLATFORMS.map(({ id, name, color, tagline }) => ({ id, name, color, tagline }))
    });
    return;
  }

  if (pathname === "/api/browser/start" && request.method === "POST") {
    try {
      await browser.ensure();
      writeJson(response, 200, { ok: true, browser: browser.status() });
    } catch (error) {
      writeJson(response, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (pathname === "/api/browser/login" && request.method === "POST") {
    try {
      const body = await readRequestBody(request).catch(() => ({}));
      const platformId = body.platform || url.searchParams.get("platform") || null;
      const tabs = await browser.openLoginTabs(platformId);
      writeJson(response, 200, { ok: true, tabs, browser: browser.status() });
    } catch (error) {
      writeJson(response, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (pathname === "/api/browser/prewarm" && request.method === "POST") {
    try {
      const tab = await browser.prewarm();
      writeJson(response, 200, { ok: true, tab, browser: browser.status() });
    } catch (error) {
      writeJson(response, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (pathname === "/api/browser/activate" && request.method === "POST") {
    try {
      const body = await readRequestBody(request);
      if (!body.targetId) {
        writeJson(response, 400, { ok: false, error: "缺少 targetId" });
        return;
      }
      await browser.ensure();
      await browser.activate(body.targetId);
      writeJson(response, 200, { ok: true });
    } catch (error) {
      writeJson(response, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (pathname === "/api/browser/screenshot" && request.method === "GET") {
    const targetId = url.searchParams.get("targetId");
    if (!targetId) {
      writeJson(response, 400, { ok: false, error: "缺少 targetId" });
      return;
    }
    if (!browser.cdp) {
      writeJson(response, 503, { ok: false, error: "抓取浏览器尚未启动" });
      return;
    }
    const sessionId = browser.sessions.get(targetId);
    if (!sessionId) {
      writeJson(response, 404, { ok: false, error: "登录标签页已关闭，请重新打开登录页" });
      return;
    }
    try {
      // Prefer a small QR crop: it paints much faster than a full 1280x900
      // page and gives the user a larger, clearer code to scan.
      let qrClip = null;
      const qrDeadline = Date.now() + 5000;
      while (Date.now() < qrDeadline) {
        qrClip = await findQrClip(sessionId);
        if (qrClip) break;
        await sleep(250);
      }
      if (!qrClip) await sleep(500);

      const baseOptions = {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: false,
        optimizeForSpeed: true
      };
      let shot;
      try {
        shot = await browser.cdp.send("Page.captureScreenshot", qrClip
          ? { ...baseOptions, clip: { ...qrClip, scale: 2 } }
          : baseOptions, sessionId, 20000);
      } catch {
        // If a clipped capture is not possible (off-screen/iframe), fall back
        // to the full page instead of failing the login panel.
        await sleep(700);
        shot = await browser.cdp.send("Page.captureScreenshot", baseOptions, sessionId, 20000);
      }
      const image = Buffer.from(shot.data, "base64");
      response.writeHead(200, {
        "Content-Type": "image/png",
        "Cache-Control": "no-store, no-transform",
        "Content-Length": image.length
      });
      response.end(image);
    } catch (error) {
      writeJson(response, 500, { ok: false, error: `截图失败：${error.message}` });
    }
    return;
  }

  if (pathname === "/api/browser/reload-login" && request.method === "POST") {
    try {
      const body = await readRequestBody(request);
      const sessionId = body.targetId ? browser.sessions.get(body.targetId) : null;
      if (!sessionId || !browser.cdp) {
        writeJson(response, 404, { ok: false, error: "登录标签页已关闭，请重新打开登录页" });
        return;
      }
      browser.cdp.send("Page.reload", { ignoreCache: true }, sessionId, 6000).catch(() => {});
      await sleep(700);
      writeJson(response, 200, { ok: true });
    } catch (error) {
      writeJson(response, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (pathname === "/api/browser/click-text" && request.method === "POST") {
    try {
      const body = await readRequestBody(request);
      if (!body.targetId) {
        writeJson(response, 400, { ok: false, error: "缺少 targetId" });
        return;
      }
      const sessionId = browser.sessions.get(body.targetId);
      if (!sessionId) {
        writeJson(response, 404, { ok: false, error: "登录标签页已关闭，请重新打开登录页" });
        return;
      }
      const labels = body.platform === "jd"
        ? ["扫码登录", "手机扫码安全登录", "二维码登录"]
        : ["扫码登录", "二维码登录"];
      const clicked = await evaluate(sessionId, `(() => {
        const labels = ${JSON.stringify(labels)};
        const nodes = [...document.querySelectorAll('button, a, [role="tab"], span, div, li')];
        const matches = nodes
          .filter((element) => {
            const text = (element.innerText || "").trim();
            return text && text.length <= 40 && labels.some((label) => text === label || text.includes(label));
          })
          .sort((a, b) => (a.innerText || "").length - (b.innerText || "").length);
        if (!matches.length) return null;
        matches[0].click();
        return matches[0].innerText.trim();
      })()`, 5000);
      await sleep(700);
      writeJson(response, 200, {
        ok: true,
        clicked,
        message: clicked ? `已切换到 ${clicked}` : "没有找到扫码入口，请刷新或直接在 Chrome 窗口中操作"
      });
    } catch (error) {
      writeJson(response, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (pathname === "/api/browser/close" && request.method === "POST") {
    try {
      await browser.close();
      writeJson(response, 200, { ok: true, browser: browser.status() });
    } catch (error) {
      writeJson(response, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (pathname === "/api/search" && request.method === "GET") {
    try {
      await handleSearch(request, response, url);
    } catch (error) {
      if (!response.headersSent) {
        writeJson(response, 500, { ok: false, error: error.message });
      } else if (!response.writableEnded) {
        response.end();
      }
    }
    return;
  }

  if (pathname === "/api/health" && request.method === "GET") {
    writeJson(response, 200, { ok: true, time: new Date().toISOString() });
    return;
  }

  writeJson(response, 404, { ok: false, error: "API not found" });
}

async function serveStatic(response, fileName) {
  const filePath = path.join(ROOT, fileName);
  const content = await fsp.readFile(filePath);
  response.writeHead(200, {
    "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-store",
    "Content-Length": content.length
  });
  response.end(content);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end("Method Not Allowed");
      return;
    }
    const fileName = STATIC_FILES.get(url.pathname);
    if (!fileName) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not Found");
      return;
    }
    await serveStatic(response, fileName);
  } catch (error) {
    if (!response.headersSent) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(`Server error: ${error.message}`);
    } else if (!response.writableEnded) {
      response.end();
    }
  }
});

function openUi() {
  const url = `http://127.0.0.1:${PORT}/`;
  try {
    if (process.platform === "win32") {
      spawn("cmd.exe", ["/c", "start", "", url], {
        detached: true,
        stdio: "ignore",
        windowsHide: true
      }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    }
  } catch {
    // The URL is printed below if opening the browser fails.
  }
}

server.listen(PORT, "127.0.0.1", () => {
  console.log("");
  console.log("  比价台 · 本地自动抓价");
  console.log(`  UI:      http://127.0.0.1:${PORT}/`);
  console.log(`  Manual:  http://127.0.0.1:${PORT}/manual`);
  console.log(`  Chrome:  ${findChromeExecutable() || "未找到"}`);
  console.log(`  Profile: ${PROFILE_DIR}`);
  console.log("");
  if (process.env.NO_OPEN !== "1") openUi();
});

async function shutdown() {
  console.log("\n正在关闭比价服务...");
  try {
    await browser.close();
  } catch {
    // Ignore.
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2500).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
