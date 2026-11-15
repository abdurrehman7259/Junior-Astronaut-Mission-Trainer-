import { expect, test, type Locator, type Page } from '@playwright/test';

// D-040: the live banner calls NASA DONKI from the browser. Tests never depend on NASA being up:
// the request is answered with an error, so the game shows its archived snapshot (honest fallback).
test.beforeEach(async ({ page }) => {
  await page.route('https://ccmc.gsfc.nasa.gov/**', (route) => route.fulfill({ status: 503, body: '[]' }));
});

// F9: accessibility and responsive pass (WCAG 2.2 AA basics, NFR-05, NFR-07, NFR-08).
// Chromium only, desktop project only (the tablet project would repeat the same checks).
test.setTimeout(180_000);
// oxlint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixtures argument
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'a11y checks run once, in the desktop project');
});

type Site = 'moon' | 'mars';
const WIDTHS = [360, 768, 1024, 1920] as const;

const word = (site: Site) => (site === 'moon' ? 'Day' : 'Sol');
const NEXT = /^(Next|Go to) (day|sol)/;

/** The first Start opens the "How to play" intro (P1, D-038). Close it with a click on Skip. */
async function skipIntro(page: Page) {
  const intro = page.getByRole('dialog', { name: 'How to play' });
  await expect(intro).toBeVisible();
  await intro.getByRole('button', { name: 'Skip' }).click();
  await expect(intro).toBeHidden();
}

async function openStart(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start mission' })).toBeVisible({ timeout: 5_000 });
}

/** Presses Tab (or Shift+Tab) until `target` has focus. Keyboard only. */
async function tabTo(page: Page, target: Locator, { max = 80, back = false } = {}) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return;
    await page.keyboard.press(back ? 'Shift+Tab' : 'Tab');
  }
  await expect(target).toBeFocused();
}

/** Start screen, by keyboard: pick the site with the arrow keys, then Tab to "Start mission" and press Enter. */
async function startByKeyboard(page: Page, site: Site) {
  if (site === 'mars') {
    const moon = page.getByRole('radio', { name: /Moon/ });
    const mars = page.getByRole('radio', { name: /Mars/ });
    await expect(mars).toBeEnabled({ timeout: 20_000 });
    await tabTo(page, moon);
    await page.keyboard.press('ArrowDown');
    await expect(mars).toBeChecked();
    await expect(mars).toBeFocused();
    // "Selected" is visible text on the chosen card, not colour only.
    await expect(page.locator('.site-card.is-selected .site-selected')).toBeVisible();
    await expect(page.locator('.site-card.is-selected')).toContainText('Mars');
  }
  await tabTo(page, page.getByRole('button', { name: 'Start mission' }));
  await page.keyboard.press('Enter');
  // The intro opens with focus inside it; Esc skips it and focus lands on the day heading.
  const intro = page.getByRole('dialog', { name: 'How to play' });
  await expect(intro).toBeVisible();
  expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(intro).toBeHidden();
  await expect(page.getByRole('heading', { name: `${word(site)} 1 of 10` })).toBeVisible();
}

