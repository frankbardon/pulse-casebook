// The import wizard (G2) and schema reuse (G3), against a temp copy of
// ab-test-readout kept in git: upload a CSV, edit a type, save the
// schema, import, open the cohort and start a request on it; Rebuild of
// an imported cohort whose source changed or went missing.
import { appendFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from './harness.ts'

test.use({ workspace: 'ab-test-readout' })

const fixture = (name: string) => join(import.meta.dirname, 'fixtures', name)

test('upload, edit a type, save the schema, import, and start a request on the cohort', async ({ page, studio }) => {
  await page.goto('/')
  await page.getByTestId('import-open').click()
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
  await expect(cohort).toHaveAttribute('data-path', 'retail.pulse')
  await expect(page.getByTestId('import-done')).toBeVisible()
  await expect(page.getByTestId('report-rows')).toHaveText('8')
  await expect(page.getByTestId('cohort-fields').locator('tr[data-field="qty"]')).toContainText('u16')
  await expect(page.getByRole('button', { name: 'retail.pulse' })).toContainText('imported')
  await expect(page.locator('.file-group[data-kind="import"]')).toContainText('retail')
  expect(studio.exists('retail.pulse')).toBe(true)
  const spec = JSON.parse(studio.read('imports/retail.import.json'))
  expect(spec.schema.ref).toBe('retail_orders')
  expect(spec.source.path).toBe('sources/orders.csv')
  const log = studio.git('log', '--format=%s')
  expect(log).toContain('studio: save schema schemas/retail_orders.schema.json')
  expect(log).toContain('studio: import retail.pulse')

  // New request on the new cohort.
  await page.getByTestId('cohort-new-request').click()
  await expect(page.getByTestId('new-cohort')).toHaveValue('retail.pulse')
  await page.getByTestId('new-name').fill('retail_first')
  await page.getByTestId('new-create').click()
  const graph = page.getByTestId('request-graph')
  await expect(graph.locator('[data-path="cohort"]')).toContainText('retail.pulse')
  await expect(graph.locator('[data-path="cohort"] [data-testid="preview"]')).toContainText('8 rows')
})

test('Rebuild asks before using a changed source and explains a missing one', async ({ page, studio, request }) => {
  // An imported cohort, set up through the API.
  const up = await request.post('/api/sources', {
    multipart: { file: { name: 'orders.csv', mimeType: 'text/csv', buffer: readFileSync(fixture('orders.csv')) } },
  })
  expect(up.status()).toBe(201)
  expect((await request.post('/api/import', { data: { source: 'sources/orders.csv', target: 'retail' } })).status()).toBe(201)

  await page.goto('/')
  await page.getByRole('button', { name: 'retail.pulse' }).click()
  await expect(page.getByTestId('spec-summary')).toContainText('sources/orders.csv')

  // Changed bytes: re-check or force.
  appendFileSync(join(studio.dir, 'sources/orders.csv'), '1009,west,1.00,1,2025-01-08,false\n')
  await page.getByTestId('rebuild').click()
  await expect(page.getByTestId('rebuild-changed')).toContainText('The source file changed')
  await page.getByTestId('rebuild-force').click()
  await expect(page.getByTestId('rebuild-done')).toBeVisible()
  await expect(page.getByTestId('rebuild-done').getByTestId('report-rows')).toHaveText('9')
  await expect(page.getByTestId('cohort-file')).toContainText('9 records')

  // Re-check opens the wizard on the source with the cohort's name.
  appendFileSync(join(studio.dir, 'sources/orders.csv'), '1010,west,2.00,1,2025-01-09,false\n')
  await page.getByTestId('rebuild').click()
  await page.getByTestId('rebuild-recheck').click()
  await expect(page.getByTestId('import-wizard')).toHaveAttribute('data-step', 'schema')
  await expect(page.getByTestId('source-path')).toHaveText('sources/orders.csv')
  await expect(page.getByTestId('schema-table').locator('tbody tr')).toHaveCount(6)
  await page.getByTestId('import-close').click()

  // Missing: says where the file goes; choosing it again rebuilds.
  const bytes = readFileSync(join(studio.dir, 'sources/orders.csv'))
  rmSync(join(studio.dir, 'sources/orders.csv'))
  await page.getByRole('button', { name: 'retail.pulse' }).click()
  await page.getByTestId('rebuild').click()
  const missing = page.getByTestId('rebuild-missing')
  await expect(missing).toContainText('The source file is missing')
  await expect(missing.locator('code')).toHaveText('sources/orders.csv')
  await page.getByTestId('rebuild-upload').setInputFiles({ name: 'orders.csv', mimeType: 'text/csv', buffer: bytes })
  await expect(page.getByTestId('rebuild-changed')).toBeVisible()
})
