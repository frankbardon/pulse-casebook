import { drag, expect, test } from './harness.ts'

// Field and label wires only: the view-only Result wires and group
// fan-out wires (result-fanout.spec.ts) are left out of the counts.
const DATA_WIRES = '.react-flow__edge:not(.result-wire):not(.scope-wire)'

// Read-only smoke: every test here shares its worker's server over a temp
// copy of ab-test-readout (cohorts synthesized by global setup), so
// nothing is saved. Flows that write files live in workspace.spec.ts,
// chain.spec.ts and flagship.spec.ts with a fresh workspace per test.

test('studio shell loads', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Pulse Studio' })).toBeVisible()
  await expect(page.getByTestId('studio-dir')).toHaveText('ab-test-readout')
})

test('opens a plain request as a stage-column graph', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'req/04_metric_battery.json' }).click()
  const graph = page.getByTestId('request-graph')
  await expect(graph).toBeVisible()
  await expect(graph.locator('[data-path="tests[2]"]')).toContainText('TEST_WELCH')
  await expect(graph.locator('[data-path="cohort"]')).toContainText('categorical_u8')
  await expect(graph.locator(DATA_WIRES)).toHaveCount(13)
})

test('wires route around nodes, light up on hover, stay deletable, and remember Curves', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'req/04_metric_battery.json' }).click()
  const graph = page.getByTestId('request-graph')
  const flow = graph.locator('.graph-flow')
  const edges = graph.locator(DATA_WIRES)
  await expect(edges).toHaveCount(13)
  // Routed by default: every wire is drawn from its route once it lands.
  await expect(page.getByTestId('wire-mode')).toHaveAttribute('data-mode', 'routed')
  await expect(flow).toHaveAttribute('data-routing', 'ready')
  await expect(graph.locator(`${DATA_WIRES} .react-flow__edge-path.routed`)).toHaveCount(13)

  // Hovering a cohort field row lights exactly that field's wires and dims the rest.
  const row = graph.locator('[data-path="cohort"] .gnode-row').filter({ has: page.locator('.k', { hasText: /^arm$/ }) })
  await row.hover()
  const litCount = await graph.locator('.react-flow__edge[data-id^="cohort|field:arm->"]').count()
  expect(litCount).toBeGreaterThan(0)
  const opacities = async () =>
    graph.locator('.react-flow__edge').evaluateAll((els) =>
      els.map((e) => ({ id: e.getAttribute('data-id') ?? '', o: e.ownerDocument.defaultView!.getComputedStyle(e).opacity })),
    )
  await expect
    .poll(async () => (await opacities()).filter((x) => x.o === '1').map((x) => x.id.startsWith('cohort|field:arm->')))
    .toEqual(Array(litCount).fill(true))
  await graph.locator('.react-flow__pane').hover({ position: { x: 5, y: 5 } })
  await expect.poll(async () => (await opacities()).every((x) => x.o === '1')).toBe(true)

  // A routed wire is still clicked through its wide hit area, selected and deleted.
  const wire = graph.locator('.react-flow__edge[data-id^="cohort|field:revenue->"]').first()
  const at = await wire.locator('.react-flow__edge-interaction').evaluate((el) => {
    // A path element (the e2e tsconfig has no DOM lib).
    const path = el as unknown as {
      getTotalLength(): number
      getPointAtLength(l: number): { x: number; y: number }
      getScreenCTM(): { a: number; b: number; c: number; d: number; e: number; f: number } | null
    }
    const p = path.getPointAtLength(path.getTotalLength() / 2)
    const m = path.getScreenCTM()!
    // 6px off the drawn line: inside the hit area only.
    return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f + 6 }
  })
  await page.mouse.click(at.x, at.y)
  const selected = graph.locator('.react-flow__edge.selected')
  await expect(selected).toHaveCount(1)
  const gone = (await selected.getAttribute('data-id'))!
  await page.keyboard.press('Delete')
  await expect(edges).toHaveCount(12)
  await expect(graph.locator(`.react-flow__edge[data-id="${gone}"]`)).toHaveCount(0)
  await expect(page.getByTestId('dirty-state')).toContainText('unsaved')

  // Curves: plain bezier wires, remembered across a reload.
  await page.getByTestId('wire-mode').click()
  await expect(page.getByTestId('wire-mode')).toHaveAttribute('data-mode', 'curves')
  await expect(graph.locator('.react-flow__edge-path.routed')).toHaveCount(0)
  await expect(edges).toHaveCount(12)
  await page.reload()
  await page.getByRole('button', { name: 'req/04_metric_battery.json' }).click()
  await expect(page.getByTestId('wire-mode')).toHaveAttribute('data-mode', 'curves')
  await expect(edges).toHaveCount(13)
  await expect(graph.locator('.react-flow__edge-path.routed')).toHaveCount(0)
})

