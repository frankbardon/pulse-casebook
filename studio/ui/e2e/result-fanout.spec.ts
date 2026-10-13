// The view-only parts of a request frame: its Result node (the table it
// returns), group fan-out wires and attribute output columns. None of
// them is request JSON: opening and saving leaves the request's bytes
// alone.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { drag, expect, test } from './harness.ts'

const FILE = 'req/r1_grouped.json'
// House style, as the studio writes it: saving unchanged keeps these bytes.
const TEXT = `{
  "cohort": {"filename": "ab_test.pulse", "data_dir": "."},
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
    writeFileSync(join(studio.dir, FILE), TEXT)
    await page.goto('/')
    await page.getByRole('button', { name: FILE }).click()
    const graph = page.getByTestId('request-graph')
    const result = graph.getByTestId('result-node')
    await expect(result).toHaveCount(1)
    await expect(result).toHaveAttribute('data-path', RESULT)

    // Columns in order: the group key, then the aggregation labels, each wired.
    await expect(result.locator('[data-col]')).toHaveCount(3)
    await expect(result.locator('.result-col .k')).toHaveText(['region', 'users', 'avg_pages'])
    await expect(result.locator('[data-col="region"]')).toHaveAttribute('data-kind', 'key')
    const resultWires = graph.locator('.react-flow__edge.result-wire')
    await expect(resultWires).toHaveCount(3)
    await expect(graph.locator(`.react-flow__edge[data-id='groups[0]|key->${RESULT}|col:region']`)).toHaveCount(1)
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
    expect(Object.keys((JSON.parse(studio.read('req/r1_grouped.layout.json')) as { nodes: object }).nodes)).toContain(RESULT)

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
  })
})

test('every compose slot lane gets its own Result node', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'req/11_readout.compose.json' }).click()
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

test.describe('chain', () => {
  test.use({ workspace: 'retail-chain', viewport: { width: 1600, height: 1000 } })

  test('every stage lane gets its own Result node', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'req/06_spend_distribution_chain.json' }).click()
    const graph = page.getByTestId('request-graph')
    await expect(graph.getByTestId('lane-title')).toHaveText(['per_customer', 'by_spend_band'])
    await expect(graph.getByTestId('result-node')).toHaveCount(2)
    await expect(graph.locator(`[data-path='stages[0].request["(result)"]']`)).toHaveCount(1)
    await expect(graph.locator(`[data-path='stages[1].request["(result)"]'] [data-kind="key"]`)).not.toHaveCount(0)
    // Stage wires still run from the previous stage's aggregations.
    await expect(graph.locator('.react-flow__edge.stage-wire')).not.toHaveCount(0)
  })
})
