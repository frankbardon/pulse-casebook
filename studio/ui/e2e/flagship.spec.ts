// Flagship acceptance: rebuild showcase/ab-test-readout/req/11_readout.compose.json
// from an empty canvas through the UI only (New request, lanes, palette,
// inspector, wires), save it, and prove the saved file is the same request
// as the original: semantically equal JSON (object key order is free, array
// order is not: it is the engine's output order) and an identical engine
// result for both.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { drag, expect, REPO, test } from './harness.ts'

test.use({ workspace: 'ab-test-readout', viewport: { width: 1800, height: 1600 } })

const ORIGINAL = 'req/11_readout.compose.json'
const REBUILT = 'req/readout_rebuilt.compose.json'

// Inputs the flagship wires on the canvas rather than typing.
const WIRED = new Set(['split_by', 'rows', 'cols', 'predictors'])

// Studio drives one open request: placing, wiring and inspector edits.
class Studio {
  readonly graph: Locator
  readonly insp: Locator
  constructor(readonly page: Page) {
    this.graph = page.getByTestId('request-graph')
    this.insp = page.getByTestId('inspector')
  }

  node(id: string): Locator {
    return this.graph.locator(`[data-path="${id}"]`)
  }

  async fit(): Promise<void> {
    await this.graph.locator('.react-flow__controls-fitview').click()
  }

  async select(id: string): Promise<void> {
    // A wire zoomed in: fit back so the head is on the canvas.
    if (!(await this.onCanvas(this.node(id).locator('.gnode-head')))) await this.fit()
    await this.node(id).locator('.gnode-head').click()
    await expect(this.insp).toHaveAttribute('data-node', id)
  }

  // place adds op from the palette panel to lane `lane` (a palette click
  // goes into the selected node's lane) and expects it at id.
  async place(lane: number, op: string, id: string): Promise<void> {
    await this.select(`requests[${lane}].cohort`)
    const palette = this.page.getByTestId('palette')
    await palette.getByTestId('palette-search').fill(op)
    await palette.locator(`[data-op="${op}"]`).click()
    await expect(this.insp).toHaveAttribute('data-node', id)
    await expect(this.node(id)).toBeVisible()
  }

  // set types into an inspector field of the selected node: text inputs
  // and textareas commit as typed, selects by option.
  async set(key: string, value: string): Promise<void> {
    const f = this.insp.locator(`[data-field="${key}"]`)
    const select = f.locator('select')
    if ((await select.count()) > 0) await select.selectOption(value)
    else await f.locator('input, textarea').first().fill(value)
  }

  async edit(id: string, values: Record<string, string>): Promise<void> {
    await this.select(id)
    for (const [k, v] of Object.entries(values)) await this.set(k, v)
  }

  // fill sets the values of the entry at id (lane `lane`): grouping
  // inputs the inspector does not offer (split_by, rows, cols) and list
  // inputs (`predictors[0]`, each wire appends the next) are wired
  // from the lane's cohort field port; everything else is typed into the
  // inspector.
  async fill(lane: number, id: string, values: Record<string, string>): Promise<void> {
    for (const [k, v] of Object.entries(values)) {
      if (WIRED.has(k.replace(/\[\d+\]$/, ''))) {
        await this.wire(`requests[${lane}].cohort`, `field:${v}`, id, k)
        await expect(this.node(id).locator(`[data-row="${k}"]`)).toContainText(v)
      } else {
        await this.select(id)
        await this.set(k, v)
      }
    }
  }

  async onCanvas(el: Locator): Promise<boolean> {
    const a = await el.boundingBox()
    const c = (await this.graph.locator('.react-flow').boundingBox())!
    return !!a && a.x >= c.x && a.y >= c.y && a.x + a.width <= c.x + c.width && a.y + a.height <= c.y + c.height
  }

