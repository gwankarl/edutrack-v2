import { expect, test } from '@playwright/test';

test.describe('EduTrack frontend smoke tests', () => {
  test('loads the home page and displays EduTrack content', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle('EduTrack');
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'EduTrack' })).toBeVisible();
    await expect(page.getByText('Learning starts here.')).toBeVisible();
  });

  test('shows not found and supports header and browser history navigation', async ({ page }) => {
    await page.goto('/not-a-real-route');

    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await expect(page.getByText('The page you requested doesn’t exist.')).toBeVisible();

    const primaryNavigation = page.getByRole('navigation', {
      name: 'Primary navigation',
    });

    await primaryNavigation.getByRole('link', { name: 'Home' }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { level: 1, name: 'EduTrack' })).toBeVisible();

    await page.goBack();

    await expect(page).toHaveURL('/not-a-real-route');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();

    await page.goForward();

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { level: 1, name: 'EduTrack' })).toBeVisible();
  });

  test('keeps the main layout and navigation usable at desktop and mobile widths', async ({
    page,
  }) => {
    await page.goto('/');

    const viewportSizes = [
      { width: 1280, height: 800 },
      { width: 375, height: 812 },
    ];

    for (const viewport of viewportSizes) {
      await page.setViewportSize(viewport);

      await expect(page.getByRole('banner')).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
      await expect(
        page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', {
          name: 'Home',
        }),
      ).toBeVisible();
      await expect(page.getByRole('main')).toBeVisible();

      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );

      expect(hasHorizontalOverflow).toBe(false);
    }
  });
});
