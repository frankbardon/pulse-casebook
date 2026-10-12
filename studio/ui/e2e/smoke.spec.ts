import { expect, test } from '@playwright/test'

// Placeholder smoke test: the embedded shell loads and reaches the API.
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
  await expect(graph.locator('.react-flow__edge')).toHaveCount(13)
})

test('compose files open to a not-yet-supported view', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'req/11_readout.compose.json' }).click()
  await expect(page.getByTestId('unsupported')).toContainText('not yet supported')
})

// Edits stay unsaved here: the smoke server serves the real showcase dir.
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

// Dragging stays unsaved here too; the save/reload round trip of the
// sidecar is covered against a temp dir by the Go and unit tests.
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

// Wiring stays unsaved too. Drags run handle to handle with the mouse.
async function drag(page: import('@playwright/test').Page, from: import('@playwright/test').Locator, to: import('@playwright/test').Locator) {
  const a = (await from.boundingBox())!
  const b = (await to.boundingBox())!
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 })
  return async () => page.mouse.up()
}

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

test('deleting a node removes it and its wires; drags stay in the stage column', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'req/08_cuped_welch.json' }).click()
  const graph = page.getByTestId('request-graph')
  await expect(graph.locator('[data-path="cohort"]')).toContainText('categorical_u8')
  const edges = graph.locator('.react-flow__edge')
  await expect(edges).toHaveCount(6)

  // A test dragged far right stays in the Analysis column.
  const node = graph.locator('.react-flow__node').filter({ has: page.locator('[data-path="tests[1]"]') })
  const before = (await node.boundingBox())!
  await node.hover()
  await page.mouse.down()
  await page.mouse.move(before.x + before.width / 2 + 2000, before.y + before.height / 2, { steps: 10 })
  await page.mouse.up()
  const after = (await node.boundingBox())!
  expect(after.x - before.x).toBeLessThan(before.width)

  await graph.locator('[data-path="attributes[0]"]').click()
  await page.getByTestId('delete-node').click()
  await expect(graph.locator('[data-path="attributes[0]"]')).toHaveCount(0)
  // Its two wires (field in, pages_cuped out) are gone.
  await expect(edges).toHaveCount(4)
  await expect(graph.locator('[data-path="tests[1]"] [data-row="field"]')).toHaveClass(/unresolved/)
  await expect(page.getByTestId('dirty-state')).toContainText('unsaved')
})

// Palette placements stay unsaved too.
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
  await expect(palette.getByTestId('palette-item')).toHaveCount(total)

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
  const edges = graph.locator('.react-flow__edge')
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
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(palette.locator('[data-op="TEST_SIMULATED"]')).toBeVisible()
})

test('palette items dropped on the canvas land only in their own stage column', async ({ page }) => {
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
  const analysis = graph.locator('[data-path="tests[1]"]')

  // Over the Cohort column: refused.
  await welch.dragTo(cohort, { targetPosition: { x: 20, y: 10 } })
  await expect(page.getByTestId('place-refused')).toContainText('Analysis column')
  await expect(graph.locator('[data-path="tests[2]"]')).toHaveCount(0)

  // Over the Analysis column: placed there.
  await welch.dragTo(analysis, { targetPosition: { x: 20, y: 10 } })
  await expect(graph.locator('[data-path="tests[2]"]')).toContainText('TEST_WELCH')
  const placed = (await graph.locator('.react-flow__node[data-id="tests[2]"]').boundingBox())!
  const column = (await graph.locator('.react-flow__node[data-id="tests[1]"]').boundingBox())!
  expect(Math.abs(placed.x - column.x)).toBeLessThan(2)
})
