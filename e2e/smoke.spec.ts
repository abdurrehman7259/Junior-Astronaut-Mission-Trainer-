import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

test.setTimeout(120_000);

type Site = 'moon' | 'mars';

async function openStart(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start mission' })).toBeVisible({ timeout: 3_000 });
}

/** The first Start opens the 3-card "How to play" intro (P1, D-038). Skip it. */
async function skipIntro(page: Page) {
  const intro = page.getByRole('dialog', { name: 'How to play' });
  await expect(intro).toBeVisible();
  await intro.getByRole('button', { name: 'Skip' }).click();
  await expect(intro).toBeHidden();
}

/** Each day starts with 0 power shared (P3): pick the Balanced quick plan, then start the day. */
async function planAndStart(page: Page, lower: string, n: number) {
  const startBtn = page.getByRole('button', { name: `Start ${lower} ${n}` });
  await expect(startBtn).toBeDisabled();
  await page.getByRole('button', { name: 'Balanced' }).click();
  await startBtn.click();
}

const NEXT = /^(Next|Go to) (day|sol)/;

async function start(page: Page, site: Site, { intro = true } = {}) {
  if (site === 'mars') {
    const mars = page.getByRole('radio', { name: /Mars/ });
    await expect(mars).toBeEnabled({ timeout: 20_000 });
    await mars.check();
  }
  await page.getByRole('button', { name: 'Start mission' }).click();
  if (intro) await skipIntro(page);
  await expect(page.getByRole('heading', { name: site === 'moon' ? 'Day 1 of 10' : 'Sol 1 of 10' })).toBeVisible();
}

/** Plays from day/sol `from` until the end screen (does not click "Play again"). */
async function playOut(page: Page, site: Site, from = 1, maxTurns = 10) {
  const word = site === 'moon' ? 'Day' : 'Sol';
  const lower = word.toLowerCase();
  for (let n = from; n <= maxTurns; n++) {
    await planAndStart(page, lower, n);
    await expect(page.getByRole('heading', { name: `${word} ${n} report` })).toBeVisible();
    const final = page.getByRole('button', { name: 'See how the mission went' });
    if (await final.isVisible()) {
      await final.click();
      break;
    }
    await page.getByRole('button', { name: NEXT }).click();
    await expect(page.getByRole('heading', { name: `${word} ${n + 1} of 10` })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'What really happened' })).toBeVisible();
}

async function expectEnd(page: Page) {
  await expect(page.getByRole('heading', { name: 'What really happened' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Real NASA science' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play again' })).toBeVisible();
}

test('Moon full mission', async ({ page }) => {
  await openStart(page);
  await expect(page.getByText('Dev mode')).toHaveCount(0);
  await start(page, 'moon');

  await expect(page.getByText(/^(Real storm from NASA|Calm day \(real NASA date\))$/)).toBeVisible();
  await expect(page.getByText(/Game strength|game dose/i)).toHaveCount(0);
  await expect(page.getByText(/Real date:/)).toBeVisible();
  await expect(page.getByText(/\b\d{1,2} \w+ \d{4}\b/).first()).toBeVisible();
  const link = page.getByRole('link', { name: /See the NASA record/ });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', /ccmc\.gsfc\.nasa\.gov/);

  await playOut(page, 'moon');
  await expectEnd(page);
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.getByRole('heading', { name: 'Day 1 of 10' })).toBeVisible();
});

