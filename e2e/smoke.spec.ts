import { expect, test, type Page } from '@playwright/test';

test.setTimeout(120_000);

type Site = 'moon' | 'mars';

async function openStart(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start mission' })).toBeVisible({ timeout: 3_000 });
}

async function start(page: Page, site: Site) {
  if (site === 'mars') {
    const mars = page.getByRole('radio', { name: /Mars/ });
    await expect(mars).toBeEnabled({ timeout: 20_000 });
    await mars.check();
  }
  await page.getByRole('button', { name: 'Start mission' }).click();
  await expect(page.getByRole('heading', { name: site === 'moon' ? 'Day 1 of 10' : 'Sol 1 of 10' })).toBeVisible();
}

/** Plays from day/sol `from` until the end screen (does not click "Play again"). */
async function playOut(page: Page, site: Site, from = 1, maxTurns = 10) {
  const word = site === 'moon' ? 'Day' : 'Sol';
  const lower = word.toLowerCase();
  for (let n = from; n <= maxTurns; n++) {
    await page.getByRole('button', { name: `Run ${lower} ${n}` }).click();
    await expect(page.getByRole('heading', { name: `${word} ${n} report` })).toBeVisible();
    const final = page.getByRole('button', { name: 'See how the mission went' });
    if (await final.isVisible()) {
      await final.click();
      break;
    }
    await page.getByRole('button', { name: `Next ${lower}` }).click();
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

  await expect(page.getByText(/^Real (event|quiet day)$/)).toBeVisible();
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

  await expect(page.getByRole('heading', { name: 'Message from Earth' })).toBeVisible();
  await expect(page.getByText('Arrives tomorrow')).toBeVisible();
  await expect(page.getByText('Real event')).toHaveCount(0);

  await page.getByRole('button', { name: 'Run sol 1' }).click();
  await expect(page.getByRole('heading', { name: 'Sol 1 report' })).toBeVisible();
  await expect(page.getByText(/Message from Earth arrived/)).toBeVisible();
  await page.getByRole('button', { name: /Next sol|See how the mission went/ }).click();

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
  await expect(page.getByText(/Live NASA feed unavailable/)).toBeVisible({ timeout: 15_000 });
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

  const external = urls.filter((u) => !u.startsWith('data:') && !u.startsWith('blob:') && new URL(u).origin !== 'http://localhost:4173');
  expect(external).toEqual([]);
  expect(await context.cookies()).toHaveLength(0);
  const keys = await page.evaluate(() => Object.keys(localStorage));
  for (const k of keys) expect(k.startsWith('mbc.')).toBe(true);
});

test('Resume after reload', async ({ page }) => {
  await openStart(page);
  await start(page, 'moon');
  for (const n of [1, 2]) {
    await page.getByRole('button', { name: `Run day ${n}` }).click();
    await expect(page.getByRole('heading', { name: `Day ${n} report` })).toBeVisible();
    await page.getByRole('button', { name: 'Next day' }).click();
    await expect(page.getByRole('heading', { name: `Day ${n + 1} of 10` })).toBeVisible();
  }
  await page.reload();
  const cont = page.getByRole('button', { name: 'Continue mission (Day 3)' });
  await expect(cont).toBeVisible();
  await cont.click();
  await expect(page.getByRole('heading', { name: 'Day 3 of 10' })).toBeVisible();
});