test('facet files open with a live facet preview and editable settings', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'req/02_srm_gof.facet.json' }).click()
  const graph = page.getByTestId('request-graph')
  const facet = graph.locator('[data-path="fields"]')
  await expect(facet).toContainText('FACET')
  await expect(graph.locator('[data-path="overlays[0]"]')).toContainText('OVERLAY_CHISQ_VS_POP')
  await expect(graph.locator('.react-flow__edge')).toHaveCount(1)
  // The facet node previews the facet itself: per-value counts of arm.
  await expect(facet.getByTestId('facet-result')).toHaveAttribute('data-state', 'ok')
  await expect(facet.locator('[data-testid="facet-result"] [data-field="arm"] li')).not.toHaveCount(0)
  await facet.locator('.gnode-head').click()
  const insp = page.getByTestId('inspector')
  await expect(insp).toHaveAttribute('data-node', 'fields')
  await insp.getByLabel('discrete_top_k').fill('5')
  await insp.getByLabel('discrete_top_k').press('Enter')
  await expect(facet.locator('[data-row="discrete_top_k"]')).toContainText('5')
  await expect(page.getByTestId('dirty-state')).toContainText('unsaved')
  await expect(facet.getByTestId('facet-result')).toHaveAttribute('data-state', 'ok')
})

test('cohort and non-request files do not open as graphs', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'ab_test.pulse' }).click()
  await expect(page.getByTestId('cohort-file')).toContainText('New request')
  const spec = page.getByRole('button', { name: 'data/ab_test.synth.json' })
  await expect(spec).toBeDisabled()
  await expect(spec).toHaveAttribute('title', /not a Pulse/)
})

test('compose files open as parallel lanes with per-lane previews', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'req/11_readout.compose.json' }).click()
  const graph = page.getByTestId('request-graph')
  await expect(graph.getByTestId('lane-title')).toHaveText(['guardrails', 'scorecard', 'revenue_sensitivity', 'regression_adjustment'])
  await expect(graph.locator('[data-path="requests[1].tests[3]"]')).toContainText('TEST_WELCH')
  await expect(graph.locator('[data-path="requests[2].tests[0]"]')).toContainText('TEST_MANN_WHITNEY_U')
  const preview = (id: string) => graph.locator(`[data-path="${id}"] [data-testid="preview"]`)
  await expect(preview('requests[0].aggregations[0]')).toContainText('users 40,000')
  await expect(preview('requests[3].regressions[1]')).toHaveAttribute('data-state', 'ok')
  await expect(preview('requests[1].attributes[0]')).toHaveAttribute('data-state', 'ok')
  await expect(page.getByTestId('dirty-state')).toHaveText('saved')
})

test('compose lanes reorder, rename and add', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'req/11_readout.compose.json' }).click()
  const graph = page.getByTestId('request-graph')
  const titles = graph.getByTestId('lane-title')
  await expect(titles).toHaveCount(4)
  await graph.locator('[data-lane="requests[0]"] [data-testid="lane-down"]').click()
  await expect(titles).toHaveText(['scorecard', 'guardrails', 'revenue_sensitivity', 'regression_adjustment'])
  await expect(page.getByTestId('dirty-state')).toContainText('unsaved')
  await graph.locator('[data-lane="requests[2]"] [data-testid="lane-title"]').dblclick()
  await page.getByTestId('lane-title-input').fill('mann_whitney')
  await page.getByTestId('lane-title-input').press('Enter')
  await expect(titles.nth(2)).toHaveText('mann_whitney')
  await page.getByTestId('lane-add').click()
  await expect(titles).toHaveCount(5)
  await expect(titles.nth(4)).toHaveText('request_5')
  await expect(graph.locator('[data-path="requests[4].cohort"]')).toContainText('ab_test.pulse')
})

