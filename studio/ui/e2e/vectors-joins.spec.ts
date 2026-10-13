// Vectors and joins end to end, against a temp copy of
// privacy-safe-sharing's requests over small synthesized source and twin
// cohorts (global-setup.ts).
import { expect, test } from './harness.ts'

test.use({ workspace: 'privacy-safe-sharing', viewport: { width: 1600, height: 1000 } })

test('a vector draws its member wires, feeds its matrix and previews member stats', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'req/09_correlation_matrix.json' }).click()
  const graph = page.getByTestId('request-graph')
  await expect(graph.getByTestId('lane-title')).toHaveText(['source', 'twin'])
  const vector = graph.locator('[data-path="requests[0].vectors[0]"]')
  await expect(vector).toContainText('drivers')
  await expect(vector.locator('.gnode-row:not(.port)[data-row^="fields["]')).toHaveCount(6)
  await expect(vector.locator('[data-row="fields[6]"]')).toHaveClass(/port/)
  await expect(vector.locator('.gnode-row.unresolved')).toHaveCount(0)
  await expect(graph.locator('[data-path="requests[0].matrices[0]"] [data-row="vector"]')).not.toHaveClass(/unresolved/)
  const preview = vector.locator('[data-testid="preview"]')
  await expect(preview).toHaveAttribute('data-state', 'ok')
  await expect(preview).toContainText('6 members')

  await vector.click()
  const inspector = page.getByTestId('inspector')
  await expect(inspector).toHaveAttribute('data-node', 'requests[0].vectors[0]')
  await expect(inspector.locator('[data-field="coerce"] select')).toHaveValue('binary')
  await expect(inspector.locator('[data-field="kind"] select')).toHaveValue('')
  await expect(page.getByTestId('dirty-state')).toHaveText('saved')
})