/** A full mission, keyboard only: Tab / Shift+Tab / Enter / Space / arrows. No mouse. */
async function playByKeyboard(page: Page, site: Site) {
  const W = word(site);
  const w = W.toLowerCase();
  for (let n = 1; n <= 10; n++) {
    await expect(page.getByRole('heading', { name: `${W} ${n} of 10` })).toBeFocused();

    const run = page.getByRole('button', { name: `Start ${w} ${n}` });
    // Each day starts with nothing shared (P3): Start stays off until all 10 are placed.
    await expect(run).toBeDisabled();
    if (n === 1) {
      // Build the plan by keyboard: step buttons (Enter, Space) and a slider (arrows, End).
      const add = page.getByRole('button', { name: /^Add one unit to Air/ });
      await tabTo(page, add);
      await page.keyboard.press('Enter');
      await page.keyboard.press('Space');
      await expect(run).toBeDisabled();
      const slider = page.getByRole('slider', { name: /^Shields? units/ });
      await tabTo(page, slider);
      await page.keyboard.press('End'); // all the rest to shields
      await expect(slider).toHaveAttribute('aria-valuetext', /8 of 10 units/);
      await expect(run).toBeEnabled();
      await page.keyboard.press('ArrowLeft'); // 1 unit back to the pool
      await expect(run).toBeDisabled();
      await page.keyboard.press('ArrowRight'); // and returned
      await expect(run).toBeEnabled();
    } else {
      const balanced = page.getByRole('button', { name: 'Balanced' });
      await tabTo(page, balanced);
      await page.keyboard.press('Enter');
    }
    await tabTo(page, run);
    await expect(run).toBeEnabled();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: `${W} ${n} report` })).toBeFocused();

    const final = page.getByRole('button', { name: 'See how the mission went' });
    if (await final.isVisible()) {
      await tabTo(page, final);
      await page.keyboard.press('Enter');
      break;
    }
    await tabTo(page, page.getByRole('button', { name: NEXT }));
    await page.keyboard.press('Space');
  }
  await expect(page.getByRole('heading', { name: 'What really happened' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Real NASA science' })).toBeVisible();
  const again = page.getByRole('button', { name: 'Play again' });
  await tabTo(page, again);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: `${W} 1 of 10` })).toBeVisible();
}

for (const site of ['moon', 'mars'] as const) {
  test(`keyboard-only ${site} mission`, async ({ page }) => {
    await openStart(page);
    await startByKeyboard(page, site);
    await playByKeyboard(page, site);
  });
}

// ---------------------------------------------------------------- audits run inside the page

interface Issue {
  rule: string;
  where: string;
}