test('selecting a node opens the inspector and edits mark the file dirty', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'req/04_metric_battery.json' }).click()
  const graph = page.getByTestId('request-graph')
  await graph.locator('[data-path="tests[0]"]').click()
  const inspector = page.getByTestId('inspector')
  await expect(inspector).toHaveAttribute('data-node', 'tests[0]')
  const success = inspector.locator('[data-field="success"] input')
  await expect(success).toHaveValue('yes')
  await expect(page.getByTestId('dirty-state')).toHaveText('saved')
  await success.fill('no')
  await expect(page.getByTestId('dirty-state')).toContainText('unsaved')
  await expect(graph.locator('[data-path="tests[0]"]')).toContainText('no')
})

// Dragging stays unsaved here; workspace.spec.ts saves and reloads a layout.
test('dragging a node moves it and marks the layout dirty', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'req/04_metric_battery.json' }).click()
  const node = page.getByTestId('request-graph').locator('.react-flow__node').filter({ has: page.locator('[data-path="tests[0]"]') })
  await expect(page.getByTestId('dirty-state')).toHaveText('saved')
  const before = await node.boundingBox()
  await node.hover()
  await page.mouse.down()
  await page.mouse.move(before!.x + before!.width / 2 + 120, before!.y + before!.height / 2 + 80, { steps: 8 })
  await page.mouse.up()
  const after = await node.boundingBox()
  expect(after!.x).toBeGreaterThan(before!.x + 20)
  await expect(page.getByTestId('dirty-state')).toContainText('unsaved')
})

// Previews run against the showcase cohort (40,000 rows, under the
// default --auto-preview-rows, so nothing is deferred).
test('nodes show live previews and an edit re-runs only downstream ones', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'req/08_cuped_welch.json' }).click()
  const graph = page.getByTestId('request-graph')
  const preview = (id: string) => graph.locator(`[data-path="${id}"] [data-testid="preview"]`)
  await expect(preview('cohort')).toHaveAttribute('data-state', 'ok')
  await expect(preview('cohort')).toContainText('40,000 rows')
  await expect(preview('aggregations[0]')).toContainText('users 40,000')
  await expect(preview('attributes[0]')).toHaveAttribute('data-state', 'ok')
  await expect(preview('tests[1]')).toHaveAttribute('data-state', 'ok')
  await expect(preview('tests[1]')).toContainText('p')
  const requests: string[] = []
  page.on('request', (r) => {
    if (r.url().endsWith('/api/preview')) requests.push(String(r.postDataJSON()?.nodes))
  })
  await graph.locator('[data-path="attributes[0]"]').click()
  await page.getByTestId('inspector').locator('[data-field="expression"] textarea').fill('pages_viewed - 0.5 * (prior_sessions - 10)')
  await expect.poll(() => requests.length).toBeGreaterThan(0)
  await expect(preview('attributes[0]')).toHaveAttribute('data-state', 'ok')
  await expect(preview('tests[1]')).toHaveAttribute('data-state', 'ok')
  // The cohort is upstream of the edit: its preview is not re-run.
  expect(requests.join(';')).toContain('attributes[0]')
  expect(requests.join(';')).not.toContain('cohort')
  await expect(graph.locator('.react-flow__edge')).not.toHaveCount(0)
})

test('wiring a label into an input updates the param; bad types are refused', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'req/08_cuped_welch.json' }).click()
  const graph = page.getByTestId('request-graph')
  await expect(graph.locator('[data-path="cohort"]')).toContainText('categorical_u8')
  const fieldIn = graph.locator('[data-path="tests[0]"] [data-row="field"] .react-flow__handle')

  // A categorical cohort field into the Welch numeric field is refused.
  const armOut = graph.locator('[data-path="cohort"] .react-flow__handle[data-handleid="field:arm"]')
  const release = await drag(page, armOut, fieldIn)
  await expect(graph.getByTestId('wire-hint')).toContainText('numeric')
  await release()
  await expect(page.getByTestId('wire-refused')).toContainText('takes a numeric field, not categorical_u8')
  await expect(page.getByTestId('dirty-state')).toHaveText('saved')

  // The pages_cuped attribute label into tests[0].field rewrites it.
  const cupedOut = graph.locator('[data-path="attributes[0]"] .react-flow__handle[data-handleid="out"]')
  await (await drag(page, cupedOut, fieldIn))()
  await expect(graph.locator('[data-path="tests[0]"] [data-row="field"]')).toContainText('pages_cuped')
  await expect(page.getByTestId('dirty-state')).toContainText('unsaved')
  await graph.locator('[data-path="tests[0]"]').click()
  await expect(page.getByTestId('inspector').locator('[data-field="field"] input')).toHaveValue('pages_cuped')
})

