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