  // focus fits the graph, then wheel-zooms around the middle of from and
  // to while both stay on the canvas, until from (a 6px port at zoom 1)
  // is at least 3px: React Flow snaps a drop within its connection
  // radius, so that is precise enough.
  async focus(from: Locator, to: Locator): Promise<void> {
    await this.fit()
    for (let i = 0; i < 12; i++) {
      const a = (await from.boundingBox())!
      const b = (await to.boundingBox())!
      if (a.height >= 3) break
      await this.page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2)
      await this.page.mouse.wheel(0, -150)
      await this.page.waitForTimeout(80)
      if (!(await this.onCanvas(from)) || !(await this.onCanvas(to))) {
        await this.page.mouse.wheel(0, 150)
        await this.page.waitForTimeout(80)
        break
      }
    }
    expect(await this.onCanvas(from), 'wire source on the canvas').toBe(true)
    expect(await this.onCanvas(to), 'wire target on the canvas').toBe(true)
  }

  // wire drags a field port (cohort `field:<name>` or a label `out`) of
  // from into the input row of to.
  async wire(from: string, handle: string, to: string, row: string): Promise<void> {
    const src = this.node(from).locator(`.react-flow__handle[data-handleid="${handle}"]`)
    const dst = this.node(to).locator(`[data-row="${row}"] .react-flow__handle`)
    await this.focus(src, dst)
    await (await drag(this.page, src, dst))()
    await expect(this.node(to).locator(`[data-row="${row}"]`)).not.toHaveClass(/unresolved/)
  }

  // dropPort drags a field port onto empty canvas (bottom-right corner)
  // and picks op from the port palette: placed in the port's lane, wired.
  async dropPort(from: string, handle: string, op: string, id: string): Promise<void> {
    const src = this.node(from).locator(`.react-flow__handle[data-handleid="${handle}"]`)
    const a = (await src.boundingBox())!
    const box = (await this.graph.locator('.react-flow').boundingBox())!
    await this.page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
    await this.page.mouse.down()
    await this.page.mouse.move(box.x + box.width - 24, box.y + box.height - 24, { steps: 12 })
    await this.page.mouse.up()
    const picker = this.page.getByTestId('port-palette')
    await picker.getByTestId('palette-search').fill(op)
    await picker.locator(`[data-op="${op}"]`).click()
    await expect(picker).toHaveCount(0)
    await expect(this.insp).toHaveAttribute('data-node', id)
  }

  async renameLane(lane: number, name: string): Promise<void> {
    await this.graph.locator(`[data-lane="requests[${lane}]"] [data-testid="lane-title"]`).dblclick()
    await this.page.getByTestId('lane-title-input').fill(name)
    await this.page.getByTestId('lane-title-input').press('Enter')
    await expect(this.graph.locator(`[data-lane="requests[${lane}]"] [data-testid="lane-title"]`)).toHaveText(name)
  }
}

// Envelope bits that differ between two runs of the same request.
function stable(envelope: string): unknown {
  return JSON.parse(envelope, (k, v) => (/(^|_)(elapsed|duration|timing|timings|took)(_|$)|_ms$|_ns$/.test(k) ? undefined : v))
}

