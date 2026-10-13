// The view-only parts of a request frame: its Response node (the table it
// returns, then every other part of the response), group fan-out wires
// and attribute output columns. None of
// them is request JSON: opening and saving leaves the request's bytes
// alone.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { analysisAt, analysisRow, drag, expect, test } from './harness.ts'

const FILE = 'analyses/r1_grouped.json'
// House style, as the studio writes it: saving unchanged keeps these bytes.
const TEXT = `{
  "cohort": {"filename": "ab_test.pulse", "data_dir": "cohorts"},
  "attributes": [{"type": "ATTR_FORMULA", "field": "device", "label": "mobile", "expression": "device == \\"mobile\\" ? 1 : 0"}],
  "groups": [{"type": "GROUP_CATEGORY", "field": "region"}],
  "aggregations": [
    {"type": "AGG_COUNT", "field": "user_id", "label": "users"},
    {"type": "AGG_AVERAGE", "field": "pages_viewed", "label": "avg_pages"}
  ],
  "tests": [{"type": "TEST_WELCH", "field": "pages_viewed", "split_by": "arm", "label": "pages"}],
  "regressions": [{"type": "REG_OLS", "name": "fit", "target": "revenue", "predictors": ["pages_viewed"]}]
}
`

const RESULT = '["(result)"]'