test('deleting a node removes it and its wires; drags land where dropped', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'req/08_cuped_welch.json' }).click()
  const graph = page.getByTestId('request-graph')
  await expect(graph.locator('[data-path="cohort"]')).toContainText('categorical_u8')
  const edges = graph.locator(DATA_WIRES)
  await expect(edges).toHaveCount(6)

  // A test dragged left across earlier stages keeps the dropped x (no
  // clamp back into the Analysis stage; auto-pan may shift it a little).
  const node = graph.locator('.react-flow__node').filter({ has: page.locator('[data-path="tests[1]"]') })
  const before = (await node.boundingBox())!
  await node.hover()
  await page.mouse.down()
  await page.mouse.move(before.x + before.width / 2 - 2 * before.width, before.y + before.height / 2, { steps: 10 })
  await page.mouse.up()
  const after = (await node.boundingBox())!
  expect(before.x - after.x).toBeGreaterThan(1.5 * before.width)

  await graph.locator('[data-path="attributes[0]"]').click()
  await page.getByTestId('delete-node').click()
  await expect(graph.locator('[data-path="attributes[0]"]')).toHaveCount(0)
  // Its two wires (field in, pages_cuped out) are gone.
  await expect(edges).toHaveCount(4)
  await expect(graph.locator('[data-path="tests[1]"] [data-row="field"]')).toHaveClass(/unresolved/)
  await expect(page.getByTestId('dirty-state')).toContainText('unsaved')
})

test('the palette lists every manifest operator, searches, and places a node', async ({ page }) => {
  const catalog = (await (await page.request.get('/api/catalog')).json()) as { manifest: Record<string, unknown> }
  const m = catalog.manifest as { components: Record<string, unknown[]> } & Record<string, unknown[]>
  const total =
    ['features', 'filterers', 'attributes', 'groupers', 'aggregators', 'windows'].reduce((n, k) => n + (m.components[k]?.length ?? 0), 0) +
    ['tests', 'regressions', 'matrices', 'post_tests', 'overlays'].reduce((n, k) => n + (m[k]?.length ?? 0), 0)

  await page.goto('/')
  await page.getByRole('button', { name: 'req/08_cuped_welch.json' }).click()
  const graph = page.getByTestId('request-graph')
  await expect(graph.locator('[data-path="tests[1]"]')).toBeVisible()
  await page.getByTestId('palette-toggle').click()
  const palette = page.getByTestId('palette')
  // Plus the fixed join, vector and multiplicity blocks (no manifest operator list).
  await expect(palette.getByTestId('palette-item')).toHaveCount(total + 3)
  await expect(palette.locator('[data-op="JOIN"]')).toBeVisible()
  await expect(palette.locator('[data-op="MULTIPLICITY"]')).toBeVisible()
  await expect(palette.locator('[data-op="VECTOR"]')).toBeVisible()

  // By description words, then by name.
  await palette.getByTestId('palette-search').fill('two-sample alias')
  await expect(palette.locator('[data-op="TEST_WELCH"]')).toBeVisible()
  await palette.getByTestId('palette-search').fill('feat log')
  await expect(palette.locator('[data-op="FEAT_LOG"]')).toBeVisible()
  await expect(palette.locator('[data-op="TEST_WELCH"]')).toHaveCount(0)

  await palette.locator('[data-op="FEAT_LOG"]').click()
  await expect(graph.locator('[data-path="features[0]"]')).toContainText('FEAT_LOG')
  await expect(page.getByTestId('inspector')).toHaveAttribute('data-node', 'features[0]')
  await expect(page.getByTestId('dirty-state')).toContainText('unsaved')
})

