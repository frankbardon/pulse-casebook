import { expect, test } from '@playwright/test'

// Placeholder smoke test: the embedded shell loads and reaches the API.
test('studio shell loads', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Pulse Studio' })).toBeVisible()
  await expect(page.getByTestId('studio-dir')).toHaveText('ab-test-readout')
})

test('opens a plain request as a stage-column graph', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'req/04_metric_battery.json' }).click()
  const graph = page.getByTestId('request-graph')
  await expect(graph).toBeVisible()
  await expect(graph.locator('[data-path="tests[2]"]')).toContainText('TEST_WELCH')
  await expect(graph.locator('[data-path="cohort"]')).toContainText('categorical_u8')
  await expect(graph.locator('.react-flow__edge')).toHaveCount(13)
})

test('compose files open to a not-yet-supported view', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'req/11_readout.compose.json' }).click()
  await expect(page.getByTestId('unsupported')).toContainText('not yet supported')
})

// Edits stay unsaved here: the smoke server serves the real showcase dir.
test('selecting a node opens the inspector and edits mark the file dirty', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'req/04_metric_battery.json' }).click()
  const graph = page.getByTestId('request-graph')
  await graph.locator('[data-path="tests[0]"]').click()
  const inspector = page.getByTestId('inspector')
  await expect(inspector).toHaveAttribute('data-node', 'tests[0]')
  const success = inspector.locator('[data-field="success"] input')
  await expect(success).toHaveValue('yes')
  await expect(page.getByTestId('dirty-state')).toHaveText('saved')
  await success.fill('no')
  await expect(page.getByTestId('dirty-state')).toContainText('unsaved')
  await expect(graph.locator('[data-path="tests[0]"]')).toContainText('no')
})

// Dragging stays unsaved here too; the save/reload round trip of the
// sidecar is covered against a temp dir by the Go and unit tests.
test('dragging a node moves it and marks the layout dirty', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'req/04_metric_battery.json' }).click()
  const node = page.getByTestId('request-graph').locator('.react-flow__node').filter({ has: page.locator('[data-path="tests[0]"]') })
  await expect(page.getByTestId('dirty-state')).toHaveText('saved')
  const before = await node.boundingBox()
  await node.hover()
  await page.mouse.down()
  await page.mouse.move(before!.x + before!.width / 2 + 120, before!.y + before!.height / 2 + 80, { steps: 8 })
  await page.mouse.up()
  const after = await node.boundingBox()
  expect(after!.x).toBeGreaterThan(before!.x + 20)
  await expect(page.getByTestId('dirty-state')).toContainText('unsaved')
})

// Previews run against the showcase cohort (40,000 rows, under the
// default --auto-preview-rows, so nothing is deferred).
test('nodes show live previews and an edit re-runs only downstream ones', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'req/08_cuped_welch.json' }).click()
  const graph = page.getByTestId('request-graph')
  const preview = (id: string) => graph.locator(`[data-path="${id}"] [data-testid="preview"]`)
  await expect(preview('cohort')).toHaveAttribute('data-state', 'ok')
  await expect(preview('cohort')).toContainText('40,000 rows')
  await expect(preview('aggregations[0]')).toContainText('users 40,000')
  await expect(preview('attributes[0]')).toHaveAttribute('data-state', 'ok')
  await expect(preview('tests[1]')).toHaveAttribute('data-state', 'ok')
  await expect(preview('tests[1]')).toContainText('p')
  const requests: string[] = []
  page.on('request', (r) => {
    if (r.url().endsWith('/api/preview')) requests.push(String(r.postDataJSON()?.nodes))
  })
  await graph.locator('[data-path="attributes[0]"]').click()
  await page.getByTestId('inspector').locator('[data-field="expression"] textarea').fill('pages_viewed - 0.5 * (prior_sessions - 10)')
  await expect.poll(() => requests.length).toBeGreaterThan(0)
  await expect(preview('attributes[0]')).toHaveAttribute('data-state', 'ok')
  await expect(preview('tests[1]')).toHaveAttribute('data-state', 'ok')
  // The cohort is upstream of the edit: its preview is not re-run.
  expect(requests.join(';')).toContain('attributes[0]')
  expect(requests.join(';')).not.toContain('cohort')
  await expect(graph.locator('.react-flow__edge')).not.toHaveCount(0)
})
