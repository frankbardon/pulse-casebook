// The import wizard (G2) and schema reuse (G3), against a temp copy of
// ab-test-readout kept in git: upload a CSV, edit a type, save the
// schema, import, open the cohort and start an analysis on it; a file
// with a saved schema's columns matches it exactly, and a file with one
// extra column gets it as a suggestion to apply; Rebuild of an imported
// cohort whose source changed or went missing.
import { appendFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { catalogRow, expect, openCohorts, test, type Studio } from './harness.ts'
import type { Page } from '@playwright/test'

test.use({ workspace: 'ab-test-readout' })

const fixture = (name: string) => join(import.meta.dirname, 'fixtures', name)

// openImport opens the import wizard from Cohorts, importing into the
// template's workspace (local).
async function openImport(page: Page, studio: Studio) {
  await page.getByTestId('import-open').click()
  await page.getByTestId('import-into').selectOption(studio.slug)
}

test('upload, edit a type, save the schema, import, and start an analysis on the cohort', async ({ page, studio }) => {
  await page.goto('/')
  await openCohorts(page)
  await openImport(page, studio)
  const wizard = page.getByTestId('import-wizard')
  await expect(wizard).toHaveAttribute('data-step', 'upload')

  // Upload: lands in sources/ and goes straight to the schema review.
  await page.getByTestId('import-file-input').setInputFiles(fixture('orders.csv'))
  await expect(wizard).toHaveAttribute('data-step', 'schema')
  await expect(page.getByTestId('upload-format')).toContainText('csv')
  expect(studio.exists('sources/orders.csv')).toBe(true)
  const table = page.getByTestId('schema-table')
  await expect(table.locator('tbody tr')).toHaveCount(6)
  await expect(page.getByTestId('match-banner')).toHaveCount(0)
  const row = (name: string) => table.locator(`tr[data-col="${name}"]`)
  await expect(row('region').getByTestId('col-type')).toHaveValue('categorical_u8')
  await expect(row('amount')).toContainText('12.5%') // 1 of 8 empty

  // A type Pulse refuses is shown on its column.
  await row('region').getByTestId('col-type').selectOption('u8')
  await page.getByTestId('rerun-inference').click()
  await expect(page.getByTestId('import-refusal')).toContainText('region')
  await expect(row('region')).toHaveAttribute('data-refused', 'true')
  await expect(row('region').getByTestId('col-warning')).toContainText('north')
  await row('region').getByTestId('col-type').selectOption('categorical_u8')

  // Edit a type (widen qty) and filter the table.
  await row('qty').getByTestId('col-type').selectOption('u16')
  await expect(row('qty').getByTestId('col-type')).toHaveAttribute('title', 'whole number 0-65,535, 2 bytes')
  await expect(row('qty')).toContainText('Pulse inferred u4')
  await page.getByTestId('column-filter').fill('order')
  await expect(table.locator('tbody tr')).toHaveCount(2)
  await page.getByTestId('column-filter').fill('')

  // Next re-checks the edited types with Pulse, then Save.
  await page.getByTestId('schema-next').click()
  await expect(wizard).toHaveAttribute('data-step', 'save')
  await page.getByTestId('schema-name').fill('retail_orders')
  await page.getByTestId('schema-save').click()
  await expect(wizard).toHaveAttribute('data-step', 'import')
  const saved = JSON.parse(studio.read('schemas/retail_orders.schema.json')) as { name: string; type: string }[]
  expect(saved.map((f) => [f.name, f.type])).toContainEqual(['qty', 'u16'])
  expect(saved).toHaveLength(6)

  // Import.
  await page.getByTestId('import-target').fill('retail')
  await page.getByTestId('import-run').click()
  const cohort = page.getByTestId('cohort-file')
  await expect(cohort).toHaveAttribute('data-path', 'cohorts/retail.pulse')
  await expect(cohort.getByTestId('item-scope')).toHaveText('ab-test-readout')
  await expect(page.getByTestId('import-done')).toBeVisible()
  await expect(page.getByTestId('report-rows')).toHaveText('8')
  await expect(page.getByTestId('cohort-fields').locator('tr[data-field="qty"]')).toContainText('u16')
  await expect(catalogRow(page, 'cohort', 'cohorts/retail.pulse', 'local')).toContainText('imported')
  await expect(page.locator('.file-group[data-kind="import"]')).toContainText('retail')
  expect(studio.exists('cohorts/retail.pulse')).toBe(true)
  const spec = JSON.parse(studio.read('imports/retail.import.json'))
  expect(spec.schema.ref).toBe('retail_orders')
  expect(spec.source.path).toBe('sources/orders.csv')
  const log = studio.git('log', '--format=%s')
  expect(log).toContain('studio: save schema schemas/retail_orders.schema.json')
  expect(log).toContain('studio: import cohorts/retail.pulse')

  // New analysis on the new cohort (in its workspace).
  await page.getByTestId('cohort-new-request').click()
  await expect(page.getByTestId('new-cohort')).toHaveValue('cohorts/retail.pulse')
  await page.getByTestId('new-name').fill('retail_first')
  await page.getByTestId('new-create').click()
  const graph = page.getByTestId('request-graph')
  await expect(graph.locator('[data-path="cohort"]')).toContainText('retail.pulse')
  await expect(graph.locator('[data-path="cohort"] [data-testid="preview"]')).toContainText('8 rows')
})

// The saved schema retail_orders: orders.csv's six columns, qty widened
// to u16 (Pulse infers u4).
const RETAIL_ORDERS = [
  { name: 'order_id', type: 'u16', description: '', nullable: false },
  { name: 'region', type: 'categorical_u8', description: '', nullable: false },
  { name: 'amount', type: 'f64', description: '', nullable: true },
  { name: 'qty', type: 'u16', description: '', nullable: false },
  { name: 'ordered_on', type: 'date', description: '', nullable: false },
  { name: 'returned', type: 'packed_bool', description: '', nullable: false },
]

test('a saved schema is matched exactly, or suggested with a diff and applied', async ({ page, studio, request }) => {
  expect((await request.post(studio.api('/schemas'), { data: { name: 'retail_orders', schema: RETAIL_ORDERS } })).status()).toBe(201)

  // Same columns: the saved schema is matched and applied.
  await page.goto('/')
  await openCohorts(page)
  await openImport(page, studio)
  const wizard = page.getByTestId('import-wizard')
  const table = page.getByTestId('schema-table')
  const row = (name: string) => table.locator(`tr[data-col="${name}"]`)
  await page.getByTestId('import-file-input').setInputFiles(fixture('orders_feb.csv'))
  const banner = page.getByTestId('match-banner')
  await expect(banner).toContainText('Matches saved schema retail_orders')
  await expect(banner).toContainText('100%')
  await expect(banner.getByTestId('match-scope')).toHaveText('Local')
  await expect(banner).toHaveAttribute('data-exact', 'true')
  await expect(row('qty').getByTestId('col-type')).toHaveValue('u16')
  await page.getByTestId('schema-next').click()
  await expect(page.getByTestId('schema-name')).toHaveValue('retail_orders')
  // Unchanged: saving reuses the schema without a conflict.
  await page.getByTestId('schema-save').click()
  await expect(wizard).toHaveAttribute('data-step', 'import')
  await page.getByTestId('import-close').click()

  // One more column: a close match, offered with its diff, applied.
  await openImport(page, studio)
  await page.getByTestId('import-file-input').setInputFiles(fixture('orders_channel.csv'))
  const suggestions = page.getByTestId('match-suggestions')
  await expect(suggestions.locator('[data-match="retail_orders"]')).toContainText('86%')
  await expect(row('qty').getByTestId('col-type')).toHaveValue('u4')
  await suggestions.getByTestId('match-diff-toggle').click()
  await expect(suggestions.getByTestId('match-diff')).toContainText('channel')
  await suggestions.getByTestId('match-apply').click()
  await expect(page.getByTestId('match-banner')).toContainText('Applied saved schema retail_orders')
  await expect(row('qty').getByTestId('col-type')).toHaveValue('u16')
  await expect(row('channel')).toHaveAttribute('data-match', 'new')
  await expect(row('region')).toHaveAttribute('data-match', 'matched')

  // Updating the saved schema shows what changes first.
  await page.getByTestId('schema-next').click()
  await page.getByTestId('schema-save').click()
  await expect(page.getByTestId('schema-diff')).toContainText('+ channel')
  await page.getByTestId('schema-overwrite').click()
  await expect(wizard).toHaveAttribute('data-step', 'import')
  expect(JSON.parse(studio.read('schemas/retail_orders.schema.json'))).toHaveLength(7)
})

test('Rebuild asks before using a changed source and explains a missing one', async ({ page, studio, request }) => {
  // An imported cohort, set up through the API.
  const up = await request.post(studio.api('/sources'), {
    multipart: { file: { name: 'orders.csv', mimeType: 'text/csv', buffer: readFileSync(fixture('orders.csv')) } },
  })
  expect(up.status()).toBe(201)
  expect((await request.post(studio.api('/import'), { data: { source: 'sources/orders.csv', target: 'retail' } })).status()).toBe(201)

  await page.goto('/')
  await openCohorts(page)
  await catalogRow(page, 'cohort', 'cohorts/retail.pulse', 'local').click()
  await expect(page.getByTestId('spec-summary')).toContainText('sources/orders.csv')

  // Changed bytes: re-check or force.
  appendFileSync(join(studio.ws, 'sources/orders.csv'), '1009,west,1.00,1,2025-01-08,false\n')
  await page.getByTestId('rebuild').click()
  await expect(page.getByTestId('rebuild-changed')).toContainText('The source file changed')
  await page.getByTestId('rebuild-force').click()
  await expect(page.getByTestId('rebuild-done')).toBeVisible()
  await expect(page.getByTestId('rebuild-done').getByTestId('report-rows')).toHaveText('9')
  await expect(page.getByTestId('cohort-file')).toContainText('9 records')

  // Re-check opens the wizard on the source with the cohort's name.
  appendFileSync(join(studio.ws, 'sources/orders.csv'), '1010,west,2.00,1,2025-01-09,false\n')
  await page.getByTestId('rebuild').click()
  await page.getByTestId('rebuild-recheck').click()
  await expect(page.getByTestId('import-wizard')).toHaveAttribute('data-step', 'schema')
  await expect(page.getByTestId('source-path')).toHaveText('sources/orders.csv')
  await expect(page.getByTestId('schema-table').locator('tbody tr')).toHaveCount(6)
  await page.getByTestId('import-close').click()

  // Missing: says where the file goes; choosing it again rebuilds.
  const bytes = readFileSync(join(studio.ws, 'sources/orders.csv'))
  rmSync(join(studio.ws, 'sources/orders.csv'))
  await catalogRow(page, 'cohort', 'cohorts/retail.pulse', 'local').click()
  await page.getByTestId('rebuild').click()
  const missing = page.getByTestId('rebuild-missing')
  await expect(missing).toContainText('The source file is missing')
  await expect(missing.locator('code')).toHaveText('sources/orders.csv')
  await page.getByTestId('rebuild-upload').setInputFiles({ name: 'orders.csv', mimeType: 'text/csv', buffer: bytes })
  await expect(page.getByTestId('rebuild-changed')).toBeVisible()
})
