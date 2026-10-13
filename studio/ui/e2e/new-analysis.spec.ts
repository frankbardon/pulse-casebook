// The New analysis wizard: each mode explained (reads, returns, runs,
// use it when, a diagram), the cohort step (this workspace and Global,
// search), name & folder, keyboard use, and one analysis of each mode
// created through it, opened in the editor with its mode badge.
import { analysisAt, expect, newAnalysis, test } from './harness.ts'

test.use({ workspace: 'ab-test-readout' })

test('the wizard explains each mode and is keyboard accessible', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('new-request-open').click()
  const wizard = page.getByTestId('new-analysis-wizard')
  await expect(wizard).toHaveAttribute('role', 'dialog')
  await expect(wizard).toHaveAttribute('data-step', 'mode')

  // Four modes, each with its one-liner, the facts and a diagram.
  const cards = wizard.getByTestId('mode-card')
  await expect(cards).toHaveCount(4)
  expect(await cards.evaluateAll((els) => els.map((e) => e.getAttribute('data-mode')))).toEqual(['standalone', 'composed', 'faceted', 'chained'])
  const runs = {
    standalone: 'one cohort, one pass, one result',
    composed: 'several standalone runs together, results side by side',
    faceted: 'summaries of the chosen fields',
    chained: "steps, each reading the previous step's result table",
  }
  for (const [mode, line] of Object.entries(runs)) {
    const card = wizard.locator(`[data-testid="mode-card"][data-mode="${mode}"]`)
    await expect(card).toContainText(line)
    for (const fact of ['Reads', 'Returns', 'Runs', 'Use it when']) await expect(card.locator('dt', { hasText: fact })).toHaveCount(1)
    await expect(card.getByTestId('mode-diagram')).toBeVisible()
  }

  // No mode chosen yet: Next waits. Arrow keys move the choice, Enter goes on.
  await expect(wizard.getByTestId('wizard-next')).toBeDisabled()
  await cards.first().focus()
  await page.keyboard.press('ArrowRight')
  await expect(wizard.locator('[data-mode="composed"]')).toHaveAttribute('aria-checked', 'true')
  await expect(wizard.locator('[data-mode="composed"]')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(wizard.locator('[data-mode="faceted"]')).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Enter')
  await expect(wizard).toHaveAttribute('data-step', 'cohort')

  // Cohorts grouped (this workspace, Global), with counts; search narrows.
  await expect(wizard).toContainText('This cohort seeds the first part')
  await expect(wizard.locator('.cohort-group legend')).toHaveText(['This workspace (ab-test-readout)', 'Global'])
  const local = wizard.locator('[data-testid="cohort-option"][data-path="cohorts/ab_test.pulse"]')
  await expect(local).toHaveAttribute('data-scope', 'local')
  await expect(local.locator('input')).toBeChecked()
  await expect(local.getByTestId('cohort-info')).toContainText(/\d+ fields · 40,000 rows/)
  await expect(wizard.locator('[data-testid="cohort-option"][data-path="_global/cohorts/design.pulse"]')).toHaveAttribute('data-scope', 'global')
  await wizard.getByTestId('cohort-search').fill('design')
  await expect(wizard.getByTestId('cohort-option')).toHaveCount(1)
  await wizard.getByTestId('cohort-option').click()
  await wizard.getByTestId('cohort-search').fill('')

  // Back keeps the choices; Next twice reaches the name.
  await wizard.getByTestId('wizard-back').click()
  await expect(wizard.locator('[data-mode="composed"]')).toHaveAttribute('aria-checked', 'true')
  await wizard.getByTestId('wizard-next').click()
  await expect(wizard.locator('[data-testid="cohort-option"][data-path="_global/cohorts/design.pulse"] input')).toBeChecked()
  await wizard.getByTestId('wizard-next').click()
  await expect(wizard).toHaveAttribute('data-step', 'name')
  await expect(wizard.getByTestId('new-name')).toBeFocused()
  await expect(wizard.getByTestId('new-create')).toBeDisabled()
  await page.keyboard.type('bad/name')
  await expect(wizard.getByTestId('new-name-error')).toContainText('letters')
  await wizard.getByTestId('new-name').fill('ok')
  await expect(wizard.getByTestId('wizard-summary')).toContainText('Composed')
  await expect(wizard.getByTestId('wizard-summary')).toContainText('design')
  await expect(wizard.getByTestId('wizard-summary')).toContainText('Global')
  await expect(wizard.getByTestId('new-path')).toHaveText('analyses/ok.compose.json')

  // Escape closes without creating; reopening remembers only the mode.
  await page.keyboard.press('Escape')
  await expect(wizard).toBeHidden()
  await page.getByTestId('new-request-open').click()
  await expect(wizard).toHaveAttribute('data-step', 'mode')
  await expect(wizard.locator('[data-mode="composed"]')).toHaveAttribute('aria-checked', 'true')
  await wizard.getByTestId('wizard-next').click()
  await expect(wizard.locator('[data-testid="cohort-option"][data-path="cohorts/ab_test.pulse"] input')).toBeChecked()
  await wizard.getByTestId('wizard-cancel').click()
  await expect(wizard).toBeHidden()
})

