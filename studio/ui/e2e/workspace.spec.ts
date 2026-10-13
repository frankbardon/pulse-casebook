// Flows that write files, each against its own temp copy of
// ab-test-readout (harness.ts): saving an edit, creating an analysis,
// saving and reloading a layout sidecar, and saving a run to out/.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { analysisAt, analysisRow, catalogRow, expect, openCohorts, test } from './harness.ts'

test.use({ workspace: 'ab-test-readout' })

test('an inspector edit saves to disk as a one-line change', async ({ page, studio }) => {
  const before = studio.read('analyses/04_metric_battery.json')
  await page.goto('/')
  await analysisRow(page, '04_metric_battery.json').click()
  const graph = page.getByTestId('request-graph')
  await graph.locator('[data-path="tests[0]"]').click()
  await page.getByTestId('inspector').locator('[data-field="success"] input').fill('no')
  await expect(page.getByTestId('dirty-state')).toContainText('unsaved')
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByTestId('dirty-state')).toHaveText('saved')

  const after = studio.read('analyses/04_metric_battery.json')
  const changed = after.split('\n').filter((line, i) => line !== before.split('\n')[i])
  expect(after.split('\n')).toHaveLength(before.split('\n').length)
  expect(changed).toHaveLength(1)
  expect(changed[0]).toContain('"success": "no"')
})

test('New analysis on a cohort creates a file bound to it, opens it, and never overwrites', async ({ page, studio }) => {
  await page.goto('/')
  await openCohorts(page)
  await catalogRow(page, 'cohort', 'cohorts/ab_test.pulse', 'local').click()
  await page.getByTestId('cohort-new-request').click()
  await expect(page.getByTestId('nav-analyses')).toHaveAttribute('aria-selected', 'true')
  const form = page.getByTestId('new-request')
  await expect(page.getByTestId('new-cohort')).toHaveValue('cohorts/ab_test.pulse')
  await expect(page.getByTestId('new-dir')).toHaveValue('analyses')
  await page.getByTestId('new-name').fill('fresh')
  await expect(form).toContainText('analyses/fresh.json')
  await page.getByTestId('new-create').click()

  // Opened as a graph over the cohort, and on disk.
  const graph = page.getByTestId('request-graph')
  await expect(graph.locator('[data-path="cohort"]')).toContainText('ab_test.pulse')
  await expect(graph.locator('[data-path="cohort"] [data-testid="preview"]')).toContainText('40,000 rows')
  await expect(analysisRow(page, 'fresh.json')).toBeVisible()
  expect(JSON.parse(studio.read('analyses/fresh.json'))).toEqual({ cohort: { filename: 'ab_test.pulse', data_dir: 'cohorts' } })
  await expect(analysisRow(page, 'fresh.json').getByTestId('mode-badge')).toHaveText('Standalone')

  // Build on it and save: the new file runs.
  await page.getByTestId('palette-toggle').click()
  await page.getByTestId('palette').getByTestId('palette-search').fill('AGG_COUNT')
  await page.getByTestId('palette').locator('[data-op="AGG_COUNT"]').click()
  await page.getByTestId('inspector').locator('[data-field="field"] input').fill('user_id')
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByTestId('dirty-state')).toHaveText('saved')
  expect(JSON.parse(studio.read('analyses/fresh.json')).aggregations).toEqual([{ type: 'AGG_COUNT', label: 'count', field: 'user_id' }])
  await page.getByTestId('run-button').click()
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-phase', 'done', { timeout: 30_000 })
  await expect(graph.locator('[data-path="aggregations[0]"] [data-testid="node-run"]')).toHaveText('40,000')

  // The same name again is refused; the file is untouched.
  const saved = studio.read('analyses/fresh.json')
  await page.getByTestId('new-request-open').click()
  await page.getByTestId('new-name').fill('fresh')
  await page.getByTestId('new-create').click()
  await expect(page.getByTestId('new-error')).toContainText(/exists/)
  expect(studio.read('analyses/fresh.json')).toBe(saved)
})

