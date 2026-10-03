import { test, expect } from '@playwright/test';

test('production assets and game input work at the GitHub Pages repository path', async ({ page }) => {
  const errors: string[] = [], brokenAssets: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.url().includes('/assets/') && response.status() >= 400) brokenAssets.push(response.url());
  });
  await page.goto('./?seed=42');
  await expect(page.locator('#board')).toBeVisible();
  await expect(page.locator('#capacity-total')).toHaveText('7/24');
  await expect(page.locator('script[type="module"]')).toHaveAttribute('src', /^\/orbit\/assets\//);
  await expect(page.locator('link[rel="stylesheet"]')).toHaveAttribute('href', /^\/orbit\/assets\//);
  await page.locator('#hold').click();
  await expect(page.locator('#hold')).toBeDisabled();
  await page.locator('#board').focus();
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('Space');
  await expect(page.locator('#hold')).toBeEnabled();
  await page.reload();
  await expect(page.locator('#capacity-total')).toHaveText('7/24');
  expect(new URL(page.url()).pathname).toBe('/orbit/');
  expect(errors).toEqual([]); expect(brokenAssets).toEqual([]);
});
