// Flows that write files, each against its own temp copy of
// ab-test-readout (harness.ts): saving an edit, creating a request,
// saving and reloading a layout sidecar, and saving a run to out/.
import { expect, test } from './harness.ts'

test.use({ workspace: 'ab-test-readout' })

test('an inspector edit saves to disk as a one-line change', async ({ page, studio }) => {
  const before = studio.read('req/04_metric_battery.json')
  await page.goto('/')
  await page.getByRole('button', { name: 'req/04_metric_battery.json' }).click()
  const graph = page.getByTestId('request-graph')
  await graph.locator('[data-path="tests[0]"]').click()
  await page.getByTestId('inspector').locator('[data-field="success"] input').fill('no')
  await expect(page.getByTestId('dirty-state')).toContainText('unsaved')
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByTestId('dirty-state')).toHaveText('saved')

  const after = studio.read('req/04_metric_battery.json')
  const changed = after.split('\n').filter((line, i) => line !== before.split('\n')[i])
  expect(after.split('\n')).toHaveLength(before.split('\n').length)
  expect(changed).toHaveLength(1)
  expect(changed[0]).toContain('"success": "no"')
})

test('New request creates a file bound to the cohort, opens it, and never overwrites', async ({ page, studio }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'ab_test.pulse' }).click()
  await page.getByTestId('new-request-open').click()
  const form = page.getByTestId('new-request')
  await expect(page.getByTestId('new-cohort')).toHaveValue('ab_test.pulse')
  await expect(page.getByTestId('new-dir')).toHaveValue('req')
  await page.getByTestId('new-name').fill('fresh')
  await expect(form).toContainText('req/fresh.json')
  await page.getByTestId('new-create').click()

  // Opened as a graph over the cohort, and on disk.
  const graph = page.getByTestId('request-graph')
  await expect(graph.locator('[data-path="cohort"]')).toContainText('ab_test.pulse')
  await expect(graph.locator('[data-path="cohort"] [data-testid="preview"]')).toContainText('40,000 rows')
  await expect(page.getByRole('button', { name: 'req/fresh.json' })).toBeVisible()
  expect(JSON.parse(studio.read('req/fresh.json'))).toEqual({ cohort: { filename: 'ab_test.pulse', data_dir: '.' } })

  // Build on it and save: the new file runs.
  await page.getByTestId('palette-toggle').click()
  await page.getByTestId('palette').getByTestId('palette-search').fill('AGG_COUNT')
  await page.getByTestId('palette').locator('[data-op="AGG_COUNT"]').click()
  await page.getByTestId('inspector').locator('[data-field="field"] input').fill('user_id')
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByTestId('dirty-state')).toHaveText('saved')
  expect(JSON.parse(studio.read('req/fresh.json')).aggregations).toEqual([{ type: 'AGG_COUNT', label: 'count', field: 'user_id' }])
  await page.getByTestId('run-button').click()
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-phase', 'done', { timeout: 30_000 })
  await expect(graph.locator('[data-path="aggregations[0]"] [data-testid="node-run"]')).toHaveText('40,000')

  // The same name again is refused; the file is untouched.
  const saved = studio.read('req/fresh.json')
  await page.getByTestId('new-request-open').click()
  await page.getByTestId('new-name').fill('fresh')
  await page.getByTestId('new-create').click()
  await expect(page.getByTestId('new-error')).toContainText(/exists/)
  expect(studio.read('req/fresh.json')).toBe(saved)
})

test('a dragged layout saves to a sidecar and comes back on reopen', async ({ page, studio }) => {
  const request = studio.read('req/04_metric_battery.json')
  await page.goto('/')
  await page.getByRole('button', { name: 'req/04_metric_battery.json' }).click()
  const node = page.getByTestId('request-graph').locator('.react-flow__node[data-id="tests[0]"]')
  await expect(page.getByTestId('dirty-state')).toHaveText('saved')
  const before = (await node.boundingBox())!
  await node.hover()
  await page.mouse.down()
  await page.mouse.move(before.x + before.width / 2 + 60, before.y + before.height / 2 + 140, { steps: 8 })
  await page.mouse.up()
  const moved = (await node.boundingBox())!
  expect(moved.y).toBeGreaterThan(before.y + 40)
  await expect(page.getByTestId('dirty-state')).toContainText('unsaved')
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByTestId('dirty-state')).toHaveText('saved')

  // Only the sidecar changed, and it holds just the placed node.
  expect(studio.read('req/04_metric_battery.json')).toBe(request)
  const sidecar = JSON.parse(studio.read('req/04_metric_battery.layout.json')) as { version: number; nodes: Record<string, unknown> }
  expect(sidecar.version).toBe(1)
  expect(Object.keys(sidecar.nodes)).toEqual(['tests[0]'])

  // A fresh page lays the node out where it was saved.
  await page.reload()
  await page.getByRole('button', { name: 'req/04_metric_battery.json' }).click()
  await expect(page.getByTestId('dirty-state')).toHaveText('saved')
  const back = (await node.boundingBox())!
  expect(Math.abs(back.x - moved.x)).toBeLessThan(2)
  expect(Math.abs(back.y - moved.y)).toBeLessThan(2)
  // The sidecar is not listed as a request.
  await expect(page.getByRole('button', { name: 'req/04_metric_battery.layout.json' })).toBeDisabled()
})

test('a run saves to out/ for real and refuses to overwrite until confirmed', async ({ page, studio }) => {
  expect(studio.exists('out/11_readout.json')).toBe(false)
  await page.goto('/')
  await page.getByRole('button', { name: 'req/11_readout.compose.json' }).click()
  await expect(page.getByTestId('request-graph').getByTestId('lane-title')).toHaveCount(4)
  await page.getByTestId('run-button').click()
  const panel = page.getByTestId('results-panel')
  await expect(panel.getByTestId('run-status')).toHaveAttribute('data-phase', 'done', { timeout: 30_000 })
  await expect(panel.getByTestId('save-out-name')).toHaveValue('11_readout.json')

  await panel.getByTestId('save-out').click()
  await expect(panel.getByTestId('save-out-done')).toContainText('saved out/11_readout.json')
  const first = studio.read('out/11_readout.json')
  const env = JSON.parse(first) as { format_version: string; errors: unknown[]; data: { responses: unknown[] } }
  expect(env.format_version).toBe('1.1')
  expect(env.errors).toEqual([])
  expect(env.data.responses).toHaveLength(4)
  // The CLI's writeJSON shape: 2-space indent, trailing newline.
  expect(first.startsWith('{\n  "')).toBe(true)
  expect(first.endsWith('}\n')).toBe(true)

  // A second save finds the file and only replaces it when confirmed.
  await panel.getByTestId('save-out').click()
  await expect(panel.getByTestId('save-out-exists')).toContainText('out/11_readout.json exists')
  await panel.getByTestId('save-out-overwrite').click()
  await expect(panel.getByTestId('save-out-done')).toContainText('replaced out/11_readout.json')
  expect(JSON.parse(studio.read('out/11_readout.json')).data).toEqual(env.data)

  // Another name lands beside it.
  await panel.getByTestId('save-out-name').fill('11_readout_copy.json')
  await panel.getByTestId('save-out').click()
  await expect(panel.getByTestId('save-out-done')).toContainText('saved out/11_readout_copy.json')
  expect(studio.exists('out/11_readout_copy.json')).toBe(true)

  // Envelopes list as non-requests (the sidebar picks them up on reload).
  await page.reload()
  await expect(page.getByRole('button', { name: 'out/11_readout.json' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'out/11_readout.json' })).toHaveAttribute('title', /not a Pulse/)
})
