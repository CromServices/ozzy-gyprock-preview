import { createServer } from "node:http";
import { readFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shotsDir = join(root, "checks", "shots");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

function canConnect(host, port) {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port }, () => {
      sock.end();
      resolve(true);
    });
    sock.on("error", () => resolve(false));
    sock.setTimeout(400, () => {
      sock.destroy();
      resolve(false);
    });
  });
}

function startServer() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    let path = decodeURIComponent(url.pathname);
    if (path === "/") path = "/index.html";
    const file = join(root, path.replace(/^\/+/, ""));
    if (!file.startsWith(root) || !existsSync(file)) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    try {
      const buf = await readFile(file);
      res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
      res.end(buf);
    } catch {
      res.writeHead(500);
      res.end("error");
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

const BANNED = [
  { re: /\bplaceholder\b/i, name: "placeholder" },
  { re: /\bTODO\b/, name: "TODO" },
  { re: /\bwireframe\b/i, name: "wireframe" },
  { re: /\bbrief\b/i, name: "brief" },
  { re: /L-0/i, name: "L-0" },
  { re: /\binvented\b/i, name: "invented" },
  { re: /\bsample\b/i, name: "sample" },
  { re: /\bdemo\b/i, name: "demo" },
  { re: /\btemplate\b/i, name: "template" },
  { re: /\bconcept\b/i, name: "concept" },
  { re: /\billustrative\b/i, name: "illustrative" },
  { re: /\bAI\b/, name: "AI" },
  { re: /\bbot\b/i, name: "bot" },
  { re: /\bpricing\b/i, name: "pricing" },
  { re: /(?:A\$|\$)\s*\d/, name: "price amount" },
  { re: /stay on this page/i, name: "stay on this page" },
  { re: /email us/i, name: "email us" },
  { re: /we[’']ll email/i, name: "we'll email" },
  { re: /\bcalendar\b/i, name: "calendar" },
];

async function overflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return {
      client: doc.clientWidth,
      scroll: doc.scrollWidth,
      body: document.body.scrollWidth,
    };
  });
}

async function destick(page) {
  await page.addStyleTag({
    content:
      "header.site{position:static !important}.sticky-call{position:static !important}body{padding-bottom:0 !important}",
  });
}

async function shot(page, name) {
  const path = join(shotsDir, name);
  await page.screenshot({ path, fullPage: true });
  return path;
}

async function setViewport(page, width, height = 900) {
  await page.setViewportSize({ width, height });
}

async function goto(page, origin, theme) {
  await page.addInitScript((t) => {
    localStorage.setItem("ozzy-theme", t);
  }, theme);
  await page.goto(origin + "/index.html", { waitUntil: "load" });
  await page.evaluate(() => document.fonts && document.fonts.ready);
}

const { server, origin } = await startServer();
await mkdir(shotsDir, { recursive: true });

const proxyOn = await canConnect("127.0.0.1", 8791);
const launch = {
  headless: true,
};
if (proxyOn) launch.proxy = { server: "http://127.0.0.1:8791" };

const browser = await chromium.launch(launch);
const context = await browser.newContext({
  colorScheme: "light",
  locale: "en-AU",
  timezoneId: "Australia/Perth",
});
const page = await context.newPage();

const shotPaths = [];

await goto(page, origin, "light");
await setViewport(page, 390, 844);

const ov390 = await overflow(page);
assert(ov390.scroll <= ov390.client + 1, `horizontal overflow at 390: ${ov390.scroll} > ${ov390.client}`);