test.describe('grouped request', () => {
  test.use({ workspace: 'ab-test-readout', viewport: { width: 1800, height: 1000 } })

  test('shows its result table, fan-out and unused attribute column; edits follow', async ({ page, studio }) => {
    writeFileSync(join(studio.ws, FILE), TEXT)
    await page.goto('/')
    await analysisAt(page, FILE).click()
    const graph = page.getByTestId('request-graph')
    const result = graph.getByTestId('result-node')
    await expect(result).toHaveCount(1)
    await expect(result).toHaveAttribute('data-path', RESULT)

    // Columns in order: the group key, then the aggregation labels, each wired.
    await expect(result.locator('[data-col]')).toHaveCount(3)
    await expect(result.locator('.result-col .k')).toHaveText(['region', 'users', 'avg_pages'])
    await expect(result.locator('[data-col="region"]')).toHaveAttribute('data-kind', 'key')
    const resultWires = graph.locator('.react-flow__edge.result-wire')
    // Three columns, the test and the regression.
    await expect(resultWires).toHaveCount(5)
    await expect(graph.locator(`.react-flow__edge[data-id='groups[0]|key->${RESULT}|col:region']`)).toHaveCount(1)

    // Below the table: Tests (per group) and Regressions (not), each row
    // wired from its entry.
    await expect(result.locator('.gnode-head')).toContainText('Response')
    await expect(result.getByTestId('response-part')).toHaveText([/^Table · 4 rows/, /^Tests/, /^Regressions/])
    await expect(graph.locator(`.react-flow__edge[data-id='tests[0]|response->${RESULT}|part:tests[0]']`)).toHaveCount(1)
    await expect(graph.locator(`.react-flow__edge[data-id='regressions[0]|response->${RESULT}|part:regressions[0]']`)).toHaveCount(1)
    const testRow = result.locator('[data-testid="response-row"][data-row="tests[0]"]')
    await expect(testRow.locator('.k')).toHaveText('pages')
    await expect(testRow.getByTestId('response-fanout')).toHaveText('× 4 groups')
    const regRow = result.locator('[data-testid="response-row"][data-row="regressions[0]"]')
    await expect(regRow.getByTestId('response-fanout')).toHaveCount(0)
    // The regression's own preview gives its headline.
    await expect(regRow.getByTestId('response-headline')).toContainText(/R² [\d.]+/, { timeout: 30_000 })
    // The last aggregation's preview holds the whole table.
    const preview = result.getByTestId('result-preview')
    await expect(preview).toHaveAttribute('data-state', 'ok')
    await expect(preview.getByTestId('result-count')).toContainText(/\d+ rows?/)

    // The group fans out to the aggregations and the test, not the regression.
    const scope = graph.locator('.react-flow__edge.scope-wire')
    await expect(scope).toHaveCount(3)
    const targets = await scope.evaluateAll((els) => els.map((e) => (e.getAttribute('data-id') ?? '').split('->')[1].split('|')[0]).sort())
    expect(targets).toEqual(['aggregations[0]', 'aggregations[1]', 'tests[0]'])
    const label = graph.getByTestId('scope-label')
    await expect(label).toHaveCount(1)
    await expect(label).toContainText(/per region ×\d+/)

    // The attribute's column is read by nothing: dashed stub and a warning.
    const attr = graph.locator('[data-path="attributes[0]"]')
    await expect(attr.getByTestId('attr-output')).toHaveAttribute('data-used', 'false')
    await expect(attr.getByTestId('attr-output')).toContainText('+ column')
    await expect(attr.getByTestId('node-badge')).toHaveAttribute('data-severity', 'warning')

    // Opening and saving a layout change leaves the request bytes alone;
    // the Result node's position goes to the sidecar like any node's.
    const node = graph.locator('.react-flow__node').filter({ has: page.locator(`[data-path='${RESULT}']`) })
    const box = (await node.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + 12)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + 80, { steps: 6 })
    await page.mouse.up()
    await expect(page.getByTestId('dirty-state')).toContainText('unsaved')
    await page.keyboard.press('ControlOrMeta+s')
    await expect(page.getByTestId('dirty-state')).toHaveText('saved')
    expect(studio.read(FILE)).toBe(TEXT)
    expect(Object.keys((JSON.parse(studio.read('analyses/r1_grouped.layout.json')) as { nodes: object }).nodes)).toContain(RESULT)

    // The Result node and its wires cannot be deleted.
    await node.click()
    await page.keyboard.press('Delete')
    await expect(result).toHaveCount(1)
    await expect(page.getByTestId('inspector')).toHaveCount(0)

    // Wiring the attribute's column into the group clears the warning and
    // makes it the key column.
    const out = attr.locator('.react-flow__handle[data-handleid="out"]')
    const field = graph.locator('[data-path="groups[0]"] .react-flow__handle[data-handleid="in:field"]')
    const release = await drag(page, out, field)
    await release()
    await expect(graph.locator('[data-path="groups[0]"] [data-row="field"]')).toContainText('mobile')
    await expect(attr.getByTestId('attr-output')).toHaveAttribute('data-used', 'true')
    await expect(attr.getByTestId('node-badge')).toHaveCount(0)
    await expect(result.locator('.result-col .k')).toHaveText(['mobile', 'users', 'avg_pages'])
    await expect(label).toContainText('per mobile')

    // Removing the group removes its fan-out and its key column.
    await graph.locator('[data-path="groups[0]"]').click()
    await page.getByTestId('delete-node').click()
    await expect(graph.locator('[data-path="groups[0]"]')).toHaveCount(0)
    await expect(scope).toHaveCount(0)
    await expect(result.locator('.result-col .k')).toHaveText(['users', 'avg_pages'])
    await expect(result.locator('[data-kind="key"]')).toHaveCount(0)
    // With the group gone nothing reads the column again.
    await expect(attr.getByTestId('attr-output')).toHaveAttribute('data-used', 'false')
    // ... and the test no longer fans out.
    await expect(testRow.getByTestId('response-fanout')).toHaveCount(0)
  })

  test('a grouped test previews every group; a run agrees', async ({ page, studio }) => {
    writeFileSync(join(studio.ws, FILE), TEXT)
    await page.goto('/')
    await analysisAt(page, FILE).click()
    const graph = page.getByTestId('request-graph')
    const testRow = graph.locator('[data-testid="response-row"][data-row="tests[0]"]')
    await expect(testRow).toHaveCount(1)
    // A grouped test's probe carries one result per group: the node
    // preview shows the worst p over the four regions and each group's p,
    // and the Response row has its headline before any run.
    const testPreview = graph.locator('[data-path="tests[0]"]').getByTestId('preview')
    await expect(testPreview.getByTestId('preview-grouped')).toHaveText(/p = [<\d.]+ ×4/, { timeout: 30_000 })
    await expect(testPreview).toContainText(/\/4 sig\./)
    await expect(testRow.getByTestId('response-headline')).toContainText(/p = [<\d.]+ ×4/)
    const previewed = (await testRow.getByTestId('response-headline').innerText()).trim()
    await page.getByTestId('run-button').click()
    await expect(page.getByTestId('run-status')).toHaveAttribute('data-phase', 'done', { timeout: 30_000 })
    await expect(testRow.getByTestId('response-headline')).toHaveText(previewed)
  })

  test('return strikes what it drops; multiplicity tags the tests', async ({ page, studio }) => {
    const file = 'analyses/r2_shaped.json'
    const text = `{
  "cohort": {"filename": "ab_test.pulse", "data_dir": "cohorts"},
  "multiplicity": {"method": "holm", "family": "request"},
  "aggregations": [{"type": "AGG_COUNT", "field": "user_id", "label": "users"}],
  "tests": [
    {"type": "TEST_WELCH", "field": "pages_viewed", "split_by": "arm", "label": "pages"},
    {"type": "TEST_WELCH", "field": "revenue", "split_by": "arm", "label": "revenue"}
  ],
  "regressions": [{"type": "REG_OLS", "name": "fit", "target": "revenue", "predictors": ["pages_viewed"]}],
  "return": {"exclude": ["tests", "data[*].users"]}
}
`
    writeFileSync(join(studio.ws, file), text)
    await page.goto('/')
    await analysisAt(page, file).click()
    const graph = page.getByTestId('request-graph')
    const result = graph.getByTestId('result-node')
    await expect(result.getByTestId('response-part')).toHaveText([/^Table/, /^Tests/, /^Regressions/])
    // Return wires into the header; tests and the users column are struck.
    await expect(graph.locator(`.react-flow__edge.return-wire[data-id='return|response->${RESULT}|head']`)).toHaveCount(1)
    await expect(result.getByTestId('response-return')).toHaveText('trimmed')
    const tests = result.locator('[data-testid="response-part"][data-part="tests"]')
    await expect(tests).toHaveAttribute('data-trimmed', 'true')
    await expect(tests).toHaveAttribute('title', 'trimmed by return')
    const rows = result.locator('[data-testid="response-row"][data-part="tests"]')
    await expect(rows).toHaveCount(2)
    for (const row of await rows.all()) {
      await expect(row).toHaveAttribute('data-trimmed', 'true')
      await expect(row).toHaveAttribute('title', 'trimmed by return')
      await expect(row.getByTestId('response-adj')).toHaveCount(1)
    }
    await expect(result.locator('[data-col="users"]')).toHaveAttribute('data-trimmed', 'true')
    await expect(result.locator('[data-testid="response-row"][data-row="regressions[0]"]')).not.toHaveAttribute('data-trimmed', 'true')
    // Multiplicity wires into the Tests header.
    await expect(graph.locator(`.react-flow__edge.multiplicity-wire[data-id='multiplicity|response->${RESULT}|sec:tests']`)).toHaveCount(1)
    expect(studio.read(file)).toBe(text)
  })
})

