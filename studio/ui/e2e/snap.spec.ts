// Snap to grid: a dragged node lands on whole or half grid units (one
// unit is the background dot gap), and the choice is remembered.
import { analysisRow, expect, test } from './harness.ts'

test.use({ workspace: 'ab-test-readout' })

const UNIT = 20

async function dragAndSave(page: import('@playwright/test').Page, studio: { read(p: string): string }, dx: number, dy: number) {
  const node = page.getByTestId('request-graph').locator('.react-flow__node[data-id="tests[0]"]')
  const box = (await node.boundingBox())!
  // Grab the header: after the first drag another node may overlap the body.
  await page.mouse.move(box.x + 12, box.y + 8)
  await page.mouse.down()
  await page.mouse.move(box.x + 12 + dx, box.y + 8 + dy, { steps: 8 })
  await page.mouse.up()
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByTestId('dirty-state')).toHaveText('saved')
  const sidecar = JSON.parse(studio.read('analyses/04_metric_battery.layout.json')) as { nodes: Record<string, { x: number; y: number }> }
  return sidecar.nodes['tests[0]']
}

test('dragged nodes snap to whole units, then half units, and the mode is remembered', async ({ page, studio }) => {
  await page.goto('/')
  await analysisRow(page, '04_metric_battery.json').click()
  await expect(page.getByTestId('dirty-state')).toHaveText('saved')
  const snap = page.getByTestId('snap-mode')
  await expect(snap).toHaveAttribute('data-mode', 'off')

  await snap.getByTestId('snap-whole').click()
  const whole = await dragAndSave(page, studio, 67, -133)
  expect(Math.abs(whole.x % UNIT)).toBe(0)
  expect(Math.abs(whole.y % UNIT)).toBe(0)

  await snap.getByTestId('snap-half').click()
  await expect(snap.getByTestId('snap-half')).toHaveAttribute('aria-pressed', 'true')
  const half = await dragAndSave(page, studio, 33, 47)
  expect(Math.abs(half.x % (UNIT / 2))).toBe(0)
  expect(Math.abs(half.y % (UNIT / 2))).toBe(0)

  await page.reload()
  await analysisRow(page, '04_metric_battery.json').click()
  await expect(page.getByTestId('snap-mode')).toHaveAttribute('data-mode', 'half')
})