test('dragging a field port to the canvas offers only compatible operators and wires the new node', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'req/08_cuped_welch.json' }).click()
  const graph = page.getByTestId('request-graph')
  await expect(graph.locator('[data-path="cohort"]')).toContainText('categorical_u8')
  const edges = graph.locator(DATA_WIRES)
  await expect(edges).toHaveCount(6)

  // Drop the categorical `arm` port on empty canvas (bottom-right corner).
  const armOut = graph.locator('[data-path="cohort"] .react-flow__handle[data-handleid="field:arm"]')
  const a = (await armOut.boundingBox())!
  const box = (await graph.locator('.react-flow').boundingBox())!
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width - 24, box.y + box.height - 24, { steps: 12 })
  await page.mouse.up()

  const picker = page.getByTestId('port-palette')
  await expect(picker).toContainText('arm (categorical_u8)')
  await expect(picker.locator('[data-op="FEAT_ONE_HOT"]')).toBeVisible()
  await expect(picker.locator('[data-op="FEAT_LOG"]')).toHaveCount(0)
  await expect(picker.locator('[data-section="overlays"]')).toHaveCount(0)
  // A cohort field can key a new join; a categorical one is no vector member.
  await expect(picker.locator('[data-op="JOIN"]')).toHaveCount(1)
  await expect(picker.locator('[data-op="VECTOR"]')).toHaveCount(0)
  await picker.getByTestId('palette-search').fill('TEST_WELCH')
  const welch = picker.locator('[data-op="TEST_WELCH"]')
  await expect(welch).toContainText('split_by')
  await welch.click()

  await expect(picker).toHaveCount(0)
  await expect(graph.locator('[data-path="tests[2]"] [data-row="split_by"]')).toContainText('arm')
  await expect(edges).toHaveCount(7)
  await expect(page.getByTestId('dirty-state')).toContainText('unsaved')
})

// Simulates an engine change: health reports a new digest and the catalog
// gains an operator; a focus poll reloads it into the open palette.
test('a changed feature_set_digest reloads the catalog and the palette', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'req/08_cuped_welch.json' }).click()
  await expect(page.getByTestId('request-graph').locator('[data-path="tests[1]"]')).toBeVisible()
  await page.getByTestId('palette-toggle').click()
  const palette = page.getByTestId('palette')
  await palette.getByTestId('palette-search').fill('simulated')
  await expect(palette.getByTestId('palette-item')).toHaveCount(0)

  await page.route('**/api/health', async (route) => {
    const body = (await (await route.fetch()).json()) as Record<string, unknown>
    await route.fulfill({ json: { ...body, feature_set_digest: 'simulated-digest' } })
  })
  await page.route('**/api/catalog', async (route) => {
    const body = (await (await route.fetch()).json()) as { manifest: { tests: unknown[] } } & Record<string, unknown>
    body.feature_set_digest = 'simulated-digest'
    body.manifest.tests.push({ name: 'TEST_SIMULATED', description: 'A simulated engine operator.', requires: ['Field'] })
    await route.fulfill({ json: body })
  })
  // The e2e project is Node-typed (no DOM lib): in the browser globalThis is
  // the window, so dispatch through it as a plain EventTarget.
  await page.evaluate(() => (globalThis as unknown as EventTarget).dispatchEvent(new Event('focus')))
  await expect(palette.locator('[data-op="TEST_SIMULATED"]')).toBeVisible()
})

test('palette items dropped on the canvas land where they are dropped', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'req/08_cuped_welch.json' }).click()
  const graph = page.getByTestId('request-graph')
  await expect(graph.locator('[data-path="tests[1]"]')).toBeVisible()
  await page.getByTestId('palette-toggle').click()
  const palette = page.getByTestId('palette')
  // The panel narrows the canvas: fit the graph back into view.
  await graph.locator('.react-flow__controls-fitview').click()
  await palette.getByTestId('palette-search').fill('TEST_WELCH')
  const welch = palette.locator('[data-op="TEST_WELCH"]')
  const cohort = graph.locator('[data-path="cohort"]')
  const at = (await cohort.boundingBox())!

  // Over the Cohort's stage: accepted, at the drop point.
  await welch.dragTo(cohort, { targetPosition: { x: 20, y: 10 } })
  await expect(graph.locator('[data-path="tests[2]"]')).toContainText('TEST_WELCH')
  await expect(page.getByTestId('place-refused')).toHaveCount(0)
  const placed = (await graph.locator('.react-flow__node[data-id="tests[2]"]').boundingBox())!
  expect(Math.abs(placed.x - (at.x + 20))).toBeLessThan(3)
  expect(Math.abs(placed.y - (at.y + 10))).toBeLessThan(3)
})

