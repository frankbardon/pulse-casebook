// Chains end to end, against a temp copy of retail-at-scale's requests
// over a small orders cohort synthesized from its committed January spec
// (global-setup.ts): stages as lanes with live previews, stage-to-stage
// wires, editing and saving, adding a stage, and a full run.
import { analysisAt, drag, expect, test } from './harness.ts'

test.use({ workspace: 'retail-chain', viewport: { width: 1600, height: 1000 } })

const CHAIN = 'analyses/06_spend_distribution_chain.json'

test('a chain opens as stage lanes with previews and stage-to-stage wires', async ({ page }) => {
  await page.goto('/')
  await analysisAt(page, CHAIN).click()
  const graph = page.getByTestId('request-graph')
  await expect(graph.getByTestId('lane-title')).toHaveText(['per_customer', 'by_spend_band'])
  await expect(graph.locator('[data-path="cohort"]')).toContainText('orders.pulse')
  const preview = (id: string) => graph.locator(`[data-path="${id}"] [data-testid="preview"]`)
  await expect(preview('cohort')).toContainText('20,000 rows')
  await expect(preview('stages[0].request.filterers[0]')).toHaveAttribute('data-state', 'ok')
  await expect(preview('stages[0].request.aggregations[0]')).toHaveAttribute('data-state', 'ok')
  await expect(preview('stages[1].request.aggregations[1]')).toHaveAttribute('data-state', 'ok')
  // Stage 2 reads stage 1's labels: `spend` feeds the band formula.
  await expect(graph.locator('.react-flow__edge.stage-wire, .stage-wire')).not.toHaveCount(0)
  await expect(graph.locator('[data-path="stages[1].request.attributes[0]"] [data-row="field"]')).not.toHaveClass(/unresolved/)
  await expect(page.getByTestId('dirty-state')).toHaveText('saved')
})

test('chain edits save to disk; a new stage reads the last one', async ({ page, studio }) => {
  const before = JSON.parse(studio.read(CHAIN)) as { stages: { name: string; request: Record<string, unknown> }[] }
  await page.goto('/')
  await analysisAt(page, CHAIN).click()
  const graph = page.getByTestId('request-graph')
  await expect(graph.getByTestId('lane-title')).toHaveCount(2)

  // Rename a stage label in the inspector.
  await graph.locator('[data-path="stages[0].request.aggregations[1]"]').click()
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-node', 'stages[0].request.aggregations[1]')
  await page.getByTestId('inspector').locator('[data-field="label"] input').fill('order_count')
  await expect(page.getByTestId('dirty-state')).toContainText('unsaved')
  // Stage 2 read `orders`: that wire is now unresolved and flagged.
  await expect(graph.locator('[data-path="stages[1].request.aggregations[2]"] [data-row="field"]')).toHaveClass(/unresolved/)
  // Rewire it to the renamed label from stage 1.
  await graph.locator('.react-flow__controls-fitview').click()
  const src = graph.locator('[data-path="stages[0].request.aggregations[1]"] .react-flow__handle[data-handleid="out"]')
  const dst = graph.locator('[data-path="stages[1].request.aggregations[2]"] [data-row="field"] .react-flow__handle')
  await (await drag(page, src, dst))()
  await expect(graph.locator('[data-path="stages[1].request.aggregations[2]"] [data-row="field"]')).toContainText('order_count')

  // A third stage, counting the bands.
  await page.getByTestId('lane-add').click()
  await expect(graph.getByTestId('lane-title')).toHaveText(['per_customer', 'by_spend_band', 'stage_3'])
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByTestId('dirty-state')).toHaveText('saved')

  const after = JSON.parse(studio.read(CHAIN)) as typeof before
  expect(after.stages.map((st) => st.name)).toEqual(['per_customer', 'by_spend_band', 'stage_3'])
  const aggs = (i: number) => after.stages[i].request.aggregations as { type: string; field: string; label: string }[]
  expect(aggs(0)[1]).toEqual({ type: 'AGG_DISTINCT_COUNT', field: 'order_id', label: 'order_count' })
  expect(aggs(1)[2]).toEqual({ type: 'AGG_AVERAGE', field: 'order_count', label: 'avg_orders' })
  expect(aggs(2)).toEqual([{ type: 'AGG_COUNT', field: expect.any(String), label: 'n' }])
  // Everything else is as it was.
  expect({ ...after, stages: after.stages.slice(0, 2) }).toEqual({
    ...before,
    stages: [
      { ...before.stages[0], request: { ...before.stages[0].request, aggregations: aggs(0) } },
      { ...before.stages[1], request: { ...before.stages[1].request, aggregations: aggs(1) } },
    ],
  })

  // The saved chain runs: one result tab per stage.
  await page.getByTestId('run-button').click()
  const panel = page.getByTestId('results-panel')
  await expect(panel.getByTestId('run-status')).toHaveAttribute('data-phase', 'done', { timeout: 30_000 })
  await expect(panel.getByTestId('run-status')).toContainText('ok')
  await expect(panel.getByTestId('results-section')).toHaveText(['per_customer', 'by_spend_band', 'stage_3'])
})