test.describe('table follows the engine', () => {
  test.use({ workspace: 'ab-test-readout' })

  test('analysis-only has no table, windows-only is row-level', async ({ page, studio }) => {
    const testsOnly = 'analyses/r3_tests_only.json'
    const testsText = `{
  "cohort": {"filename": "ab_test.pulse", "data_dir": "cohorts"},
  "tests": [{"type": "TEST_WELCH", "field": "revenue", "split_by": "arm", "label": "rev"}]
}
`
    const windowsOnly = 'analyses/r3_windows_only.json'
    const windowsText = `{
  "cohort": {"filename": "ab_test.pulse", "data_dir": "cohorts"},
  "windows": [{"type": "WIN_RUNNING_AVG", "field": "revenue", "label": "ra"}]
}
`
    writeFileSync(join(studio.ws, testsOnly), testsText)
    writeFileSync(join(studio.ws, windowsOnly), windowsText)
    await page.goto('/')
    await analysisAt(page, testsOnly).click()
    let result = page.getByTestId('request-graph').getByTestId('result-node')
    await expect(result.getByTestId('response-part')).toHaveText([/^Tests/])
    await expect(result.getByTestId('result-preview')).toHaveCount(0)
    await analysisAt(page, windowsOnly).click()
    result = page.getByTestId('request-graph').getByTestId('result-node')
    await expect(result.getByTestId('response-part')).toHaveText([/^Table/])
    await expect(result.getByTestId('result-row-level')).toHaveCount(1)
    await expect(result.locator('.result-col .k')).toHaveText(['ra'])
    expect(studio.read(testsOnly)).toBe(testsText)
    expect(studio.read(windowsOnly)).toBe(windowsText)
  })
})