// Validation runs on the in-memory document (nothing is saved): a field
// typo is refused by predict on the node that references it, with the
// engine's suggestion; hovering a node shows its explain text.
test('validation badges show predict errors and suggestions; hover shows explain text', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'req/04_metric_battery.json' }).click()
  const graph = page.getByTestId('request-graph')
  const node = graph.locator('[data-path="aggregations[0]"]')
  await expect(node).toContainText('AGG_COUNT')
  await expect(graph.getByTestId('node-badge')).toHaveCount(0)
  // Explain text arrives for every slot; hover reveals it.
  await node.hover()
  await expect(node.getByTestId('node-tip')).toBeVisible()
  await expect(node.getByTestId('node-tip')).toContainText('AGG_COUNT')
  await node.click()
  await page.getByTestId('inspector').locator('[data-field="field"] input').fill('user_i')
  await expect(page.getByTestId('dirty-state')).toContainText('unsaved')
  const badge = node.getByTestId('node-badge')
  await expect(badge).toHaveAttribute('data-severity', 'error')
  await node.hover()
  await expect(node.getByTestId('node-tip')).toContainText('user_i')
  await expect(node.getByTestId('node-suggestion').first()).toContainText('user_id')
  // Fixing the field clears the badge.
  await page.getByTestId('inspector').locator('[data-field="field"] input').fill('user_id')
  await expect(badge).toHaveCount(0)
})

// A full run is read-only; workspace.spec.ts saves a run to out/ for real.
test('Run executes the edited compose and shows per-lane results and node headlines', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'req/11_readout.compose.json' }).click()
  const graph = page.getByTestId('request-graph')
  await expect(graph.getByTestId('lane-title')).toHaveCount(4)
  await page.getByTestId('run-button').click()
  const panel = page.getByTestId('results-panel')
  await expect(panel.getByTestId('run-status')).toHaveAttribute('data-phase', 'done', { timeout: 30_000 })
  await expect(panel.getByTestId('run-status')).toContainText('ok')
  await expect(panel.getByTestId('results-section')).toHaveText(['guardrails', 'scorecard', 'revenue_sensitivity', 'regression_adjustment'])
  await expect(panel.getByTestId('results-table-tests')).toContainText('srm_by_week')
  await panel.getByTestId('results-section').nth(3).click()
  await expect(panel.getByTestId('results-table-regressions')).toContainText('pages_adjusted')
  // Headlines reach terminal nodes by context.
  await expect(graph.locator('[data-path="requests[1].tests[0]"] [data-testid="node-run"]')).toContainText(/^padj /)
  await expect(graph.locator('[data-path="requests[3].regressions[1]"] [data-testid="node-run"]')).toContainText('R²')
  await panel.getByTestId('results-tab-raw').click()
  await expect(panel.getByTestId('results-raw')).toContainText('"format_version": "1.1"')
  await expect(panel.getByTestId('save-out-name')).toHaveValue('11_readout.json')

  // An edit marks the results as stale.
  await page.getByTestId('lane-add').click()
  await expect(panel.getByTestId('run-status')).toContainText('edited since this run')
})

test('Run of a plain request and a facet; an in-flight run cancels', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'req/04_metric_battery.json' }).click()
  const graph = page.getByTestId('request-graph')
  await page.getByTestId('run-button').click()
  const panel = page.getByTestId('results-panel')
  await expect(panel.getByTestId('run-status')).toHaveAttribute('data-phase', 'done', { timeout: 30_000 })
  await expect(panel.getByTestId('results-table-tests')).toContainText('trial_start')
  await expect(graph.locator('[data-path="aggregations[0]"] [data-testid="node-run"]')).toHaveText('40,000')

  await page.getByRole('button', { name: 'req/02_srm_gof.facet.json' }).click()
  await page.getByTestId('run-button').click()
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-phase', 'done', { timeout: 30_000 })
  await expect(page.getByTestId('results-table-fields')).toContainText('arm')
  await expect(graph.locator('[data-path="fields"] [data-testid="node-run"]')).toContainText('1 field')

  // Hold the next run so Cancel has something to abort.
  let release: () => void = () => {}
  const held = new Promise<void>((r) => (release = r))
  await page.route('**/api/run', async (route) => {
    await held
    await route.continue().catch(() => {})
  })
  await page.getByTestId('run-button').click()
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-phase', 'running')
  await page.getByTestId('run-cancel').click()
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-phase', 'cancelled')
  await expect(page.getByTestId('run-button')).toBeVisible()
  release()
})

