import { test, expect } from '@playwright/test';

// Smoke of the real risk areas that are painful to verify by hand: the app boots past its
// loading state, the seed graph loads, data SURVIVES A RELOAD (IndexedDB/Dexie), and Study
// mode opens with due cards. Deliberately avoids flaky canvas-coordinate drag simulation —
// it asserts stable, high-signal outcomes. Extend as new flows land.

test('boots, loads seed, persists across reload, opens study', async ({ page }) => {
  await page.goto('/');

  // App shell renders (past the "Loading…" state) — the Build/Study mode toggle is present.
  await expect(page.getByRole('button', { name: /^Build$/ })).toBeVisible();

  // Fresh profile => empty DB: load the "Learning Claude" seed if offered.
  const seedBtn = page.getByRole('button', { name: /Load .*seed/ });
  if (await seedBtn.isVisible().catch(() => false)) {
    await seedBtn.click();
  }

  // A known seed node is on the canvas.
  await expect(page.getByText('Claude Code', { exact: true })).toBeVisible();

  // Persistence: reload and the node survives (this is the data-safety guarantee).
  await page.reload();
  await expect(page.getByText('Claude Code', { exact: true })).toBeVisible();

  // Study mode opens with due cards.
  const studyBtn = page.getByRole('button', { name: /^Study/ });
  await expect(studyBtn).toBeEnabled();
  await studyBtn.click();
  await expect(page.getByText(/Card 1 of/)).toBeVisible();
});