test('a dragged layout saves to a sidecar and comes back on reopen', async ({ page, studio }) => {
  const request = studio.read('analyses/04_metric_battery.json')
  await page.goto('/')
  await analysisRow(page, '04_metric_battery.json').click()
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
  expect(studio.read('analyses/04_metric_battery.json')).toBe(request)
  const sidecar = JSON.parse(studio.read('analyses/04_metric_battery.layout.json')) as { version: number; nodes: Record<string, unknown> }
  expect(sidecar.version).toBe(1)
  expect(Object.keys(sidecar.nodes)).toEqual(['tests[0]'])

  // A fresh page lays the node out where it was saved.
  await page.reload()
  await analysisRow(page, '04_metric_battery.json').click()
  await expect(page.getByTestId('dirty-state')).toHaveText('saved')
  const back = (await node.boundingBox())!
  expect(Math.abs(back.x - moved.x)).toBeLessThan(2)
  expect(Math.abs(back.y - moved.y)).toBeLessThan(2)
  // The sidecar is not listed as an analysis.
  await expect(analysisRow(page, '04_metric_battery.layout.json')).toHaveCount(0)
})

test('a run saves to out/ for real and refuses to overwrite until confirmed', async ({ page, studio }) => {
  expect(studio.exists('out/11_readout.json')).toBe(false)
  await page.goto('/')
  await analysisRow(page, '11_readout.compose.json').click()
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

  // Envelopes are not analyses: the list leaves them out.
  await page.reload()
  await expect(analysisRow(page, '11_readout.compose.json')).toBeVisible()
  await expect(page.locator('[data-testid="analysis-row"][data-path^="out/"]')).toHaveCount(0)
})

test('grouper fit and post-test partition_by edit as first-class fields', async ({ page, studio }) => {
  const rel = 'analyses/50_partitioned.json'
  const request = {
    cohort: { filename: 'ab_test.pulse', data_dir: 'cohorts' },
    groups: [
      { type: 'GROUP_CATEGORY', field: 'region' },
      { type: 'GROUP_QUANTILE', field: 'pages_viewed', params: { n: 2 } },
      { type: 'GROUP_CATEGORY', field: 'arm' },
    ],
    aggregations: [
      { type: 'AGG_AVERAGE', field: 'revenue', label: 'rev' },
      { type: 'AGG_AVERAGE', field: 'pages_viewed', label: 'pv' },
    ],
    post_tests: [{ type: 'TEST_PEARSON_R', field: 'rev', field2: 'pv', params: { variant: 'pearson_post', partition_by: ['region'] } }],
  }
  writeFileSync(join(studio.ws, rel), JSON.stringify(request, null, 2) + '\n')
  await page.goto('/')
  await analysisAt(page, rel).click()
  const graph = page.getByTestId('request-graph')
  const inspector = page.getByTestId('inspector')

  // The partition key is wired from the cohort field the grouper keys on.
  await expect(graph.locator('[data-path="post_tests[0]"] [data-row="params.partition_by[0]"]')).not.toHaveClass(/unresolved/)
  await expect(graph.locator('[data-path="post_tests[0]"] [data-row="params.partition_by[1]"]')).toContainText('wire to add')

  await graph.locator('[data-path="groups[1]"]').click()
  const fit = inspector.locator('[data-field="fit"]')
  await expect(fit).toContainText('within: refit per bucket')
  await fit.locator('select').selectOption('within')

  await graph.locator('[data-path="post_tests[0]"]').click()
  await inspector.getByTestId('partition-keys').getByRole('button', { name: 'Add pages_viewed' }).click()
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByTestId('dirty-state')).toHaveText('saved')

  const saved = JSON.parse(studio.read(rel)) as typeof request & { groups: { params?: { fit?: string } }[] }
  expect(saved.groups[1].params).toEqual({ n: 2, fit: 'within' })
  expect(saved.post_tests[0].params.partition_by).toEqual(['region', 'pages_viewed'])
})