const bar = page.locator(".sticky-call");
assert(await bar.isVisible(), "Call|Quote bar not visible at 390");
const barBox = await bar.boundingBox();
assert(barBox && barBox.height <= 64, `Call|Quote bar height ${barBox && barBox.height} is not one line`);
const barMetrics = await page.evaluate(() => {
  const el = document.querySelector(".sticky-call");
  const links = [...el.querySelectorAll("a")];
  const tops = new Set(links.map((a) => Math.round(a.getBoundingClientRect().top)));
  const wrap = getComputedStyle(el).flexWrap;
  const text = links.map((a) => a.textContent.trim()).join("|");
  return { tops: [...tops], wrap, height: el.getBoundingClientRect().height, text, count: links.length };
});
assert(barMetrics.count === 2, `expected 2 bar links, got ${barMetrics.count}`);
assert(barMetrics.tops.length === 1, `Call|Quote bar not a single line (tops ${barMetrics.tops})`);
assert(barMetrics.wrap === "nowrap", `bar flex-wrap is ${barMetrics.wrap}`);
assert(/call/i.test(barMetrics.text) && /quote/i.test(barMetrics.text), `bar text was ${barMetrics.text}`);
const barColors = await page.evaluate(() => {
  const call = document.querySelector(".sticky-call a.call");
  const quote = document.querySelector(".sticky-call a.quote");
  const cs = (el) => getComputedStyle(el);
  return {
    callBg: cs(call).backgroundColor,
    callFg: cs(call).color,
    quoteBg: cs(quote).backgroundColor,
    quoteFg: cs(quote).color,
    callW: call.getBoundingClientRect().width,
    quoteW: quote.getBoundingClientRect().width,
  };
});
assert(barColors.callBg === "rgb(32, 152, 200)", `Call bar fill ${barColors.callBg} is not cyan`);
assert(barColors.callFg === "rgb(255, 255, 255)", `Call bar text ${barColors.callFg} is not white`);
assert(barColors.quoteBg === "rgb(255, 255, 255)", `Quote bar fill ${barColors.quoteBg} is not white`);
assert(barColors.quoteFg === "rgb(16, 24, 32)", `Quote bar text ${barColors.quoteFg} is not ink`);
assert(Math.abs(barColors.callW - barColors.quoteW) <= 2, `bar widths ${barColors.callW} vs ${barColors.quoteW}`);

await setViewport(page, 320, 720);
const ov320 = await overflow(page);
assert(ov320.scroll <= ov320.client + 1, `horizontal overflow at 320: ${ov320.scroll} > ${ov320.client}`);

await setViewport(page, 1440, 900);
const toggle = page.locator('[aria-label="Switch light/dark"]');
assert(await toggle.count() === 1, "theme toggle missing");

async function iconState() {
  return page.evaluate(() => {
    const sun = document.querySelector(".icon-sun");
    const moon = document.querySelector(".icon-moon");
    const cs = (el) => getComputedStyle(el);
    return {
      theme: document.documentElement.getAttribute("data-theme"),
      sunOp: parseFloat(cs(sun).opacity),
      moonOp: parseFloat(cs(moon).opacity),
      sunDisplay: cs(sun).display,
      moonDisplay: cs(moon).display,
    };
  });
}

const before = await page.locator("html").getAttribute("data-theme");
const iconsBefore = await iconState();
assert(iconsBefore.sunDisplay !== "none" && iconsBefore.moonDisplay !== "none", "toggle still uses display:none");
if (before === "dark") {
  assert(iconsBefore.sunOp > 0.5 && iconsBefore.moonOp < 0.5, `dark theme should show sun, got sun ${iconsBefore.sunOp} moon ${iconsBefore.moonOp}`);
} else {
  assert(iconsBefore.moonOp > 0.5 && iconsBefore.sunOp < 0.5, `light theme should show moon, got sun ${iconsBefore.sunOp} moon ${iconsBefore.moonOp}`);
}
await toggle.click();
await page.waitForTimeout(300);
const after = await page.locator("html").getAttribute("data-theme");
assert(before !== after, `theme did not toggle (still ${after})`);
assert(after === "dark" || after === "light", `unexpected theme ${after}`);
const iconsAfter = await iconState();
if (after === "dark") {
  assert(iconsAfter.sunOp > 0.5 && iconsAfter.moonOp < 0.5, `after click dark, sun ${iconsAfter.sunOp} moon ${iconsAfter.moonOp}`);
} else {
  assert(iconsAfter.moonOp > 0.5 && iconsAfter.sunOp < 0.5, `after click light, sun ${iconsAfter.sunOp} moon ${iconsAfter.moonOp}`);
}
await toggle.click();
await page.waitForTimeout(300);
const back = await page.locator("html").getAttribute("data-theme");
assert(back === before, `theme did not restore (got ${back}, expected ${before})`);

async function assertSticky(width, height) {
  await setViewport(page, width, height);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => window.scrollTo(0, 1500));
  const top = await page.locator("header.site").evaluate((el) => el.getBoundingClientRect().top);
  assert(top === 0, `header top is ${top} after 1500px scroll at ${width}, expected 0`);
  const overlap = await page.evaluate(() => {
    const header = document.querySelector("header.site").getBoundingClientRect();
    const bar = document.querySelector(".sticky-call");
    if (!bar) return false;
    const style = getComputedStyle(bar);
    if (style.display === "none") return false;
    const br = bar.getBoundingClientRect();
    return header.bottom > br.top && header.top < br.bottom;
  });
  assert(!overlap, `header covers the Call|Quote bar at ${width}`);
  await page.evaluate(() => window.scrollTo(0, 0));
}
await assertSticky(1440, 900);
await assertSticky(390, 844);

