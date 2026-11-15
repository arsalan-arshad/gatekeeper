import { expect, test, type Page } from '@playwright/test';

const E2E_SECRET = process.env.E2E_SECRET || 'local-e2e-secret';

async function openMobileMenu(page: Page) {
  const toggle = page.getByTestId('mobile-nav-toggle');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-label', 'Open menu');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(toggle).toHaveAttribute('aria-label', 'Close menu');
  await expect(page.getByTestId('mobile-nav-menu')).toBeVisible();
}

test.describe('E2E follow-ups: ledger demo badge + mobile nav', () => {
  for (const width of [375, 450] as const) {
    test(`mobile nav hamburger at ${width}px: aria-expanded, Escape, link close`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 812 });
      await page.goto('/');

      await expect(page.getByTestId('desktop-nav-links')).toBeHidden();
      await expect(page.getByTestId('mobile-nav-toggle')).toHaveAttribute(
        'aria-label',
        'Open menu',
      );
      await expect(page.getByTestId('mobile-nav-toggle')).not.toHaveText(/Menu/i);
      await openMobileMenu(page);

      await page.keyboard.press('Escape');
      await expect(page.getByTestId('mobile-nav-toggle')).toHaveAttribute('aria-expanded', 'false');
      await expect(page.getByTestId('mobile-nav-toggle')).toHaveAttribute(
        'aria-label',
        'Open menu',
      );
      await expect(page.getByTestId('mobile-nav-menu')).toBeHidden();

      await openMobileMenu(page);
      await page.getByTestId('mobile-nav-menu').getByRole('link', { name: 'Ledger' }).click();
      await expect(page).toHaveURL(/\/ledger/);
      // Menu should close after navigation / link click.
      await expect(page.getByTestId('mobile-nav-toggle')).toHaveAttribute('aria-expanded', 'false');
    });
  }

  test('Demo data badge visible on global ledger when empty/demo', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/ledger');
    await expect(page.getByTestId('demo-data-badge')).toBeVisible();
    await expect(page.getByTestId('demo-data-badge')).toHaveText('Demo data — sample stats');
  });

  test('Demo data badge visible on /@demo/ledger', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/@demo/ledger');
    await expect(page.getByTestId('demo-data-badge')).toBeVisible();
    await expect(page.getByTestId('demo-data-badge')).toHaveText('Demo data — sample stats');
  });
});

test.describe('E2E follow-ups: inbox toast + status badge', () => {
  test('approve shows toast and updates status badge', async ({ page }) => {
    const email = `e2e-toast-${Date.now()}@example.com`;
    const handle = `e2et${Date.now().toString(36).slice(-6)}`;

    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto('/e2e/login');
    await page.getByTestId('e2e-email').fill(email);
    await page.getByTestId('e2e-secret').fill(E2E_SECRET);
    await page.getByTestId('e2e-submit').click();
    await expect(page.getByRole('heading', { name: 'Set up your front door' })).toBeVisible({
      timeout: 20_000,
    });

    const answers = [
      `I am ${handle}, indie SaaS founder building billing tools.`,
      'Peer founders and early customers with a concrete use case.',
      'Crypto, NFT, and generic agency pitches.',
      'No clear ask, or cold sales without context.',
      'Short async note with who you are and why it fits.',
    ];

    for (let i = 0; i < answers.length; i++) {
      await page.getByPlaceholder('Type your answer…').fill(answers[i]!);
      if (i < answers.length - 1) {
        await page.getByRole('button', { name: 'Continue' }).click();
      } else {
        await page.getByRole('button', { name: 'Draft my rules' }).click();
      }
    }

    await expect(page.getByRole('heading', { name: 'Edit your gate rules' })).toBeVisible({
      timeout: 20_000,
    });
    await page.locator('label:has-text("Public handle") input').fill(handle);
    await page.getByRole('button', { name: 'Publish my Gatekeeper' }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

    await page.goto(`/@${handle}`);
    await page.locator('input[name="senderName"]').fill('Lena Hoffmann');
    await page.locator('input[name="senderContact"]').fill('lena@example.com');
    await page
      .locator('textarea[name="message"]')
      .fill(
        'Peer founder shipping usage-based billing — would love a short intro to compare Stripe edge cases.',
      );
    await page.getByRole('button', { name: 'Submit request' }).click();
    await expect(page.getByText(/Request received/i)).toBeVisible({ timeout: 60_000 });

    await page.goto('/dashboard');
    await expect(page.getByText('Lena Hoffmann')).toBeVisible({ timeout: 15_000 });

    const row = page.getByTestId('inbox-row').filter({ hasText: 'Lena Hoffmann' });
    await expect(row.getByTestId('inbox-status-badge')).toBeVisible();

    await row.getByRole('button', { name: 'Approve intro' }).click();
    await expect(page.getByTestId('inbox-toast')).toHaveText(/Intro sent to Lena Hoffmann/i);
    await expect(row.getByTestId('inbox-status-badge')).toHaveText(/accepted/i);
    await expect(row.getByTestId('inbox-verdict-badge')).toContainText(/Owner:\s*Approved/i);
  });
});
