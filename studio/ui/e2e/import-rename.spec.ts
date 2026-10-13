// Column renames on import (G4). PULSE-GAP(column-rename): delete this
// spec and its zillow fixtures with the rename shim.
//
// Upload a file with messy headers, suggest clean names (a duplicate is
// refused inline), save the schema with its rename map, import, rebuild;
// the next file with the same headers matches the saved schema and gets
// the same names.
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from './harness.ts'

test.use({ workspace: 'ab-test-readout' })

const fixture = (name: string) => join(import.meta.dirname, 'fixtures', name)

const CLEAN = ['living_space_sq_ft', 'list_price', 'city', 'year_built']

test('rename columns on import, keep the names on rebuild and on the next file', async ({ page, studio, request }) => {
  await page.goto('/')
  await page.getByTestId('import-open').click()
  const wizard = page.getByTestId('import-wizard')
  await page.getByTestId('import-file-input').setInputFiles(fixture('zillow.csv'))
  await expect(wizard).toHaveAttribute('data-step', 'schema')
  const table = page.getByTestId('schema-table')
  const row = (name: string) => table.locator(`tr[data-col="${name}"]`)
  await expect(table.locator('tbody tr')).toHaveCount(5)
  await expect(row('List Price ($)').getByTestId('col-name')).toHaveValue('List Price ($)')
  await expect(row('List Price ($)').getByTestId('col-original')).toHaveCount(0)

  // Exclude one column, then suggest clean names for the rest.
  await row('MLS #').getByTestId('col-include').uncheck()
  await page.getByTestId('suggest-names').click()
  await expect(row('Living Space (sq ft)').getByTestId('col-name')).toHaveValue('living_space_sq_ft')
  await expect(row('List Price ($)').getByTestId('col-name')).toHaveValue('list_price')
  await expect(row('List Price ($)').getByTestId('col-original')).toContainText('List Price ($)')
  await expect(row('MLS #').getByTestId('col-name')).toHaveValue('MLS #')

  // A duplicate is refused inline and blocks Next; reset restores.
  await row('City').getByTestId('col-name').fill('list_price')
  await expect(row('City').getByTestId('col-name-issue')).toHaveAttribute('data-reason', 'duplicate')
  await expect(page.getByTestId('schema-next')).toBeDisabled()
  await row('City').getByTestId('col-name-reset').click()
  await expect(row('City').getByTestId('col-name')).toHaveValue('City')
  await row('City').getByTestId('col-name').fill('city')
  await expect(page.getByTestId('col-name-issue')).toHaveCount(0)

  // Pulse checks the types under the new names (an override by new name).
  await row('Year Built').getByTestId('col-type').selectOption('u16')
  await page.getByTestId('schema-next').click()
  await expect(wizard).toHaveAttribute('data-step', 'save')
  await page.getByTestId('schema-name').fill('zillow')
  await page.getByTestId('schema-save').click()
  await expect(wizard).toHaveAttribute('data-step', 'import')
  const saved = JSON.parse(studio.read('schemas/zillow.schema.json')) as { fields: { name: string; type: string }[]; rename: Record<string, string> }
  expect(saved.fields.map((f) => f.name)).toEqual(CLEAN)
  expect(saved.fields[3].type).toBe('u16')
  expect(saved.rename).toEqual({
    'Living Space (sq ft)': 'living_space_sq_ft',
    'List Price ($)': 'list_price',
    City: 'city',
    'Year Built': 'year_built',
  })

  await page.getByTestId('import-target').fill('homes')
  await page.getByTestId('import-run').click()
  await expect(page.getByTestId('cohort-file')).toHaveAttribute('data-path', 'homes.pulse')
  await expect(page.getByTestId('report-rows')).toHaveText('5')
  const fields = page.getByTestId('cohort-fields')
  for (const f of CLEAN) await expect(fields.locator(`tr[data-field="${f}"]`)).toHaveCount(1)
  await expect(fields.locator('tr[data-field="MLS #"]')).toHaveCount(0)
  const spec = JSON.parse(studio.read('imports/homes.import.json'))
  expect(spec.options.rename).toEqual(saved.rename)
  expect(spec.options.ignore_extra).toBe(true)

  // Rebuild re-applies the spec's renames.
  rmSync(join(studio.dir, 'homes.pulse'))
  const rebuilt = await request.post('/api/import/rebuild', { data: { spec: 'imports/homes.import.json' } })
  expect(rebuilt.status()).toBe(200)
  expect(((await rebuilt.json()).report.schema as { name: string }[]).map((f) => f.name)).toEqual(CLEAN)

  // The saved schema view says where each field came from.
  await page.goto('/')
  await page.getByRole('button', { name: 'zillow', exact: true }).click()
  await expect(page.getByTestId('schema-file').getByTestId('schema-field-source').first()).toHaveText('Living Space (sq ft)')

  // The next file with the same headers: matched and renamed the same way.
  await page.getByTestId('import-open').click()
  await page.getByTestId('import-file-input').setInputFiles(fixture('zillow_more.csv'))
  await expect(page.getByTestId('match-suggestions').locator('[data-match="zillow"]')).toBeVisible()
  await page.getByTestId('match-suggestions').locator('[data-match="zillow"]').getByTestId('match-apply-drop').click()
  await expect(row('List Price ($)').getByTestId('col-name')).toHaveValue('list_price')
  await expect(row('Year Built').getByTestId('col-type')).toHaveValue('u16')
  await expect(row('MLS #').getByTestId('col-include')).not.toBeChecked()
  await page.getByTestId('schema-next').click()
  await expect(page.getByTestId('schema-name')).toHaveValue('zillow')
  // Same fields and renames: the saved schema is reused as it is.
  await page.getByTestId('schema-save').click()
  await expect(wizard).toHaveAttribute('data-step', 'import')
  await page.getByTestId('import-target').fill('homes_more')
  await page.getByTestId('import-run').click()
  await expect(page.getByTestId('cohort-file')).toHaveAttribute('data-path', 'homes_more.pulse')
  for (const f of CLEAN) await expect(page.getByTestId('cohort-fields').locator(`tr[data-field="${f}"]`)).toHaveCount(1)
})

test('the server refuses a duplicate rename with a coded error', async ({ request }) => {
  const up = await request.post('/api/sources', {
    multipart: { file: { name: 'zillow.csv', mimeType: 'text/csv', buffer: Buffer.from('A,B\n1,2\n') } },
  })
  expect(up.status()).toBe(201)
  const res = await request.post('/api/import', { data: { source: 'sources/zillow.csv', target: 'dup', options: { rename: { A: 'B' } } } })
  expect(res.status()).toBe(422)
  expect((await res.json()).error.code).toBe('invalid_rename')
})
