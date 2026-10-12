import { expect, test } from '@playwright/test'

// Placeholder smoke test: the embedded shell loads and reaches the API.
test('studio shell loads', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Pulse Studio' })).toBeVisible()
  await expect(page.getByTestId('studio-dir')).toHaveText('ab-test-readout')
})