/** Heuristic audit of the current screen. Returns a list of problems (empty = clean). */
async function audit(page: Page): Promise<Issue[]> {
  return page.evaluate(() => {
    const issues: { rule: string; where: string }[] = [];
    const desc = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''} "${(el.textContent ?? '').trim().slice(0, 40)}"`;
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const isOffscreenHelper = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width <= 1 || r.height <= 1;
    };

    // One h1, and no skipped heading levels.
    const heads = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter((h) => !h.closest('dialog:not([open])'));
    const h1s = heads.filter((h) => h.tagName === 'H1');
    if (h1s.length !== 1) issues.push({ rule: 'one-h1', where: `found ${h1s.length}` });
    let prev = 0;
    for (const h of heads) {
      const level = Number(h.tagName[1]);
      if (prev && level > prev + 1) issues.push({ rule: 'heading-order', where: `${desc(h)} after h${prev}` });
      prev = level;
    }

    // Accessible names (heuristic: aria-label, aria-labelledby, label, text content).
    const nameOf = (el: Element): string => {
      const aria = el.getAttribute('aria-label');
      if (aria?.trim()) return aria.trim();
      const by = el.getAttribute('aria-labelledby');
      if (by) {
        const t = by
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' ')
          .trim();
        if (t) return t;
      }
      const labels = (el as HTMLInputElement).labels;
      if (labels && labels.length) return [...labels].map((l) => l.textContent ?? '').join(' ').trim();
      return (el.textContent ?? '').trim();
    };
    for (const el of document.querySelectorAll('button,a[href],input,select,textarea,[role=slider],[role=meter]')) {
      if (!nameOf(el)) issues.push({ rule: 'accessible-name', where: desc(el) });
    }
    for (const el of document.querySelectorAll('[role=meter]')) {
      if (!el.getAttribute('aria-valuetext') && !el.hasAttribute('aria-valuenow')) issues.push({ rule: 'meter-value', where: desc(el) });
    }

    // Images and svg icons.
    for (const img of document.querySelectorAll('img')) {
      if (!img.hasAttribute('alt')) issues.push({ rule: 'img-alt', where: desc(img) });
    }
    for (const svg of document.querySelectorAll('svg')) {
      if (svg.getAttribute('aria-hidden') !== 'true' && !svg.getAttribute('aria-label') && !svg.querySelector('title')) {
        issues.push({ rule: 'svg-aria-hidden', where: desc(svg.parentElement ?? svg) });
      }
    }

    // Touch targets of at least 44 x 44 for buttons, links (block-level) and form controls. Inline glossary buttons extend their hit area with ::after.
    for (const el of document.querySelectorAll('button,a[href],input:not([type=radio]),[role=slider]')) {
      if (!visible(el) || isOffscreenHelper(el) || el.closest('.glossary-term') && el.classList.contains('glossary-trigger')) continue;
      if (el.classList.contains('skip-link')) continue;
      const r = el.getBoundingClientRect();
      if (r.height < 43.5 || r.width < 43.5) issues.push({ rule: 'target-size', where: `${desc(el)} ${Math.round(r.width)}x${Math.round(r.height)}` });
    }
    for (const el of document.querySelectorAll('.site-card')) {
      const r = el.getBoundingClientRect();
      if (r.height < 44) issues.push({ rule: 'target-size', where: desc(el) });
    }

    // Body text is at least 16 px.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || seen.has(el) || !(n.textContent ?? '').trim() || el.closest('svg,script,style')) continue;
      seen.add(el);
      if (!visible(el) || isOffscreenHelper(el)) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 15.99) issues.push({ rule: 'font-size', where: `${desc(el)} ${fs}px` });
    }

    // Contrast of text against the nearest solid background (gradients are skipped).
    const parse = (c: string): [number, number, number, number] | null => {
      const m = /rgba?\(([^)]+)\)/.exec(c);
      if (!m) return null;
      const parts = m[1]!.replace('/', ' ').split(/[\s,]+/).filter(Boolean).map(Number);
      return [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1];
    };
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
    };
    const bgOf = (el: Element): [number, number, number] | null => {
      let acc: [number, number, number, number][] = [];
      for (let e: Element | null = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.backgroundImage !== 'none') return null;
        const c = parse(cs.backgroundColor);
        if (c && c[3] > 0) {
          acc.push(c);
          if (c[3] >= 1) break;
        }
      }
      let base: [number, number, number] = [0, 0, 0];
      for (const c of acc.reverse()) {
        base = [0, 1, 2].map((i) => c[i]! * c[3] + base[i]! * (1 - c[3])) as [number, number, number];
      }
      return base;
    };
    const seen2 = new Set<Element>();
    const w2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w2.nextNode(); n; n = w2.nextNode()) {
      const el = n.parentElement;
      if (!el || seen2.has(el) || !(n.textContent ?? '').trim() || el.closest('svg')) continue;
      seen2.add(el);
      if (!visible(el) || isOffscreenHelper(el)) continue;
      if ((el.closest('button,input') as HTMLButtonElement | null)?.disabled) continue;
      const cs = getComputedStyle(el);
      const fg = parse(cs.color);
      const bg = bgOf(el);
      if (!fg || !bg) continue;
      const fgc = [0, 1, 2].map((i) => fg[i]! * fg[3] + bg[i]! * (1 - fg[3]));
      const l1 = lum(fgc);
      const l2 = lum(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const fs = parseFloat(cs.fontSize);
      const large = fs >= 24 || (fs >= 18.66 && Number(cs.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5)) issues.push({ rule: 'contrast', where: `${desc(el)} ${ratio.toFixed(2)}` });
    }

    // Live regions: at most a few, and short.
    const live = [...document.querySelectorAll('[aria-live],[role=status],[role=alert]')];
    for (const l of live) {
      if ((l.textContent ?? '').length > 160) issues.push({ rule: 'noisy-live-region', where: desc(l) });
    }

    // Horizontal overflow.
    const de = document.documentElement;
    if (de.scrollWidth > de.clientWidth) issues.push({ rule: 'h-overflow', where: `scrollWidth ${de.scrollWidth} > ${de.clientWidth}` });
    return issues;
  });
}

async function expectClean(page: Page, label: string) {
  const issues = await audit(page);
  expect(issues, `${label}: ${JSON.stringify(issues, null, 1)}`).toEqual([]);
}

/** Runs the audit at every width, then restores the first width. */
async function auditAllWidths(page: Page, label: string) {
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: w === 360 ? 740 : 900 });
    await expectClean(page, `${label} @${w}`);
  }
  await page.setViewportSize({ width: 1024, height: 900 });
}

for (const site of ['moon', 'mars'] as const) {
  test(`audit and no horizontal overflow (${site})`, async ({ page }) => {
    await openStart(page);
    if (site === 'mars') {
      const mars = page.getByRole('radio', { name: /Mars/ });
      await expect(mars).toBeEnabled({ timeout: 20_000 });
      await mars.check();
    }
    await auditAllWidths(page, `${site} start`);
    await page.getByRole('button', { name: 'Start mission' }).click();
    await expect(page.getByRole('dialog', { name: 'How to play' })).toBeVisible();
    await auditAllWidths(page, `${site} intro`);
    await skipIntro(page);
    await expect(page.getByRole('heading', { name: `${word(site)} 1 of 10` })).toBeVisible();
    await auditAllWidths(page, `${site} mission`);

    const w = word(site).toLowerCase();
    await page.getByRole('button', { name: 'Balanced' }).click();
    // Measure the enabled Start button after its colour transition, not mid-fade.
    await page.getByRole('button', { name: `Start ${w} 1` }).evaluate((el) => Promise.all(el.getAnimations().map((x) => x.finished)));
    await auditAllWidths(page, `${site} mission, plan ready`);
    await page.getByRole('button', { name: `Start ${w} 1` }).click();
    await expect(page.getByRole('heading', { name: `${word(site)} 1 report` })).toBeVisible();
    await auditAllWidths(page, `${site} report`);

    for (let n = 1; n <= 10; n++) {
      if (n > 1) {
        await page.getByRole('button', { name: 'Balanced' }).click();
        await page.getByRole('button', { name: `Start ${w} ${n}` }).click();
        await expect(page.getByRole('heading', { name: `${word(site)} ${n} report` })).toBeVisible();
      }
      const final = page.getByRole('button', { name: 'See how the mission went' });
      if (await final.isVisible()) {
        await final.click();
        break;
      }
      await page.getByRole('button', { name: NEXT }).click();
    }
    await expect(page.getByRole('heading', { name: 'What really happened' })).toBeVisible();
    await auditAllWidths(page, `${site} end`);
  });
}

test('Data used dialog: focus stays inside, Esc closes and returns focus', async ({ page }) => {
  await openStart(page);
  const opener = page.getByRole('button', { name: /Data used/ }).first();
  await tabTo(page, opener);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Data used' });
  await expect(dialog).toBeVisible();
  const inside = () => page.evaluate(() => !!document.activeElement?.closest('dialog'));
  expect(await inside()).toBe(true);
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    const el = await page.evaluate(() => (document.activeElement === document.body ? 'body' : document.activeElement?.closest('dialog') ? 'dialog' : 'outside'));
    expect(el, `Tab #${i + 1}`).not.toBe('outside');
  }
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Shift+Tab');
    const el = await page.evaluate(() => (document.activeElement === document.body ? 'body' : document.activeElement?.closest('dialog') ? 'dialog' : 'outside'));
    expect(el, `Shift+Tab #${i + 1}`).not.toBe('outside');
  }
  // Dialog content passes the audit at phone width too.
  await page.setViewportSize({ width: 360, height: 740 });
  const issues = (await audit(page)).filter((i) => i.rule !== 'one-h1');
  expect(issues, JSON.stringify(issues, null, 1)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

for (const site of ['moon', 'mars'] as const) {
  test(`glossary popovers stay inside the viewport at 360 px (${site})`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await openStart(page);
    if (site === 'mars') {
      const mars = page.getByRole('radio', { name: /Mars/ });
      await expect(mars).toBeEnabled({ timeout: 20_000 });
      await mars.check();
    }
    await page.getByRole('button', { name: 'Start mission' }).click();
    await skipIntro(page);
    await expect(page.getByRole('heading', { name: `${word(site)} 1 of 10` })).toBeVisible();

    // Glossary words are inline now (P2): at least "Shields" in the allocator.
    const triggers = page.locator('main .glossary-trigger');
    const count = await triggers.count();
    expect(count).toBeGreaterThanOrEqual(1);
    // Rightmost term first, then every other one.
    const boxes = await triggers.evaluateAll((els) => els.map((e, i) => ({ i, right: e.getBoundingClientRect().right, top: e.getBoundingClientRect().top })));
    boxes.sort((a, b) => b.right - a.right);
    for (const { i } of boxes) {
      const t = triggers.nth(i);
      await t.click();
      const pop = page.locator('.glossary-popover');
      await expect(pop).toBeVisible();
      const box = (await pop.boundingBox())!;
      expect(box.x, `term ${i} left edge`).toBeGreaterThanOrEqual(15.5);
      expect(box.x + box.width, `term ${i} right edge`).toBeLessThanOrEqual(360 - 15.5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.keyboard.press('Escape');
      await expect(pop).toHaveCount(0);
    }
  });
}

test('visible focus ring on every tab stop (start and mission)', async ({ page }) => {
  await openStart(page);
  const check = async (label: string, stops: number) => {
    for (let i = 0; i < stops; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const own = getComputedStyle(el);
        let target: Element = el;
        // The radio input is visually hidden; its card (or dot) carries the ring.
        if (el instanceof HTMLInputElement && el.type === 'radio') target = el.closest('label') ?? el;
        const cs = getComputedStyle(target);
        const dot = el instanceof HTMLInputElement && el.type === 'radio' ? getComputedStyle(el.parentElement!.querySelector('.site-dot')!) : null;
        const ring = (s: CSSStyleDeclaration) => s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2;
        return { name: `${el.tagName} ${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30)}`, ok: ring(cs) || ring(own) || (dot ? ring(dot) : false) };
      });
      if (info) expect(info.ok, `${label}: no focus ring on ${info.name}`).toBe(true);
    }
  };
  await check('start', 9);
  await page.getByRole('button', { name: 'Start mission' }).click();
  await skipIntro(page);
  await expect(page.getByRole('heading', { name: 'Day 1 of 10' })).toBeVisible();
  await check('mission', 30);
});

