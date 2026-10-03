import { test, expect } from '@playwright/test';

test('one screen renders without overflow or runtime errors', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=42');
  await expect(page.getByRole('heading', { name: 'Find your orbit.' })).toBeVisible();
  await expect(page.locator('#capacity-total')).toHaveText('7/24');
  await expect(page.locator('#score')).toHaveText('0');
  await expect(page.locator('#lab')).toBeHidden();
  const layout = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
  expect(layout.content).toBeLessThanOrEqual(layout.width);
  await expect(page.locator('#restart')).toBeInViewport();
  await expect(page.locator('.instruction')).toBeInViewport();
  await page.screenshot({ path: `artifacts/${testInfo.project.name}-initial.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test('native touch capture launches and touch cancellation leaves the board unchanged', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Touch behavior is tested on the mobile profile.');
  await page.goto('/?seed=42');
  const board = await page.locator('#board').boundingBox();
  if (!board) throw new Error('Missing canvas');
  const x = board.x + board.width / 2, y = board.y + board.height / 2;
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + board.width * 0.3, y }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(page.locator('#capacity-total')).toHaveText('7/24');
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + board.width * 0.4, y }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('#capacity-total')).toHaveText('8/24');
});

test('small phone and reduced-motion layout keep play controls visible', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?seed=42');
  await expect(page.locator('#board')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('#restart')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('.instruction')).toBeInViewport({ ratio: 1 });
});

test('drag launches, dragging back cancels, and restart clears the run', async ({ page }, testInfo) => {
  await page.goto('/?seed=42&debug');
  await page.locator('#clear').click(); // Clear the inner orbit so this launch cannot merge yet.
  await page.locator('#close-lab').click();
  await expect(page.locator('#capacity-total')).toHaveText('5/24');
  const board = await page.locator('#board').boundingBox();
  if (!board) throw new Error('Missing canvas');
  const cx = board.x + board.width / 2, cy = board.y + board.height / 2;
  await page.mouse.move(cx, cy); await page.mouse.down();
  await page.mouse.move(cx + board.width * 116 / 640, cy, { steps: 12 });
  await page.screenshot({ path: `artifacts/${testInfo.project.name}-aim.png`, fullPage: true });
  await page.mouse.up();
  await expect(page.locator('#capacity-total')).toHaveText('6/24');
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(page.locator('#capacity-total')).toHaveText('7/24');
  await expect(page.locator('#score')).toHaveText('0');
  await page.mouse.move(cx, cy); await page.mouse.down();
  await page.mouse.move(cx + board.width * 0.3, cy, { steps: 6 });
  await page.mouse.move(cx, cy, { steps: 6 }); await page.mouse.up();
  await expect(page.locator('#capacity-total')).toHaveText('7/24');
});

test('lab pauses, inspects, spawns, merges, and updates score', async ({ page }) => {
  await page.goto('/?seed=42&debug');
  await page.locator('#pause').click();
  await expect(page.locator('#pause')).toHaveText('Resume');
  await page.locator('#clear').click();
  await page.locator('#merge').click();
  await expect(page.locator('#score')).toHaveText('20');
  await expect(page.locator('#capacity-0 .capacity-count')).toHaveText('1/6');
  await page.locator('#ring').selectOption('2');
  await page.locator('#value').fill('4');
  await page.locator('#spawn').click();
  await expect(page.locator('#capacity-2 .capacity-count')).toHaveText('3/10');
  await expect(page.locator('#inspection')).toContainText('merges=1');
  await page.locator('#speed').selectOption('2');
  await page.locator('#step').click();
  await expect(page.locator('#pause')).toHaveText('Resume');
  await page.getByRole('button', { name: 'Mute sound' }).click();
  await expect(page.getByRole('button', { name: 'Enable sound' })).toBeVisible();
});

test('capacity loss and the play-again control complete the loop', async ({ page }) => {
  await page.goto('/?seed=42&debug');
  await page.locator('#clear').click();
  await page.locator('#speed').selectOption('4');
  for (let i = 0; i < 21; i++) {
    await page.locator('#value').fill(String(i + 4));
    await page.locator('#angle').fill(String(i * 360 / 21));
    await page.locator('#spawn').click();
  }
  await expect(page.locator('#end-card')).toBeVisible({ timeout: 10000 });
  await page.locator('#close-lab').click();
  await page.getByRole('button', { name: 'One more orbit' }).click();
  await expect(page.locator('#end-card')).toBeHidden();
  await expect(page.locator('#capacity-total')).toHaveText('7/24');
});

test('keyboard launches and planet holding opens the hidden lab', async ({ page }) => {
  await page.goto('/?seed=42');
  await page.locator('#board').focus();
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('Space');
  await expect(page.locator('#capacity-total')).toHaveText('8/24');
  await page.keyboard.press('r');
  await expect(page.locator('#capacity-total')).toHaveText('7/24');
  const brand = await page.locator('#brand').boundingBox();
  if (!brand) throw new Error('Missing wordmark');
  await page.mouse.move(brand.x + 10, brand.y + 10); await page.mouse.down();
  await expect(page.locator('#lab')).toBeVisible();
  await page.mouse.up();
});
