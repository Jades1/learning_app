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

test('multi-file: create blank file, switch back, selection persists across reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^Build$/ })).toBeVisible();

  // File 1 = the seed graph.
  const seedBtn = page.getByRole('button', { name: /Load .*seed/ });
  if (await seedBtn.isVisible().catch(() => false)) await seedBtn.click();
  await expect(page.getByText('Claude Code', { exact: true })).toBeVisible();

  // Create a second file — it must be a BLANK canvas (no seed node) and become active.
  await page.locator('.filepicker__current').click();
  await page.getByRole('button', { name: /New file/ }).click();
  await expect(page.getByText('Claude Code', { exact: true })).toHaveCount(0);
  await expect(page.locator('.filepicker__current')).toContainText('File 2');

  // Switch back to File 1 — the seed content returns (proves per-file scoping).
  // Scope to the panel: an empty File 2 also shows a "Load Learning Claude seed" button.
  await page.locator('.filepicker__current').click();
  await page.locator('.filepicker__panel button.filepicker__name', { hasText: 'Learning Claude' }).click();
  await expect(page.getByText('Claude Code', { exact: true })).toBeVisible();

  // Selection is persisted (localStorage pointer) — reload stays on File 1.
  await page.reload();
  await expect(page.getByText('Claude Code', { exact: true })).toBeVisible();
});