test('Mars full mission', async ({ page }) => {
  await openStart(page);
  await start(page, 'mars');

  await expect(page.getByRole('heading', { name: 'Message from Earth', exact: true })).toBeVisible();
  await expect(page.getByText('Real storm from NASA')).toHaveCount(0);

  await planAndStart(page, 'sol', 1);
  await expect(page.getByRole('heading', { name: 'Sol 1 report' })).toBeVisible();
  await expect(page.getByText(/Message from Earth arrived/)).toBeVisible();
  await page.getByRole('button', { name: /^(Next sol|Go to sol|See how the mission went)/ }).click();

  const final = page.getByRole('heading', { name: 'What really happened' });
  if (!(await final.isVisible())) {
    await expect(page.getByRole('heading', { name: 'Sol 2 of 10' })).toBeVisible();
    await playOut(page, 'mars', 2);
  }
  await expectEnd(page);
  await page.getByRole('button', { name: 'Play again' }).click();
  // Play again keeps the site (state.ts playAgain): a Mars mission restarts on Mars.
  await expect(page.getByRole('heading', { name: 'Sol 1 of 10' })).toBeVisible();
});

test('Data used panel', async ({ page }) => {
  await openStart(page);
  await page.getByRole('button', { name: /Data used/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Data used' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Archived (retrieved');
  await expect(dialog).toContainText('DONKI');
  await expect(dialog).toContainText('OSDR');
  await expect(dialog).not.toContainText('µGy');
  await expect(dialog).not.toContainText('631');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('Live banner falls back to archived wording', async ({ page }) => {
  await openStart(page);
  await expect(page.getByText(/playing with archived NASA records \(retrieved/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Live from NASA/)).toHaveCount(0);
});

for (const site of ['moon', 'mars'] as const) {
  test(`Offline ${site} mission`, async ({ page, context }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openStart(page);
    if (site === 'mars') await expect(page.getByRole('radio', { name: /Mars/ })).toBeEnabled({ timeout: 20_000 });
    await context.setOffline(true);
    await start(page, site);
    await playOut(page, site);
    await expectEnd(page);
    expect(errors).toEqual([]);
  });
}

test('Privacy: same-origin only, no cookies, mbc. storage', async ({ page, context }) => {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await openStart(page);
  await start(page, 'moon');
  await playOut(page, 'moon');
  await expectEnd(page);

  const external = urls.filter((u) => !u.startsWith('data:') && !u.startsWith('blob:') && new URL(u).origin !== 'http://localhost:4174');
  expect(external).toEqual([]);
  expect(await context.cookies()).toHaveLength(0);
  const keys = await page.evaluate(() => Object.keys(localStorage));
  for (const k of keys) expect(k.startsWith('mbc.')).toBe(true);
});

test('Resume after reload', async ({ page }) => {
  await openStart(page);
  await start(page, 'moon');
  for (const n of [1, 2]) {
    await planAndStart(page, 'day', n);
    await expect(page.getByRole('heading', { name: `Day ${n} report` })).toBeVisible();
    await page.getByRole('button', { name: NEXT }).click();
    await expect(page.getByRole('heading', { name: `Day ${n + 1} of 10` })).toBeVisible();
  }
  await page.reload();
  const cont = page.getByRole('button', { name: 'Continue mission (Day 3)' });
  await expect(cont).toBeVisible();
  await cont.click();
  await expect(page.getByRole('heading', { name: 'Day 3 of 10' })).toBeVisible();
});

// A3 C4: the deployed CSP (netlify.toml) has no 'unsafe-eval'. Serve the page with that exact
// header and play a whole mission on each site; the browser must report no CSP violation.
for (const site of ['moon', 'mars'] as const) {
  test(`Strict netlify.toml CSP: no violations (${site})`, async ({ page }) => {
    const csp = /Content-Security-Policy = "([^"]+)"/.exec(readFileSync('netlify.toml', 'utf8'))?.[1];
    expect(csp).toBeTruthy();
    await page.route('/', async (route) => {
      const res = await route.fetch();
      await route.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': csp! } });
    });
    await page.addInitScript(() => {
      (window as unknown as { cspViolations: string[] }).cspViolations = [];
      document.addEventListener('securitypolicyviolation', (e) =>
        (window as unknown as { cspViolations: string[] }).cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`),
      );
    });
    await openStart(page);
    await start(page, site);
    await playOut(page, site);
    await expectEnd(page);
    expect(await page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations)).toEqual([]);
  });
}
