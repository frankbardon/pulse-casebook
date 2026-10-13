// Cohort export (X1; streamed since W1), against a temp copy of
// ab-test-readout kept in git: export the cohort to CSV with a field
// subset and to SPSS with its own options (a non-UTC zone refused before
// export). Export hands the file straight to the browser as a download;
// nothing is stored in the workspace, and the last format and options
// are remembered for the cohort.
import { readFileSync } from 'node:fs'
import { catalogRow, expect, openCohorts, test } from './harness.ts'
import type { Locator, Page } from '@playwright/test'

test.use({ workspace: 'ab-test-readout' })

// download clicks a control that triggers a download and returns the
// file's name and bytes.
async function download(page: Page, control: Locator): Promise<{ name: string; data: Buffer }> {
  const [dl] = await Promise.all([page.waitForEvent('download'), control.click()])
  return { name: dl.suggestedFilename(), data: readFileSync(await dl.path()) }
}

test('export a cohort to CSV with a field subset and to SPSS with options', async ({ page, studio }) => {
  await page.goto('/')
  await openCohorts(page)
  await catalogRow(page, 'cohort', 'cohorts/ab_test.pulse', 'local').click()
  await page.getByTestId('cohort-export-open').click()
  const dialog = page.getByTestId('export-dialog')
  await expect(dialog).toHaveAttribute('data-cohort', 'cohorts/ab_test.pulse')
  const preflight = page.getByTestId('export-preflight')

  // CSV: no format options; pick three fields.
  await expect(page.getByTestId('export-format')).toHaveValue('csv')
  await expect(page.getByTestId('export-options')).toHaveCount(0)
  await expect(page.getByTestId('export-name')).toHaveValue('ab_test.csv')
  await expect(preflight).toHaveAttribute('data-state', 'valid')
  await expect(page.getByTestId('export-rows')).toHaveText('40,000')
  await page.getByTestId('export-fields-none').click()
  await expect(preflight).toHaveAttribute('data-state', 'blocked')
  await expect(page.getByTestId('export-run')).toBeDisabled()
  await page.getByTestId('export-field-filter').fill('rev')
  await expect(page.getByTestId('export-field')).toHaveCount(1)
  await page.getByTestId('export-fields-all').click()
  await page.getByTestId('export-field-filter').fill('')
  for (const f of ['arm', 'user_id']) await page.locator(`[data-testid="export-field"][data-field="${f}"]`).check()
  await expect(page.getByTestId('export-field-count')).toHaveText('3 of 19')
  await page.getByTestId('export-name').fill('ab_subset')
  await expect(page.getByTestId('export-path')).toHaveText('ab_subset.csv')
  await expect(preflight).toHaveAttribute('data-state', 'valid')
  const csvFile = await download(page, page.getByTestId('export-run'))
  expect(csvFile.name).toBe('ab_subset.csv')
  await expect(page.getByTestId('export-result')).toBeVisible()
  await expect(page.getByTestId('export-result-rows')).toHaveText('40,000')
  const csv = csvFile.data.toString('utf8')
  const lines = csv.trimEnd().split('\n')
  expect(lines[0]).toBe('user_id,arm,revenue') // the cohort's order, not the click order
  expect(lines).toHaveLength(40_001)
  // "Download again" hands over the same bytes without re-exporting.
  const again = await download(page, page.getByTestId('export-download'))
  expect(again.name).toBe('ab_subset.csv')
  expect(again.data.equals(csvFile.data)).toBe(true)

  // SPSS: its own options appear; a non-UTC zone is refused up front.
  await page.getByTestId('export-format').selectOption('spss')
  await expect(page.getByTestId('export-name')).toHaveValue('ab_subset') // no extension typed: the server adds .sav
  await expect(page.getByTestId('export-options')).toBeVisible()
  for (const key of ['sanitize_names', 'charset', 'uncompressed', 'ignore_sidecar']) await expect(page.getByTestId(`export-opt-${key}`)).toBeVisible()
  await page.getByTestId('export-fields-all').click()
  await page.getByTestId('export-tz').fill('Europe/Paris')
  await expect(preflight).toHaveAttribute('data-state', 'refused')
  await expect(page.getByTestId('export-refusal')).toContainText('PULSE_SPSS_EXPORT_UNSUPPORTED')
  await expect(page.getByTestId('export-run')).toBeDisabled()
  await page.getByTestId('export-tz').fill('')
  await page.getByTestId('export-opt-uncompressed').check()
  await page.getByTestId('export-opt-charset').fill('windows-1252')
  await page.getByTestId('export-name').fill('ab_test')
  await expect(preflight).toHaveAttribute('data-state', 'valid')
  const savFile = await download(page, page.getByTestId('export-run'))
  expect(savFile.name).toBe('ab_test.sav')
  await expect(page.getByTestId('export-result')).toBeVisible()
  const sav = savFile.data
  expect(sav.subarray(0, 4).toString('latin1')).toBe('$FL2')
  expect(sav.readInt32LE(72)).toBe(0) // header compression field: 0 = uncompressed (bytecode is 1)
  expect(sav.toString('latin1')).toContain('windows-1252') // the declared charset (record 7.20)

  // The same name exports again: nothing is stored, so nothing to replace.
  await page.getByTestId('export-opt-sanitize_names').check()
  await expect(preflight).toHaveAttribute('data-state', 'valid')
  await expect(page.getByTestId('export-run')).toBeEnabled()

  // Nothing was written to the workspace, and no Exports section.
  await page.getByTestId('export-close').click()
  await expect(dialog).toHaveCount(0)
  expect(studio.exists('exports')).toBe(false)
  expect(studio.git('status', '--porcelain', '--untracked-files=all')).not.toContain('export')
  expect(studio.read('.gitignore')).not.toContain('/exports/')
  await expect(page.locator('[data-kind="export"]')).toHaveCount(0)

  // Reopened from the list row: the last format and options are remembered.
  await page.locator('[data-testid="cohort-export"][data-path="cohorts/ab_test.pulse"][data-scope="local"]').click()
  await expect(page.getByTestId('export-format')).toHaveValue('spss')
  await expect(page.getByTestId('export-opt-uncompressed')).toBeChecked()
  await expect(page.getByTestId('export-opt-charset')).toHaveValue('windows-1252')
})

