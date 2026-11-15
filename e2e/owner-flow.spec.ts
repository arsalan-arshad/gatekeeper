import { expect, test } from '@playwright/test';

const E2E_SECRET = process.env.E2E_SECRET || 'local-e2e-secret';
const email = `e2e-${Date.now()}@example.com`;
const handle = `e2e${Date.now().toString(36).slice(-6)}`;

test.describe.configure({ mode: 'serial' });

test('owner flow: login, interview, publish, inbox approve, sign out', async ({ page }) => {
  // 1. Login via test magic link
  await page.goto('/e2e/login');
  await page.getByTestId('e2e-email').fill(email);
  await page.getByTestId('e2e-secret').fill(E2E_SECRET);
  await page.getByTestId('e2e-submit').click();
  await expect(page.getByRole('heading', { name: 'Set up your front door' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(new RegExp(`Signed in as ${email}`, 'i'))).toBeVisible();

  // 2. Interview
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

  // 3. After publish → dashboard
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();

  // 4. Submit request to own public page
  await page.goto(`/@${handle}`);
  await expect(page.getByRole('heading', { name: /Request an intro/i })).toBeVisible();
  await page.locator('input[name="senderName"]').fill('Casey Sender');
  await page.locator('input[name="senderContact"]').fill('casey@example.com');
  await page
    .locator('textarea[name="message"]')
    .fill(
      'Peer founder shipping usage-based billing — would love a short intro to compare Stripe edge cases.',
    );
  await page.getByRole('button', { name: 'Submit request' }).click();
  await expect(page.getByText(/Request received/i)).toBeVisible({ timeout: 60_000 });

  // 5. See inbox
  await page.goto('/dashboard');
  await expect(page.getByText('Casey Sender')).toBeVisible({ timeout: 15_000 });

  // 6. Approve — toast + status badge
  await page.getByRole('button', { name: 'Approve intro' }).first().click();
  await expect(page.getByTestId('inbox-toast')).toHaveText(/Intro sent to Casey Sender/i);
  await expect(page.getByTestId('inbox-status-badge').first()).toHaveText(/accepted/i);
  await expect(page.getByText('Casey Sender')).toBeVisible({ timeout: 15_000 });

  // 7. Sign out
  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await expect(page.getByRole('button', { name: 'Email me a magic link' })).toBeVisible({
    timeout: 15_000,
  });
});
