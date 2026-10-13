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

test('a join draws its keys and joined fields, previews joined rows and flags an unknown right cohort', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'req/10_exact_record_match.json' }).click()
  const graph = page.getByTestId('request-graph')
  await expect(graph.getByTestId('lane-title')).toHaveText(['control_source_vs_itself', 'twin_vs_source'])
  const join = graph.locator('[data-path="requests[0].joins[0]"]')
  await expect(join).toContainText('Join')
  await expect(join).toContainText('inner')
  // Eleven key pairs, every left key wired from the cohort.
  await expect(join.locator('.gnode-row:not(.port)[data-row$=".left_field"]')).toHaveCount(11)
  await expect(join.locator('.gnode-row.unresolved')).toHaveCount(0)
  // The right cohort's fields, prefixed with as, are the join's outputs.
  const joined = join.getByTestId('joined-fields')
  await expect(joined).toHaveAttribute('data-state', 'known')
  await expect(joined.locator('[data-field="src_products_held"]')).toBeVisible()
  await expect(joined.locator('[data-field="src_region"] .react-flow__handle')).toHaveCount(1)
  const preview = join.locator('[data-testid="preview"]')
  await expect(preview).toHaveAttribute('data-state', 'ok')
  await expect(preview).toContainText('joined rows')

  // The inspector edits the join; an unknown right cohort is a node issue.
  await join.click()
  const inspector = page.getByTestId('inspector')
  await expect(inspector).toHaveAttribute('data-node', 'requests[0].joins[0]')
  await expect(inspector.locator('[data-field="right"] input')).toHaveValue('customers.pulse')
  await expect(inspector.locator('[data-field="kind"] select')).toHaveValue('inner')
  await expect(inspector.getByTestId('join-pairs').locator('.insp-pair')).toHaveCount(11)
  await inspector.locator('[data-field="right"] input').fill('ghost.pulse')
  await expect(page.getByTestId('dirty-state')).toContainText('unsaved')
  await expect(joined).toHaveAttribute('data-state', 'missing')
  await expect(join.getByTestId('node-badge')).toHaveAttribute('data-severity', 'error')
  await inspector.locator('[data-field="right"] input').fill('twin.pulse')
  await expect(joined).toHaveAttribute('data-state', 'known')
})
