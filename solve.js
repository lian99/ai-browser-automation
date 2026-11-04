// Browser-only solver for the STRAIX challenge.
// Usage:
//   node solve.js explore   -> logs in, clicks through the portal, writes explore.txt + screenshots
//   node solve.js solve     -> logs in, finds the answer, submits it (same session)
// Credentials come from env vars STRAIX_USER / STRAIX_PASS.
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'https://straix-candidate-challenge.odubovsky.chatgpt.site';
const MODE = process.argv[2] || 'explore';
const HEADLESS = process.env.HEADED ? false : true;

async function login(page) {
  await page.goto(BASE);
  await page.getByLabel('Username').fill(process.env.STRAIX_USER);
  await page.getByLabel('Password').fill(process.env.STRAIX_PASS);
  await Promise.all([page.waitForLoadState('networkidle'), page.getByRole('button', { name: 'Sign in' }).click()]);
  await page.waitForTimeout(1000);
}

async function snapshot(page, tag, out) {
  const data = await page.evaluate(() => {
    const vis = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    return {
      url: location.href,
      title: document.title,
      text: document.body.innerText,
      links: [...document.querySelectorAll('a')].map((a) => ({ text: a.innerText.trim(), href: a.href, visible: vis(a) })),
      buttons: [...document.querySelectorAll('button,[role=button],[role=tab]')].map((b) => ({ text: b.innerText.trim(), aria: b.getAttribute('aria-label'), visible: vis(b) })),
      inputs: [...document.querySelectorAll('input,textarea,select')].map((i) => ({ tag: i.tagName, type: i.type, name: i.name, id: i.id, placeholder: i.placeholder, value: i.value, visible: vis(i) })),
      hidden: [...document.querySelectorAll('[hidden],[aria-hidden=true],[style*="display: none"],[style*="display:none"],.sr-only')].map((e) => e.textContent.trim()).filter(Boolean),
      comments: (() => { const w = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT); const c = []; while (w.nextNode()) c.push(w.currentNode.nodeValue.trim()); return c.filter(Boolean); })(),
      metas: [...document.querySelectorAll('meta')].map((m) => m.outerHTML),
      dataAttrs: [...document.querySelectorAll('*')].flatMap((e) => [...e.attributes].filter((a) => a.name.startsWith('data-') && !['data-slot', 'data-precedence', 'data-rsc-css-href'].includes(a.name)).map((a) => `${e.tagName}.${a.name}=${a.value}`)),
    };
  });
  out.push(`\n===== ${tag} =====\n${JSON.stringify(data, null, 2)}`);
  await page.screenshot({ path: `shot-${out.length}.png`, fullPage: true });
  return data;
}

async function explore() {
  const browser = await chromium.launch({ headless: HEADLESS });
  const page = await browser.newPage();
  const out = [];
  await login(page);
  const home = await snapshot(page, 'after login', out);
  const seen = new Set([home.url]);
  const queue = home.links.filter((l) => l.href.startsWith(BASE)).map((l) => l.href);
  while (queue.length && seen.size < 40) {
    const url = queue.shift();
    if (seen.has(url) || /logout|sign-?out/i.test(url)) continue;
    seen.add(url);
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    const d = await snapshot(page, url, out);
    for (const l of d.links) if (l.href.startsWith(BASE) && !seen.has(l.href)) queue.push(l.href);
  }
  fs.writeFileSync('explore.txt', out.join('\n'));
  console.log(`Visited ${seen.size} pages. Wrote explore.txt and ${out.length} screenshots.`);
  await browser.close();
}

async function solve() {
  const browser = await chromium.launch({ headless: HEADLESS });
  const page = await browser.newPage();
  await login(page);

  // Navigate like a user: workspace -> records -> the "1+1" record.
  await page.getByRole('link', { name: 'Open records' }).click();
  await page.waitForLoadState('networkidle');
  await page.getByRole('link', { name: '1+1', exact: true }).click();
  await page.waitForLoadState('networkidle');

  const input = page.locator('#answer');
  const before = await page.locator('body').innerText();

  // Load the answer through the page's own button, then read what the page renders.
  await page.getByRole('button', { name: 'Load answer' }).click();
  await page.waitForFunction(
    (prev) => document.body.innerText !== prev || document.querySelector('#answer').value !== '',
    before,
    { timeout: 15000 }
  );
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'solve-loaded.png', fullPage: true });

  let answer = (await input.inputValue()).trim();
  if (!answer) {
    const prevLines = new Set(before.split('\n').map((s) => s.trim()));
    const added = (await page.locator('body').innerText()).split('\n').map((s) => s.trim()).filter((s) => s && !prevLines.has(s));
    console.log('New text after Load answer:', added);
    answer = (added[0] || '').replace(/^answer\s*[:=]\s*/i, '').trim();
    if (!answer) throw new Error('Could not read the loaded answer from the page');
    await input.fill(answer);
  }
  console.log('Answer read from page:', JSON.stringify(answer));

  // Submit immediately, in the same session.
  const beforeSubmit = await page.locator('body').innerText();
  await page.getByRole('button', { name: 'Submit answer' }).click();
  await page.waitForFunction((prev) => document.body.innerText !== prev, beforeSubmit, { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'solve-submitted.png', fullPage: true });
  console.log('Page after submit:\n' + (await page.locator('body').innerText()));
  await browser.close();
}

if (!process.env.STRAIX_USER || !process.env.STRAIX_PASS) throw new Error('Set STRAIX_USER and STRAIX_PASS');
(MODE === 'solve' ? solve() : explore()).catch((e) => { console.error(e); process.exit(1); });