const weekendInfo = await page.evaluate(() => {
  const chips = [...document.querySelectorAll(".day-chips button")];
  const weekends = chips.filter((b) => b.dataset.dow === "0" || b.dataset.dow === "6");
  const weekdayOn = chips.filter((b) => b.dataset.dow !== "0" && b.dataset.dow !== "6" && !b.disabled);
  return {
    count: chips.length,
    weekendCount: weekends.length,
    weekendsDisabled: weekends.every((b) => b.disabled),
    anyWeekendEnabled: weekends.some((b) => !b.disabled),
    weekdayCount: weekdayOn.length,
  };
});
assert(weekendInfo.count === 14, `expected 14 day chips, got ${weekendInfo.count}`);
assert(weekendInfo.weekendCount > 0, "no weekend chips to assert");
assert(weekendInfo.weekendsDisabled, "weekends are not all disabled");
assert(!weekendInfo.anyWeekendEnabled, "a weekend chip is enabled");

await setViewport(page, 1440, 900);
assert(await page.locator(".hero-card").isVisible(), "hero quote card missing at 1440");
await setViewport(page, 390, 844);
assert(await page.locator(".hero-card").isHidden(), "hero quote card should be hidden at 390");

const skipScan = new Set(["node_modules", ".git", "shots"]);
async function assertNoWorkCeiling(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (skipScan.has(entry.name) || entry.name === "check.mjs") continue;
    const full = join(dir, entry.name);
    assert(!/work-ceiling/i.test(entry.name), `work-ceiling path remains: ${full}`);
    if (entry.isDirectory()) {
      await assertNoWorkCeiling(full);
      continue;
    }
    const ext = extname(entry.name).toLowerCase();
    if ([".png", ".jpg", ".jpeg", ".webp", ".woff2", ".lock"].includes(ext)) continue;
    const text = await readFile(full, "utf8");
    if (/work-ceiling/i.test(text)) {
      assert(false, `work-ceiling reference remains in ${full}`);
    }
  }
}
await assertNoWorkCeiling(root);

const visible = await page.evaluate(() => document.body.innerText);
for (const item of BANNED) {
  const hit = visible.match(item.re);
  if (hit) failures.push(`banned text "${item.name}" matched ${JSON.stringify(hit[0])}`);
}

const lightShots = await browser.newPage();
await goto(lightShots, origin, "light");
await destick(lightShots);
await setViewport(lightShots, 1440, 900);
shotPaths.push(await shot(lightShots, "desktop-1440-light.png"));
await setViewport(lightShots, 390, 844);
shotPaths.push(await shot(lightShots, "mobile-390-light.png"));
await lightShots.close();

const contextDark = await browser.newContext({
  colorScheme: "dark",
  locale: "en-AU",
  timezoneId: "Australia/Perth",
});
const pageDark = await contextDark.newPage();
await goto(pageDark, origin, "dark");
await destick(pageDark);
await setViewport(pageDark, 1440, 900);
shotPaths.push(await shot(pageDark, "desktop-1440-dark.png"));
await setViewport(pageDark, 390, 844);
shotPaths.push(await shot(pageDark, "mobile-390-dark.png"));
await contextDark.close();

const successPage = await browser.newPage();
await goto(successPage, origin, "light");
await successPage.locator("#b-name").fill("Alex Morgan");
await successPage.locator("#b-phone").fill("0435 897 491");
await successPage.locator('.book-form button[type="submit"]').click();
await successPage.locator("#book-success").waitFor({ state: "visible" });
assert(await successPage.locator(".book-form").isHidden(), "booking form still visible after submit");
await destick(successPage);
await setViewport(successPage, 1440, 900);
shotPaths.push(await shot(successPage, "booking-success-1440.png"));
await setViewport(successPage, 390, 844);
shotPaths.push(await shot(successPage, "booking-success-390.png"));

const successText = await successPage.locator("#book-success").innerText();
await successPage.close();

assert(/Visit request saved/i.test(successText), `unexpected success copy: ${successText}`);
assert(!/stay on this page/i.test(successText), "success copy mentions staying on the page");
assert(!/email/i.test(successText), "success copy mentions email");
assert(!/calendar/i.test(successText), "success copy mentions calendar");

await browser.close();
server.close();

if (failures.length) {
  console.error("FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("PASS");
console.log("proxy", proxyOn ? "http://127.0.0.1:8791" : "off (8791 closed)");
console.log("shots");
for (const p of shotPaths) console.log(p);
