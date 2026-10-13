// Vectors and joins end to end, against a temp copy of
// privacy-safe-sharing's requests over small synthesized source and twin
// cohorts (global-setup.ts).
import { expect, test } from './harness.ts'

test.use({ workspace: 'privacy-safe-sharing', viewport: { width: 1600, height: 1000 } })

test('a vector draws its member wires, feeds its matrix and previews member stats', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'req/09_correlation_matrix.json' }).click()
  const graph = page.getByTestId('request-graph')
  await expect(graph.getByTestId('lane-title')).toHaveText(['source', 'twin'])
  const vector = graph.locator('[data-path="requests[0].vectors[0]"]')
  await expect(vector).toContainText('drivers')
  await expect(vector.locator('.gnode-row:not(.port)[data-row^="fields["]')).toHaveCount(6)
  await expect(vector.locator('[data-row="fields[6]"]')).toHaveClass(/port/)
  await expect(vector.locator('.gnode-row.unresolved')).toHaveCount(0)
  await expect(graph.locator('[data-path="requests[0].matrices[0]"] [data-row="vector"]')).not.toHaveClass(/unresolved/)
  // A vector-backed matrix asks for no inline fields.
  await expect(graph.locator('[data-path="requests[0].matrices[0]"] .gnode-row.port')).toHaveCount(0)
  const preview = vector.locator('[data-testid="preview"]')
  await expect(preview).toHaveAttribute('data-state', 'ok')
  await expect(preview).toContainText('6 members')

  await vector.click()
  const inspector = page.getByTestId('inspector')
  await expect(inspector).toHaveAttribute('data-node', 'requests[0].vectors[0]')
  await expect(inspector.locator('[data-field="coerce"] select')).toHaveValue('binary')
  await expect(inspector.locator('[data-field="kind"] select')).toHaveValue('')
  await expect(page.getByTestId('dirty-state')).toHaveText('saved')

  // The matrix picks its vector from the lane's vectors.
  await graph.locator('[data-path="requests[0].matrices[0]"]').click()
  await expect(inspector).toHaveAttribute('data-node', 'requests[0].matrices[0]')
  const picker = inspector.locator('[data-field="vector"] select')
  await expect(picker).toHaveValue('drivers')
  await expect(picker.locator('option')).toHaveText(['(unset)', 'drivers'])
  await expect(page.getByTestId('dirty-state')).toHaveText('saved')
})