test('every compose slot lane gets its own Result node', async ({ page }) => {
  await page.goto('/')
  await analysisRow(page, '11_readout.compose.json').click()
  const graph = page.getByTestId('request-graph')
  await expect(graph.getByTestId('lane-title')).toHaveText(['guardrails', 'scorecard', 'revenue_sensitivity', 'regression_adjustment'])
  const results = graph.getByTestId('result-node')
  await expect(results).toHaveCount(4)
  for (let i = 0; i < 4; i++) {
    const r = graph.locator(`[data-path='requests[${i}]["(result)"]']`)
    await expect(r).toHaveCount(1)
    await expect(r.locator('[data-col="users"]')).toHaveCount(1)
  }
})

test('the compose root lane gets a Response node; its multiplicity reaches every slot', async ({ page, studio }) => {
  const file = 'analyses/09_segments.compose.json'
  const before = studio.read(file)
  await page.goto('/')
  await analysisAt(page, file).click()
  const graph = page.getByTestId('request-graph')
  const root = graph.locator(`[data-path='${RESULT}']`)
  await expect(root).toHaveCount(1)
  // The compose response lists every slot (responses[i]).
  await expect(root.getByTestId('response-part')).toHaveText([/^Slots/])
  const slots = root.locator('[data-testid="response-row"][data-part="responses"]')
  await expect(slots).toHaveCount(12)
  await expect(slots.first().locator('.k')).toHaveText('device=desktop')
  // The root block is every slot's default: a wire into each slot's
  // Tests header, and each test tagged adj. by the compose root.
  await expect(graph.locator('.react-flow__edge.multiplicity-wire')).toHaveCount(12)
  await expect(graph.locator(`.react-flow__edge[data-id='multiplicity|response->requests[3]${RESULT}|sec:tests']`)).toHaveCount(1)
  const adj = graph.locator(`[data-path='requests[0]${RESULT}'] [data-testid="response-adj"]`)
  await expect(adj).toHaveAttribute('data-by', 'compose')
  // A run fills the slots' headlines from the compose response.
  await page.getByTestId('run-button').click()
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-phase', 'done', { timeout: 60_000 })
  await expect(slots.first().getByTestId('response-headline')).toHaveText(/\d+ rows?|tests/)
  expect(studio.read(file)).toBe(before)
})

test.describe('chain', () => {
  test.use({ workspace: 'retail-chain', viewport: { width: 1600, height: 1000 } })

  test('every stage lane gets its own Result node', async ({ page }) => {
    await page.goto('/')
    await analysisRow(page, '06_spend_distribution_chain.json').click()
    const graph = page.getByTestId('request-graph')
    await expect(graph.getByTestId('lane-title')).toHaveText(['per_customer', 'by_spend_band'])
    await expect(graph.getByTestId('result-node')).toHaveCount(2)
    await expect(graph.locator(`[data-path='stages[0].request["(result)"]']`)).toHaveCount(1)
    await expect(graph.locator(`[data-path='stages[1].request["(result)"]'] [data-kind="key"]`)).not.toHaveCount(0)
    // Stage wires still run from the previous stage's aggregations.
    await expect(graph.locator('.react-flow__edge.stage-wire')).not.toHaveCount(0)
  })
})