test('every format Pulse writes, and the transfer artifact, exports from the dialog', async ({ page, studio }) => {
  await page.goto('/')
  await openCohorts(page)
  // design.pulse is a global cohort: it exports from the global area.
  await page.locator('[data-testid="cohort-export"][data-path="cohorts/design.pulse"][data-scope="global"]').click()
  const ids = await page.getByTestId('export-format').locator('option').evaluateAll((os) => os.map((o) => o.getAttribute('value')))
  expect(ids).toEqual(['csv', 'tsv', 'ndjson', 'jsonarray', 'parquet', 'arrow', 'excel', 'spss', 'transfer'])
  const ext: Record<string, string> = { csv: '.csv', tsv: '.tsv', ndjson: '.ndjson', jsonarray: '.json', parquet: '.parquet', arrow: '.arrow', excel: '.xlsx', spss: '.sav', transfer: '.pulse.zst' }
  for (const id of ids) {
    await page.getByTestId('export-format').selectOption(id)
    // Each format shows only its own options (SPSS's four, the transfer level).
    const keys = await page.locator('[data-testid="export-options"] [data-option]').evaluateAll((els) => els.map((e) => e.getAttribute('data-option')))
    expect(keys).toEqual(id === 'spss' ? ['sanitize_names', 'charset', 'uncompressed', 'ignore_sidecar'] : id === 'transfer' ? ['level'] : [])
    await expect(page.getByTestId('export-fields')).toHaveCount(id === 'transfer' ? 0 : 1)
    await expect(page.getByTestId('export-tz')).toHaveCount(id === 'transfer' ? 0 : 1)
    await expect(page.getByTestId('export-name')).toHaveValue('design' + ext[id])
    await expect(page.getByTestId('export-preflight')).toHaveAttribute('data-state', 'valid')
    const file = await download(page, page.getByTestId('export-run'))
    expect(file.name).toBe('design' + ext[id])
    expect(file.data.length).toBeGreaterThan(0)
    await expect(page.getByTestId('export-result')).toContainText('design' + ext[id])
  }
  await page.getByTestId('export-close').click()
  expect(studio.exists('exports')).toBe(false)
})