test('a join draws its keys and joined fields, previews joined rows and flags an unknown right cohort', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'req/10_exact_record_match.json' }).click()
  const graph = page.getByTestId('request-graph')
  await expect(graph.getByTestId('lane-title')).toHaveText(['control_source_vs_itself', 'twin_vs_source'])
  const join = graph.locator('[data-path="requests[0].joins[0]"]')
  await expect(join).toContainText('Join')
  await expect(join).toContainText('inner')
  // Joins have their own column right of the cohort, level with it, so
  // the key wires run straight across.
  const cohortBox = () => graph.locator('.react-flow__node[data-id="requests[0].cohort"]').boundingBox()
  const joinBox = () => graph.locator('.react-flow__node[data-id="requests[0].joins[0]"]').boundingBox()
  await expect.poll(async () => (await joinBox())!.x - ((await cohortBox())!.x + (await cohortBox())!.width)).toBeGreaterThan(0)
  await expect.poll(async () => Math.abs((await joinBox())!.y - (await cohortBox())!.y)).toBeLessThan(2)
  // Eleven key pairs, one line each (left_field = right_field), every
  // left key wired from the cohort.
  await expect(join.locator('.gnode-pair:not(.port)[data-row$=".left_field"]')).toHaveCount(11)
  await expect(join.locator('[data-row$=".right_field"]')).toHaveCount(0)
  await expect(join.locator('[data-row="on[0].left_field"]')).toHaveText('region = region')
  await expect(join.locator('[data-row="on[0].left_field"] .react-flow__handle')).toHaveCount(1)
  await expect(join.locator('.gnode-row.unresolved')).toHaveCount(0)
  // The right cohort's fields, prefixed with as, are the join's outputs,
  // collapsed to one summary line.
  const joined = join.getByTestId('joined-fields')
  await expect(joined).toHaveAttribute('data-state', 'known')
  await expect(joined).toHaveAttribute('data-expanded', 'false')
  await expect(joined.getByTestId('joined-summary')).toContainText(/\d+ joined fields \(src_…\)/)
  await expect(joined.locator('[data-field]')).toHaveCount(0)
  const collapsed = (await join.boundingBox())!.height
  const toggle = joined.getByTestId('joined-toggle')
  await toggle.click()
  await expect(joined).toHaveAttribute('data-expanded', 'true')
  await expect(joined.locator('[data-field="src_products_held"]')).toBeVisible()
  await expect(joined.locator('[data-field="src_region"] .react-flow__handle')).toHaveCount(1)
  await expect.poll(async () => (await join.boundingBox())!.height).toBeGreaterThan(collapsed + 100)
  // The aggregation the joined field gets wired to.
  const agg = graph.locator('.react-flow__node[data-id="requests[0].aggregations[0]"]')
  await expect(agg).toBeVisible()

  // A joined field wired downstream keeps its wire collapsed or not: the
  // wire lands on the summary line while the list is collapsed.
  await agg.click()
  await page.getByTestId('inspector').locator('[data-field="field"] input').fill('src_age')
  const wire = graph.locator('.react-flow__edge[data-id^="requests[0].joins[0]|field:src_age->requests[0].aggregations[0]|"]')
  await expect(wire).toHaveCount(1)
  await expect(joined.locator('[data-field="src_age"]')).toHaveClass(/used/)
  await toggle.click()
  await expect(joined).toHaveAttribute('data-expanded', 'false')
  await expect.poll(async () => (await join.boundingBox())!.height).toBeLessThan(collapsed + 1)
  await expect(wire).toHaveCount(1)
  await expect(joined.locator('[data-testid="joined-summary"] .react-flow__handle.used')).toHaveCount(1)
  const box = (await joined.getByTestId('joined-summary').boundingBox())!
  // One end of the wire sits at the summary line's right edge.
  const ends = await wire.locator('.react-flow__edge-path').evaluate((el) => {
    type Pt = { x: number; y: number; matrixTransform: (m: unknown) => Pt }
    const p = el as unknown as { getScreenCTM: () => unknown; getTotalLength: () => number; getPointAtLength: (at: number) => Pt }
    const m = p.getScreenCTM()
    return [0, p.getTotalLength()].map((at) => {
      const pt = p.getPointAtLength(at).matrixTransform(m)
      return { x: pt.x, y: pt.y }
    })
  })
  expect(ends.some((pt) => Math.abs(pt.y - (box.y + box.height / 2)) < box.height && Math.abs(pt.x - (box.x + box.width)) < 16)).toBe(true)
  const preview = join.locator('[data-testid="preview"]')
  await expect(preview).toHaveAttribute('data-state', 'ok')
  await expect(preview).toContainText('joined rows')

  // The inspector edits the join; an unknown right cohort is a node issue.
  await join.click()
  const inspector = page.getByTestId('inspector')
  await expect(inspector).toHaveAttribute('data-node', 'requests[0].joins[0]')
  await expect(inspector.locator('[data-field="right"] input')).toHaveValue('customers.pulse')
  await expect(inspector.locator('[data-field="kind"] select')).toHaveValue('inner')
  await expect(inspector.getByTestId('join-pairs').locator('.insp-pair')).toHaveCount(11)
  await inspector.locator('[data-field="right"] input').fill('ghost.pulse')
  await expect(page.getByTestId('dirty-state')).toContainText('unsaved')
  await expect(joined).toHaveAttribute('data-state', 'missing')
  await expect(join.getByTestId('node-badge')).toHaveAttribute('data-severity', 'error')
  await inspector.locator('[data-field="right"] input').fill('twin.pulse')
  await expect(joined).toHaveAttribute('data-state', 'known')
})
