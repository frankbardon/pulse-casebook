// Cohort export (X1), against a temp copy of ab-test-readout kept in
// git: export the cohort to CSV with a field subset and to SPSS with its
// own options (a non-UTC zone refused before export), download both,
// see them listed under Exports, never committed, and the last format
// and options remembered for the cohort.
import { readFileSync } from 'node:fs'
import { expect, test } from './harness.ts'
import type { Page } from '@playwright/test'

test.use({ workspace: 'ab-test-readout' })

async function download(page: Page): Promise<Buffer> {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-download').click()])
  return readFileSync(await dl.path())
}

test('export a cohort to CSV with a field subset and to SPSS with options', async ({ page, studio }) => {
  await page.goto('/')
  await page.locator('[data-kind="cohort"] button.file[data-path="ab_test.pulse"]').click()
  await page.getByTestId('cohort-export-open').click()
  const dialog = page.getByTestId('export-dialog')
  await expect(dialog).toHaveAttribute('data-cohort', 'ab_test.pulse')
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
  await expect(page.getByTestId('export-path')).toHaveText('exports/ab_subset.csv')
  await expect(preflight).toHaveAttribute('data-state', 'valid')
  await page.getByTestId('export-run').click()
  await expect(page.getByTestId('export-result')).toBeVisible()
  await expect(page.getByTestId('export-result-rows')).toHaveText('40,000')
  const csv = (await download(page)).toString('utf8')
  const lines = csv.trimEnd().split('\n')
  expect(lines[0]).toBe('user_id,arm,revenue') // the cohort's order, not the click order
  expect(lines).toHaveLength(40_001)
  expect(studio.read('exports/ab_subset.csv')).toBe(csv)

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
  await page.getByTestId('export-run').click()
  await expect(page.getByTestId('export-result')).toBeVisible()
  const sav = await download(page)
  expect(sav.subarray(0, 4).toString('latin1')).toBe('$FL2')
  expect(sav.readInt32LE(72)).toBe(0) // header compression field: 0 = uncompressed (bytecode is 1)
  expect(sav.toString('latin1')).toContain('windows-1252') // the declared charset (record 7.20)
  expect(sav.equals(readFileSync(`${studio.dir}/exports/ab_test.sav`))).toBe(true)

  // The preflight re-checks after the export: the same name now needs a confirm.
  await expect(page.getByTestId('export-overwrite')).toBeVisible()
  await page.getByTestId('export-opt-sanitize_names').check()
  await expect(page.getByTestId('export-overwrite')).toBeVisible()
  await expect(page.getByTestId('export-run')).toBeDisabled()
  await page.getByTestId('export-overwrite').check()
  await expect(page.getByTestId('export-run')).toBeEnabled()

  // Listed under Exports as downloads; exports/ is never committed.
  await page.getByTestId('export-close').click()
  await expect(dialog).toHaveCount(0)
  const links = page.locator('[data-kind="export"] [data-testid="export-link"]')
  await expect(links).toHaveCount(2)
  await expect(page.locator('[data-testid="export-link"][data-path="exports/ab_subset.csv"]')).toHaveAttribute('href', /\/api\/export\/download\?path=exports%2Fab_subset\.csv/)
  expect(studio.git('status', '--porcelain', '--untracked-files=all')).not.toContain('exports/')
  expect(studio.git('check-ignore', 'exports/ab_test.sav')).toBe('exports/ab_test.sav')
  expect(studio.read('.gitignore')).toContain('/exports/')

  // Reopened from the sidebar row: the last format and options are remembered.
  await page.locator('[data-testid="cohort-export"][data-path="ab_test.pulse"]').click()
  await expect(page.getByTestId('export-format')).toHaveValue('spss')
  await expect(page.getByTestId('export-opt-uncompressed')).toBeChecked()
  await expect(page.getByTestId('export-opt-charset')).toHaveValue('windows-1252')
})

test('every format Pulse writes, and the transfer artifact, exports from the dialog', async ({ page, studio }) => {
  await page.goto('/')
  await page.locator('[data-testid="cohort-export"][data-path="design.pulse"]').click()
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
    await page.getByTestId('export-run').click()
    await expect(page.getByTestId('export-result')).toContainText('exports/design' + ext[id])
    expect(studio.exists('exports/design' + ext[id])).toBe(true)
  }
  await page.getByTestId('export-close').click()
  await expect(page.locator('[data-kind="export"] [data-testid="export-link"]')).toHaveCount(ids.length)
})