test('reduced motion removes transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openStart(page);
  const d = await page.getByRole('button', { name: 'Start mission' }).evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
  expect(d).toBeLessThan(0.001);
});

test('page basics Lighthouse checks: title, lang, viewport, no images without alt', async ({ page }) => {
  await openStart(page);
  expect(await page.title()).toBe('Moon Base Cadets');
  expect(await page.locator('html').getAttribute('lang')).toBe('en');
  const viewport = await page.locator('meta[name=viewport]').getAttribute('content');
  expect(viewport).toContain('width=device-width');
  expect(viewport).not.toMatch(/user-scalable\s*=\s*(no|0)|maximum-scale/);
  expect(await page.locator('img:not([alt])').count()).toBe(0);
  expect(await page.locator('main').count()).toBe(1);
});

test('audit self-check: it flags a tiny, low-contrast, unnamed control', async ({ page }) => {
  await openStart(page);
  await page.evaluate(() => {
    const b = document.createElement('button');
    b.style.cssText = 'width:10px;height:10px;font-size:10px;color:#444;background:#333';
    document.querySelector('main')!.append(b);
    const t = document.createElement('p');
    t.textContent = 'dim text';
    t.style.cssText = 'font-size:12px;color:#444;background:#333';
    document.querySelector('main')!.append(t);
  });
  const rules = new Set((await audit(page)).map((i) => i.rule));
  for (const r of ['accessible-name', 'target-size', 'font-size', 'contrast']) expect(rules.has(r), r).toBe(true);
});
