// The library shell (W4), each test against its own temp copy of the
// ab-test-readout library template (harness.ts: one workspace,
// ab-test-readout, with a local ab_test.pulse; design.pulse is global):
// workspaces (create, switch, rename, remembered), the Analyses list with
// mode badges, search and mode filter; the Cohorts area with Global and
// Local apart; importing into a workspace with a GLOBAL saved schema; and
// Make global (happy path, and a name clash answered with the suggested
// name).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { analysisRow, catalogRow, expect, newAnalysis, openCohorts, test } from './harness.ts'

test.use({ workspace: 'ab-test-readout' })

const fixture = (name: string) => join(import.meta.dirname, 'fixtures', name)

const RETAIL_ORDERS = [
  { name: 'order_id', type: 'u16', description: '', nullable: false },
  { name: 'region', type: 'categorical_u8', description: '', nullable: false },
  { name: 'amount', type: 'f64', description: '', nullable: true },
  { name: 'qty', type: 'u16', description: '', nullable: false },
  { name: 'ordered_on', type: 'date', description: '', nullable: false },
  { name: 'returned', type: 'packed_bool', description: '', nullable: false },
]

test('analyses are listed with their mode; workspaces are created, switched, renamed and remembered', async ({ page, studio }) => {
  await page.goto('/')
  await expect(page.getByTestId('nav-analyses')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('workspace-select')).toHaveValue('ab-test-readout')

  // Mode badges and the one-line "what it runs".
  const readout = analysisRow(page, '11_readout.compose.json')
  await expect(readout.getByTestId('mode-badge')).toHaveText('Composed')
  await expect(readout).toContainText('several standalone runs together, results side by side')
  await expect(analysisRow(page, '02_srm_gof.facet.json').getByTestId('mode-badge')).toHaveText('Faceted')
  await expect(analysisRow(page, '04_metric_battery.json').getByTestId('mode-badge')).toHaveText('Standalone')
  await expect(analysisRow(page, '04_metric_battery.json')).toContainText('one cohort, one pass, one result')

  // Filter by mode, search by name.
  await page.getByTestId('analyses-mode').selectOption('composed')
  const rows = page.getByTestId('analysis-row')
  await expect(rows.first()).toBeVisible()
  expect(await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-mode')))).not.toContain('standalone')
  await page.getByTestId('analyses-mode').selectOption('all')
  await page.getByTestId('analyses-search').fill('metric bat')
  await expect(rows).toHaveCount(1)
  await expect(rows).toHaveAttribute('data-path', 'analyses/04_metric_battery.json')
  await rows.click()
  await expect(page.getByTestId('graph-mode')).toHaveText('Standalone')

  // A new workspace: empty, with New analysis on a global cohort.
  await page.getByTestId('workspace-create').click()
  await page.getByTestId('workspace-name-input').fill('Churn study')
  await page.getByTestId('workspace-name-save').click()
  await expect(page.getByTestId('workspace-select')).toHaveValue('churn-study')
  await expect(page.getByTestId('analyses-empty')).toBeVisible()
  await page.getByTestId('empty-new-analysis').click()
  await page.getByTestId('mode-card').first().click()
  await page.getByTestId('wizard-next').click()
  const only = page.getByTestId('cohort-option')
  await expect(only).toHaveCount(1)
  await expect(only).toHaveAttribute('data-scope', 'global')
  await expect(only.locator('input')).toBeChecked()
  await page.getByTestId('wizard-back').click()
  await newAnalysis(page, { mode: 'standalone', name: 'first' })
  await expect(page.getByTestId('request-graph').locator('[data-path="cohort"]')).toContainText('design.pulse')
  await expect(analysisRow(page, 'first.json').getByTestId('mode-badge')).toHaveText('Standalone')
  const first = JSON.parse(readFileSync(join(studio.dir, 'workspaces/churn-study/analyses/first.json'), 'utf8'))
  expect(first).toEqual({ cohort: { filename: 'design.pulse', data_dir: '_global/cohorts' } })

  // Rename: the display name changes, the folder (slug) stays.
  await page.getByTestId('workspace-rename').click()
  await page.getByTestId('workspace-name-input').fill('Churn 2026')
  await page.getByTestId('workspace-name-save').click()
  await expect(page.getByTestId('workspace-select').locator('option:checked')).toHaveText('Churn 2026')
  await expect(page.getByTestId('workspace-select')).toHaveValue('churn-study')
  expect(JSON.parse(readFileSync(join(studio.dir, 'workspaces/churn-study/workspace.json'), 'utf8')).name).toBe('Churn 2026')

  // Remembered per viewer: the workspace and the tab.
  await page.getByTestId('nav-cohorts').click()
  await page.reload()
  await expect(page.getByTestId('nav-cohorts')).toHaveAttribute('aria-selected', 'true')
  await page.getByTestId('nav-analyses').click()
  await expect(page.getByTestId('workspace-select')).toHaveValue('churn-study')
  await page.getByTestId('workspace-select').selectOption('ab-test-readout')
  await expect(analysisRow(page, '11_readout.compose.json')).toBeVisible()
})

test('Cohorts keeps Global and Local apart; a workspace imports with a global schema', async ({ page, studio, request }) => {
  expect((await request.post('/api/w/_global/schemas', { data: { name: 'retail_orders', schema: RETAIL_ORDERS } })).status()).toBe(201)
  await page.goto('/')
  await openCohorts(page)

  const design = catalogRow(page, 'cohort', 'cohorts/design.pulse', 'global')
  const ab = catalogRow(page, 'cohort', 'cohorts/ab_test.pulse', 'local')
  await expect(design.getByTestId('scope-tag')).toHaveText('Global')
  await expect(ab.getByTestId('scope-tag')).toHaveText('ab-test-readout')
  await expect(page.locator('[data-testid="scope-section"][data-scope="local"][data-workspace="ab-test-readout"]').first()).toBeVisible()
  await page.getByTestId('scope-global').click()
  await expect(design).toBeVisible()
  await expect(ab).toHaveCount(0)
  await page.getByTestId('scope-local').click()
  await expect(design).toHaveCount(0)
  await expect(ab).toBeVisible()
  await page.getByTestId('scope-all').click()

  // A global cohort can't be moved anywhere; a local one can be made global.
  await design.click()
  await expect(page.getByTestId('cohort-file').getByTestId('item-scope')).toHaveText('Global')
  await expect(page.getByTestId('make-global')).toHaveCount(0)
  await ab.click()
  await expect(page.getByTestId('make-global')).toBeVisible()
  await expect(catalogRow(page, 'schema', 'schemas/retail_orders.schema.json', 'global')).toBeVisible()

  // Import into the workspace: the global schema is matched and reused as it is.
  await page.getByTestId('import-open').click()
  await page.getByTestId('import-into').selectOption('ab-test-readout')
  await page.getByTestId('import-file-input').setInputFiles(fixture('orders_feb.csv'))
  const banner = page.getByTestId('match-banner')
  await expect(banner).toContainText('Matches saved schema retail_orders')
  await expect(banner.getByTestId('match-scope')).toHaveText('Global')
  await page.getByTestId('schema-next').click()
  await expect(page.getByTestId('schema-global')).toBeVisible()
  await page.getByTestId('schema-use-global').click()
  await expect(page.getByTestId('import-wizard')).toHaveAttribute('data-step', 'import')
  await expect(page.getByTestId('import-schema-global')).toBeVisible()
  await page.getByTestId('import-target').fill('feb')
  await page.getByTestId('import-run').click()
  await expect(page.getByTestId('cohort-file')).toHaveAttribute('data-path', 'cohorts/feb.pulse')
  await expect(page.getByTestId('report-rows')).toBeVisible()
  const spec = JSON.parse(studio.read('imports/feb.import.json'))
  expect(spec.schema).toMatchObject({ ref: 'retail_orders', path: '_global/schemas/retail_orders.schema.json' })
  expect(studio.exists('schemas/retail_orders.schema.json')).toBe(false)
  await expect(catalogRow(page, 'cohort', 'cohorts/feb.pulse', 'local')).toContainText('imported')

  // Rebuild follows the global schema.
  await page.getByTestId('rebuild').click()
  await expect(page.getByTestId('rebuild-done')).toBeVisible()
})

test('Make global: a local schema moves; a cohort whose name is taken takes the suggested one', async ({ page, studio, request }) => {
  // A local schema, and a global cohort named ab_test (the clash).
  expect((await request.post(studio.api('/schemas'), { data: { name: 'people', schema: [{ name: 'a', type: 'u32', description: '', nullable: false }] } })).status()).toBe(201)
  const up = await request.post('/api/w/_global/sources', {
    multipart: { file: { name: 'orders.csv', mimeType: 'text/csv', buffer: readFileSync(fixture('orders.csv')) } },
  })
  expect(up.status()).toBe(201)
  expect((await request.post('/api/w/_global/import', { data: { source: 'sources/orders.csv', target: 'ab_test' } })).status()).toBe(201)
  const before = studio.read('analyses/04_metric_battery.json')
  expect(before).toContain('"data_dir": "cohorts"')

  await page.goto('/')
  await openCohorts(page)

  // Happy path: the schema.
  await catalogRow(page, 'schema', 'schemas/people.schema.json', 'local').click()
  await page.getByTestId('make-global').click()
  const dialog = page.getByTestId('make-global-dialog')
  await expect(dialog.getByTestId('make-global-plan')).toContainText('schemas/people.schema.json')
  await expect(dialog.getByTestId('make-global-moves').locator('[data-kind="schema"]')).toBeVisible()
  await dialog.getByTestId('make-global-apply').click()
  await expect(dialog).toHaveCount(0)
  await expect(catalogRow(page, 'schema', 'schemas/people.schema.json', 'global')).toBeVisible()
  await expect(catalogRow(page, 'schema', 'schemas/people.schema.json', 'local')).toHaveCount(0)
  await expect(page.getByTestId('schema-file').getByTestId('item-scope')).toHaveText('Global')
  await expect(page.getByTestId('make-global')).toHaveCount(0)
  expect(studio.exists('schemas/people.schema.json')).toBe(false)
  expect(studio.globalGit('log', '-1', '--format=%s')).toContain('studio: make schema schemas/people.schema.json global')

  // Clash: ab_test is taken globally; the suggested name is prefilled.
  await catalogRow(page, 'cohort', 'cohorts/ab_test.pulse', 'local').click()
  await page.getByTestId('make-global').click()
  const clash = dialog.getByTestId('make-global-clash')
  await expect(clash).toBeVisible()
  await expect(clash).toContainText('ab_test')
  await expect(dialog.getByTestId('make-global-name')).toHaveValue('ab_test-2')
  await expect(dialog.getByTestId('make-global-apply')).toBeDisabled()
  await dialog.getByTestId('make-global-recheck').click()
  const plan = dialog.getByTestId('make-global-plan')
  await expect(plan).toContainText('cohorts/ab_test-2.pulse')
  await expect(dialog.getByTestId('make-global-new-name')).toHaveText('ab_test-2')
  // Every analysis on the cohort is listed with its rewritten reference.
  await expect(dialog.getByTestId('make-global-rewrites').locator('[data-path$="04_metric_battery.json"]')).toContainText('_global/cohorts')
  await dialog.getByTestId('make-global-apply').click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('cohort-file')).toHaveAttribute('data-path', 'cohorts/ab_test-2.pulse')
  await expect(page.getByTestId('cohort-file').getByTestId('item-scope')).toHaveText('Global')
  await expect(catalogRow(page, 'cohort', 'cohorts/ab_test.pulse', 'local')).toHaveCount(0)
  await expect(catalogRow(page, 'cohort', 'cohorts/ab_test-2.pulse', 'global')).toBeVisible()

  // The workspace's analyses now read the global cohort, and still run.
  const after = JSON.parse(studio.read('analyses/04_metric_battery.json'))
  expect(after.cohort).toEqual({ filename: 'ab_test-2.pulse', data_dir: '_global/cohorts' })
  expect(studio.git('log', '-1', '--format=%s')).toContain('studio: make cohort cohorts/ab_test.pulse global as cohorts/ab_test-2.pulse')
  await page.getByTestId('nav-analyses').click()
  await analysisRow(page, '04_metric_battery.json').click()
  await page.getByTestId('run-button').click()
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-phase', 'done', { timeout: 30_000 })
  await expect(page.getByTestId('request-graph').locator('[data-path="aggregations[0]"] [data-testid="node-run"]')).toHaveText('40,000')
})
