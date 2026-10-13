// Git-backed workspace (H1/H2), against a fresh temp copy of
// ab-test-readout kept in git by the studio (harness.ts isolates git from
// the developer's config): a save auto-commits, the History panel lists
// the file's commits and diffs one against the file on disk, and Restore
// writes it back as a new commit that the canvas reloads.
import { expect, test } from './harness.ts'

test.describe('with git', () => {
  test.use({ workspace: 'ab-test-readout' })

  test('save auto-commits; history diffs and restores', async ({ page, studio }) => {
    const file = 'req/04_metric_battery.json'
    const before = studio.read(file)
    // The studio initialized the copy and snapshotted its JSON files.
    expect(studio.git('log', '--format=%s|%an')).toBe('studio: initial snapshot|Pulse Studio')
    expect(studio.git('ls-files', '*.pulse')).toBe('')

    await page.goto('/')
    await expect(page.getByTestId('history-banner')).toHaveCount(0)
    await page.getByRole('button', { name: file }).click()
    const graph = page.getByTestId('request-graph')
    await graph.locator('[data-path="tests[0]"]').click()
    await page.getByTestId('inspector').locator('[data-field="success"] input').fill('no')
    await page.keyboard.press('ControlOrMeta+s')
    await expect(page.getByTestId('dirty-state')).toHaveText('saved')
    expect(studio.git('log', '-1', '--format=%s|%an', '--name-only')).toBe(`studio: save ${file}|Pulse Studio\n\n${file}`)
    const edited = studio.read(file)
    expect(edited).toContain('"success": "no"')

    // History lists the save and the snapshot, newest first.
    await page.getByTestId('history-toggle').click()
    const items = page.getByTestId('history-panel').getByTestId('history-item')
    await expect(items).toHaveCount(2)
    await expect(items.nth(0)).toContainText(`studio: save ${file}`)
    await expect(items.nth(1)).toContainText('studio: initial snapshot')

    // The snapshot's diff against the file on disk: what Restore changes.
    await items.nth(1).click()
    const diff = page.getByTestId('history-diff')
    await expect(diff.locator('[data-op="-"]')).toHaveCount(1)
    await expect(diff.locator('[data-op="-"]')).toContainText('"success": "no"')
    await expect(diff.locator('[data-op="+"]')).toContainText('"success": "yes"')
    await expect(page.getByTestId('history-stats')).toHaveText('+1 −1')

    await page.getByTestId('history-restore').click()
    // Restored on disk byte for byte, committed, and listed.
    await expect(items).toHaveCount(3)
    await expect(items.nth(0)).toContainText(`studio: restore ${file} to `)
    expect(studio.read(file)).toBe(before)
    expect(studio.git('log', '-1', '--format=%s', '--name-only')).toMatch(new RegExp(`^studio: restore ${file.replace('.', '\\.')} to [0-9a-f]{7}\\n\\n${file.replace('.', '\\.')}$`))
    await expect(page.getByTestId('history-same')).toBeVisible()

    // The canvas reloaded the restored content: not dirty, old value back.
    await expect(page.getByTestId('dirty-state')).toHaveText('saved')
    await graph.locator('[data-path="tests[0]"]').click()
    await expect(page.getByTestId('inspector').locator('[data-field="success"] input')).toHaveValue('yes')

    // The edited version is one click away again.
    await items.nth(1).click()
    await expect(diff.locator('[data-op="+"]')).toContainText('"success": "no"')
  })
})

test.describe('with --no-git', () => {
  test.use({ workspace: 'ab-test-readout', git: false })

  test('runs without history and says so', async ({ page, studio }) => {
    await page.goto('/')
    await expect(page.getByTestId('history-banner')).toContainText('--no-git')
    await page.getByRole('button', { name: 'req/04_metric_battery.json' }).click()
    await expect(page.getByTestId('request-graph')).toBeVisible()
    await expect(page.getByTestId('history-toggle')).toHaveCount(0)
    expect(studio.exists('.git')).toBe(false)
  })
})