test('the results panel resizes by drag and keyboard, maximises, restores, and remembers its height', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.removeItem('studio.resultsHeight'))
  const openAndRun = async () => {
    await page.getByRole('button', { name: 'req/11_readout.compose.json' }).click()
    await expect(page.getByTestId('request-graph').getByTestId('lane-title')).toHaveCount(4)
    await page.getByTestId('run-button').click()
    await expect(page.getByTestId('run-status')).toHaveAttribute('data-phase', 'done', { timeout: 30_000 })
  }
  await openAndRun()
  const panel = page.getByTestId('results-panel')
  const grip = panel.getByTestId('results-resize')
  const body = page.locator('.graph-body')
  const height = async () => Math.round((await panel.boundingBox())!.height)
  const now = async () => Number(await grip.getAttribute('aria-valuenow'))
  await expect(grip).toHaveAttribute('aria-valuenow', '260')
  await expect(grip).toHaveAttribute('aria-valuemin', '120')
  const max = Number(await grip.getAttribute('aria-valuemax'))
  expect(max).toBeGreaterThan(300)

  // Dragging the top edge up makes the panel taller (and the graph shorter).
  const graphBefore = (await body.boundingBox())!.height
  const g = (await grip.boundingBox())!
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
  await page.mouse.down()
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2 - 100, { steps: 8 })
  await page.mouse.up()
  await expect(grip).toHaveAttribute('aria-valuenow', '360')
  expect(Math.abs((await height()) - 360)).toBeLessThanOrEqual(1)
  expect((await body.boundingBox())!.height).toBeLessThan(graphBefore - 90)

  // Keyboard: arrows step 24px, Shift 120px, Home/End jump to the bounds.
  await grip.focus()
  await page.keyboard.press('ArrowUp')
  await expect(grip).toHaveAttribute('aria-valuenow', '384')
  await page.keyboard.press('Shift+ArrowDown')
  await expect(grip).toHaveAttribute('aria-valuenow', '264')
  await page.keyboard.press('End')
  await expect(grip).toHaveAttribute('aria-valuenow', String(max))
  await page.keyboard.press('Home')
  await expect(grip).toHaveAttribute('aria-valuenow', '120')
  await page.keyboard.press('Shift+ArrowUp')
  await page.keyboard.press('Shift+ArrowUp')
  await expect(grip).toHaveAttribute('aria-valuenow', '360')
  expect(await now()).toBe(360)

  // Maximise fills the graph area under the bar; Esc and Restore bring it back.
  const maxBtn = panel.getByTestId('results-maximise')
  await expect(maxBtn).toHaveAttribute('aria-label', 'Maximise results')
  await maxBtn.click()
  await expect(panel).toHaveAttribute('data-maximised', 'true')
  await expect(maxBtn).toHaveAttribute('aria-label', 'Restore')
  await expect(body).toBeHidden()
  await expect(page.getByTestId('run-button')).toBeVisible()
  expect(await height()).toBeGreaterThan(max)
  await page.keyboard.press('Escape')
  await expect(panel).not.toHaveAttribute('data-maximised', 'true')
  await expect(body).toBeVisible()
  expect(Math.abs((await height()) - 360)).toBeLessThanOrEqual(1)
  await maxBtn.click()
  await expect(panel).toHaveAttribute('data-maximised', 'true')
  // Esc typed in a field does not restore.
  await panel.getByTestId('save-out-name').press('Escape')
  await expect(panel).toHaveAttribute('data-maximised', 'true')
  await panel.getByRole('button', { name: 'Restore' }).click()
  await expect(panel).not.toHaveAttribute('data-maximised', 'true')
  expect(Math.abs((await height()) - 360)).toBeLessThanOrEqual(1)

  // The height survives a reload; maximised does not.
  await page.reload()
  await openAndRun()
  await expect(grip).toHaveAttribute('aria-valuenow', '360')
  await expect(panel).not.toHaveAttribute('data-maximised', 'true')
  // Double-click resets to the default.
  await grip.dblclick()
  await expect(grip).toHaveAttribute('aria-valuenow', '260')
  await page.evaluate(() => localStorage.removeItem('studio.resultsHeight'))
})