test('the flagship readout rebuilds from an empty canvas and saves equal to the original', async ({ page, studio }) => {
  test.setTimeout(90_000)
  await page.goto('/')

  // 1. A new compose request over the synthesized cohort.
  await page.getByTestId('new-request-open').click()
  await page.getByTestId('new-root').selectOption('compose')
  await page.getByTestId('new-cohort').selectOption('ab_test.pulse')
  await expect(page.getByTestId('new-dir')).toHaveValue('req')
  await page.getByTestId('new-name').fill('readout_rebuilt')
  await page.getByTestId('new-create').click()
  const s = new Studio(page)
  await expect(s.graph.getByTestId('lane-title')).toHaveText(['slot_1'])
  expect(studio.exists(REBUILT)).toBe(true)

  // 2. Four lanes, named as the readout's slots.
  for (let i = 0; i < 3; i++) await page.getByTestId('lane-add').click()
  await expect(s.graph.getByTestId('lane-title')).toHaveCount(4)
  const lanes = ['guardrails', 'scorecard', 'revenue_sensitivity', 'regression_adjustment']
  for (const [i, name] of lanes.entries()) await s.renameLane(i, name)
  await page.getByTestId('palette-toggle').click()
  await s.fit()

  // 3. Scorecard first, while the canvas is roomy: the CUPED formula is
  // wired from pages_viewed, its label into the Welch test's field.
  // Dragging the pages_viewed port onto empty canvas offers what it can
  // feed; the formula is placed with its field wired.
  await s.fit()
  await s.dropPort('requests[1].cohort', 'field:pages_viewed', 'ATTR_FORMULA', 'requests[1].attributes[0]')
  await expect(s.node('requests[1].attributes[0]').locator('[data-row="field"]')).toContainText('pages_viewed')
  await s.edit('requests[1].attributes[0]', {
    label: 'pages_cuped',
    expression: 'pages_viewed - 0.7601 * (prior_sessions - 10.0076)',
  })

  const scorecard: [string, Record<string, string>][] = [
    ['TEST_PROP_Z', { field: 'trial_started', split_by: 'arm', label: 'trial_start', success: 'yes' }],
    ['TEST_PROP_Z', { field: 'paid_converted', split_by: 'arm', label: 'paid_conversion', success: 'yes' }],
    ['TEST_WELCH', { field: 'revenue', split_by: 'arm', label: 'revenue_per_user' }],
    ['TEST_WELCH', { label: 'pages_viewed_cuped' }],
    ['TEST_WELCH', { field: 'days_to_convert', split_by: 'arm', label: 'days_to_convert' }],
    ['TEST_PROP_Z', { field: 'retained_30d', split_by: 'arm', label: 'retention_30d', success: 'yes' }],
  ]
  for (const [i, [op, values]] of scorecard.entries()) {
    const id = `requests[1].tests[${i}]`
    await s.place(1, op, id)
    await s.fill(1, id, values)
    if (i === 3) {
      // The CUPED Welch: both inputs wired on the canvas.
      await s.fit()
      await s.wire('requests[1].attributes[0]', 'out', id, 'field')
      await s.wire('requests[1].cohort', 'field:arm', id, 'split_by')
      await expect(s.node(id).locator('[data-row="field"]')).toContainText('pages_cuped')
    }
  }
  await s.place(1, 'AGG_COUNT', 'requests[1].aggregations[0]')
  await s.edit('requests[1].aggregations[0]', { field: 'user_id', label: 'users' })
  await s.place(1, 'MULTIPLICITY', 'requests[1].multiplicity')
  await s.set('family', 'request')

  // 4. Guardrails: SRM and balance tests under a request-wide Holm.
  await s.place(0, 'AGG_COUNT', 'requests[0].aggregations[0]')
  await s.edit('requests[0].aggregations[0]', { field: 'user_id', label: 'users' })
  const guardrails: [string, Record<string, string>][] = [
    ['TEST_CHISQ', { rows: 'arm', cols: 'assign_week', label: 'srm_by_week' }],
    ['TEST_CHISQ', { rows: 'arm', cols: 'device', label: 'balance_device' }],
    ['TEST_CHISQ', { rows: 'arm', cols: 'plan_tier', label: 'balance_plan_tier' }],
    ['TEST_CHISQ', { rows: 'arm', cols: 'region', label: 'balance_region' }],
    ['TEST_CHISQ', { rows: 'arm', cols: 'user_type', label: 'balance_user_type' }],
    ['TEST_WELCH', { field: 'prior_sessions', split_by: 'arm', label: 'balance_prior_sessions' }],
  ]
  for (const [i, [op, values]] of guardrails.entries()) {
    await s.place(0, op, `requests[0].tests[${i}]`)
    await s.fill(0, `requests[0].tests[${i}]`, values)
  }
  await s.place(0, 'MULTIPLICITY', 'requests[0].multiplicity')
  await s.set('family', 'request')

  // 5. Revenue sensitivity: a rank test.
  await s.place(2, 'AGG_COUNT', 'requests[2].aggregations[0]')
  await s.edit('requests[2].aggregations[0]', { field: 'user_id', label: 'users' })
  await s.place(2, 'TEST_MANN_WHITNEY_U', 'requests[2].tests[0]')
  await s.fill(2, 'requests[2].tests[0]', { field: 'revenue', split_by: 'arm', label: 'revenue_mann_whitney' })

  // 6. Regression adjustment: unadjusted and prior_sessions-adjusted OLS.
  await s.place(3, 'AGG_COUNT', 'requests[3].aggregations[0]')
  await s.edit('requests[3].aggregations[0]', { field: 'user_id', label: 'users' })
  await s.place(3, 'REG_OLS', 'requests[3].regressions[0]')
  await s.fill(3, 'requests[3].regressions[0]', { name: 'pages_unadjusted', target: 'pages_viewed', 'predictors[0]': 'is_variant' })
  await s.place(3, 'REG_OLS', 'requests[3].regressions[1]')
  await s.fill(3, 'requests[3].regressions[1]', { name: 'pages_adjusted', target: 'pages_viewed', 'predictors[0]': 'is_variant', 'predictors[1]': 'prior_sessions' })

  // 7. Clean: no validation issue anywhere, then save.
  await expect(s.graph.getByTestId('node-badge')).toHaveCount(0)
  await expect(page.getByTestId('dirty-state')).toContainText('unsaved')
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByTestId('dirty-state')).toHaveText('saved')

  // 8. The saved file is the original request.
  const original = readFileSync(join(REPO, 'showcase/ab-test-readout', ORIGINAL), 'utf8')
  const saved = studio.read(REBUILT)
  expect(JSON.parse(saved)).toEqual(JSON.parse(original))

  // 9. ...and runs to the same result.
  const run = async (path: string, text: string) => {
    const res = await page.request.post('/api/run', { data: { path, request: JSON.parse(text), client: `flagship-${path}` } })
    expect(res.ok()).toBe(true)
    const body = (await res.json()) as { ok: boolean; text: string }
    expect(body.ok).toBe(true)
    return stable(body.text)
  }
  expect(await run(REBUILT, saved)).toEqual(await run(ORIGINAL, original))
})