test('one analysis of each mode is created through the wizard and opens in the editor', async ({ page, studio }) => {
  await page.goto('/')
  const made = [
    { mode: 'standalone', label: 'Standalone', name: 'w_standalone', path: 'analyses/w_standalone.json', key: 'aggregations' },
    { mode: 'composed', label: 'Composed', name: 'w_composed', path: 'analyses/w_composed.compose.json', key: 'requests' },
    { mode: 'faceted', label: 'Faceted', name: 'w_faceted', path: 'analyses/studies/w_faceted.facet.json', key: 'fields', folder: 'studies' },
    { mode: 'chained', label: 'Chained', name: 'w_chained', path: 'analyses/studies/w_chained.json', key: 'stages' },
  ] as const
  for (const m of made) {
    await page.getByTestId('new-request-open').click()
    if (m.mode === 'chained') {
      // The folder made by the previous one is offered.
      await page.locator('[data-testid="mode-card"][data-mode="chained"]').click()
      await page.getByTestId('wizard-next').click()
      await page.getByTestId('wizard-next').click()
      await page.getByTestId('new-folder').selectOption('studies')
      await page.getByTestId('new-name').fill(m.name)
      await page.getByTestId('new-create').click()
      await expect(page.getByTestId('new-analysis-wizard')).toBeHidden()
    } else {
      await newAnalysis(page, { mode: m.mode, name: m.name, ...('folder' in m && { folder: m.folder }) })
    }
    await expect(page.getByTestId('graph-mode')).toHaveText(m.label)
    await expect(analysisAt(page, m.path)).toHaveAttribute('aria-current', 'true')
    await expect(analysisAt(page, m.path).getByTestId('mode-badge')).toHaveText(m.label)
    const doc = JSON.parse(studio.read(m.path)) as Record<string, unknown>
    if (m.mode !== 'standalone') expect(doc).toHaveProperty(m.key)
  }
  expect(JSON.parse(studio.read('analyses/w_standalone.json'))).toEqual({ cohort: { filename: 'ab_test.pulse', data_dir: 'cohorts' } })
})

test.describe('with no cohorts', () => {
  test.use({ workspace: 'privacy-safe-sharing' })

  test('the cohort step links to Cohorts › Import', async ({ page }) => {
    await page.goto('/')
    // A new workspace has no cohorts of its own, and this library no global ones.
    await page.getByTestId('workspace-create').click()
    await page.getByTestId('workspace-name-input').fill('Empty')
    await page.getByTestId('workspace-name-save').click()
    await expect(page.getByTestId('workspace-select')).toHaveValue('empty')
    await page.getByTestId('empty-new-analysis').click()
    const wizard = page.getByTestId('new-analysis-wizard')
    await wizard.locator('[data-testid="mode-card"][data-mode="faceted"]').click()
    await wizard.getByTestId('wizard-next').click()
    await expect(wizard.getByTestId('wizard-no-cohorts')).toBeVisible()
    await expect(wizard.getByTestId('wizard-next')).toBeDisabled()
    await wizard.getByTestId('wizard-import').click()
    await expect(wizard).toBeHidden()
    await expect(page.getByTestId('nav-cohorts')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('import-wizard')).toBeVisible()
    await expect(page.getByTestId('import-into')).toHaveValue('empty')
  })
})
