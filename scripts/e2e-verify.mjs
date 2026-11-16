/**
 * End-to-end verification of File Inspector core features using a real
 * Chromium instance against the production build (vite preview).
 *
 * Verifies: file selection, metadata inspection, hash generation,
 * file comparison, duplicate detection, and theme toggle.
 *
 * Usage: node scripts/e2e-verify.mjs   (requires preview server on :4173)
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:4173/file-inspector/";
const SHOTS = new URL("../screenshots/", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(String(err)));

try {
  // ── 1. App loads ────────────────────────────────────────────────
  await page.goto(BASE, { waitUntil: "networkidle" });
  check("App loads", await page.locator("h1").first().textContent() === "File Inspector");
  check(
    "Privacy notice visible",
    await page.getByTestId("privacy-notice").isVisible(),
  );
  check(
    "Drop zone visible",
    await page.getByRole("button", { name: /Select files to inspect/i }).isVisible(),
  );

  // ── 2. File selection + metadata inspection ─────────────────────
  await page.getByTestId("file-input").setInputFiles([
    "/tmp/fixtures/photo.png",
    "/tmp/fixtures/disguised.txt",
    "/tmp/fixtures/report-original.pdf",
    "/tmp/fixtures/report-copy.pdf",
    "/tmp/fixtures/aaaa.txt",
    "/tmp/fixtures/aaab.txt",
  ]);

  await page.waitForSelector('[data-testid="file-card"]', { timeout: 15000 });
  const cardCount = await page.locator('[data-testid="file-card"]').count();
  check("Six file cards rendered", cardCount === 6, `got ${cardCount}`);

  const firstCardText = await page.locator('[data-testid="file-card"]').first().innerText();
  check("Card shows extension", /\.png/i.test(firstCardText));
  check("Card shows MIME type", /image\/png/i.test(firstCardText));
  check("Card shows byte size", /\d+ bytes/i.test(firstCardText));
  check("Card shows last modified", /Last modified/i.test(firstCardText));
  check(
    "Card shows file signature",
    /PNG image/i.test(firstCardText) && /89 50 4e 47/i.test(firstCardText),
  );

  const badges = await page.locator('[data-testid="consistency-badge"]').allInnerTexts();
  check(
    "Consistent file flagged consistent",
    badges.some((b) => /Extension matches type/i.test(b)),
  );
  check(
    "Disguised PNG flagged inconsistent",
    badges.some((b) => /does NOT match/i.test(b)),
    JSON.stringify(badges),
  );

  // ── 3. Hash generation (wait for SHA-256 rows) ──────────────────
  await page.waitForSelector('[data-testid="hash-row-SHA-256"]', { timeout: 20000 });
  await page.waitForSelector('[data-testid="hash-row-MD5"]', { timeout: 20000 });
  // The visible text truncates long digests; the full value lives in title.
  const shaTitle = await page
    .locator('[data-testid="hash-row-SHA-256"] code')
    .first()
    .getAttribute("title");
  check(
    "SHA-256 hash is 64 hex chars",
    /^[0-9a-f]{64}$/.test(shaTitle ?? ""),
    (shaTitle ?? "").slice(0, 16) + "…",
  );

  // Known vector: SHA-256("aaaa same length") vs Node.js reference
  const cryptoImport = await import("node:crypto");
  const expectedAaaa = cryptoImport
    .createHash("sha256")
    .update("aaaa same length")
    .digest("hex");
  const cards = page.locator('[data-testid="file-card"]');
  let aaaaHashOk = false;
  for (let i = 0; i < (await cards.count()); i++) {
    const card = cards.nth(i);
    const text = await card.innerText();
    if (/\baaaa\.txt\b/.test(text)) {
      const title = await card
        .locator('[data-testid="hash-row-SHA-256"] code')
        .getAttribute("title");
      aaaaHashOk = title === expectedAaaa;
      break;
    }
  }
  check("SHA-256 matches Node.js reference digest", aaaaHashOk, expectedAaaa.slice(0, 16) + "…");

  const md5Row = await page.locator('[data-testid="hash-row-MD5"]').first().innerText();
  check("MD5 row labelled legacy/not-for-security", /Legacy · not for security/i.test(md5Row));
  check("MD5 row carries security notice", /cryptographically broken/i.test(md5Row));
  check(
    "MD5 row shows 32-hex digest",
    /\b[0-9a-f]{32}\b/.test(md5Row),
  );

  await page.screenshot({ path: `${SHOTS}inspector-light.png`, fullPage: true });

  // ── 4. Theme toggle ─────────────────────────────────────────────
  await page.getByRole("button", { name: /Switch to dark theme/i }).click();
  // Wait until the class AND the rendered background actually flip, so the
  // screenshot cannot race the paint.
  await page.waitForFunction(
    () =>
      document.documentElement.classList.contains("dark") &&
      getComputedStyle(document.body).backgroundColor !==
        "oklch(0.968 0.007 247.896)",
    undefined,
    { timeout: 5000 },
  );
  const isDark = await page.evaluate(() =>
    document.documentElement.classList.contains("dark"),
  );
  check("Dark theme applies", isDark);
  await page.screenshot({ path: `${SHOTS}inspector-dark.png`, fullPage: true });
  // Stay in dark mode for the comparison screenshots below.

  // Helper: pick a file in a <select> by fragment of its option text.
  async function selectByFragment(selectTestId, fragment) {
    const value = await page.evaluate(
      ([id, frag]) => {
        const sel = document.querySelector(`[data-testid="${id}"]`);
        const opt = Array.from(sel.options).find((o) =>
          o.textContent.includes(frag),
        );
        return opt ? opt.value : null;
      },
      [selectTestId, fragment],
    );
    if (!value) throw new Error(`No option matching "${fragment}" in ${selectTestId}`);
    await page.getByTestId(selectTestId).selectOption(value);
  }

  // ── 5. Comparison: identical content, different names ───────────
  await page.getByRole("button", { name: /Compare/i }).click();
  await selectByFragment("compare-left", "report-original.pdf");
  await selectByFragment("compare-right", "report-copy.pdf");
  await page.getByTestId("compare-button").click();
  await page.waitForSelector('[data-testid="comparison-result"]', { timeout: 15000 });
  const identicalText = await page.getByTestId("comparison-result").innerText();
  check(
    "Identical content reported identical",
    /Files are identical/i.test(identicalText),
    identicalText.split("\n")[0],
  );
  check(
    "Method explains byte-for-byte step",
    /byte-for-byte/i.test(identicalText),
  );
  check(
    "Steps list shown",
    /Compared file sizes/i.test(identicalText) && /SHA-256/i.test(identicalText),
  );

  // ── 6. Comparison: different content, same size ─────────────────
  await selectByFragment("compare-left", "aaaa.txt");
  await selectByFragment("compare-right", "aaab.txt");
  await page.getByTestId("compare-button").click();
  await page.waitForTimeout(1500);
  const differentText = await page.getByTestId("comparison-result").innerText();
  check(
    "Different content reported different",
    /Files are different/i.test(differentText),
    differentText.split("\n")[0],
  );
  check(
    "Hash-mismatch method cited",
    /Hash mismatch|SHA-256 digests differ/i.test(differentText),
  );
  await page.screenshot({ path: `${SHOTS}compare-dark.png`, fullPage: true });

  // Back to light theme for the remaining screenshots.
  await page.getByRole("button", { name: /Switch to light theme/i }).click();
  await page.waitForFunction(
    () =>
      !document.documentElement.classList.contains("dark") &&
      getComputedStyle(document.body).backgroundColor ===
        "oklch(0.968 0.007 247.896)",
    undefined,
    { timeout: 5000 },
  );

  // ── 7. Duplicate detection ──────────────────────────────────────
  await page.getByRole("button", { name: /Duplicates/i }).click();
  await page.getByTestId("scan-duplicates").click();
  await page.waitForSelector('[data-testid="duplicate-group"]', { timeout: 30000 });
  const dupGroups = await page.locator('[data-testid="duplicate-group"]').count();
  check("One duplicate group found", dupGroups === 1, `got ${dupGroups}`);
  const dupText = await page.locator('[data-testid="duplicate-group"]').first().innerText();
  check(
    "Group lists both duplicate files",
    dupText.includes("report-original.pdf") && dupText.includes("report-copy.pdf"),
  );
  check("Group shows matching checksum", /[0-9a-f]{24,}/.test(dupText));
  check(
    "Collision disclaimer present",
    /not a mathematical proof against collisions|not a collision-proof/i.test(
      await page.locator("main").innerText(),
    ),
  );
  await page.screenshot({ path: `${SHOTS}duplicates-light.png`, fullPage: true });

  // ── 8. Hash results visible in inspector (screenshot) ───────────
  await page.getByRole("button", { name: /File inspector/i }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}hashes-light.png`, fullPage: true });

  check(
    "No console/page errors during run",
    consoleErrors.length === 0,
    consoleErrors.slice(0, 3).join(" | "),
  );
} catch (err) {
  check("E2E script completed without exception", false, String(err).slice(0, 300));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) {
  console.log("FAILED:", failed.map((f) => f.name).join(", "));
  process.exit(1);
}
