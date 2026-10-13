import { describe, expect, it } from 'vitest'
import { stringValue } from './jsonTree.ts'
import { emitModelText, parseModel } from './model.ts'
import { addLane, removable, removeLane, renameLane, renameLaneIds } from './lanes.ts'
import fitsCompose from './testdata/fits.compose.json?raw'
import readout from '../../../../showcase/ab-test-readout/req/11_readout.compose.json?raw'

describe('compose lane edits', () => {
  it('adds a slot reading the last slot cohort', () => {
    const r = addLane(parseModel(readout))
    expect(r.id).toBe('requests[4]')
    const doc = JSON.parse(emitModelText(r.model))
    expect(doc.requests).toHaveLength(5)
    expect(doc.requests[4]).toEqual({ label: 'request_5', cohort: { filename: 'ab_test.pulse', data_dir: '.' } })
    expect(r.model.nodes.get('requests[4].cohort')?.kind).toBe('cohort')
    // The other slots are untouched, byte for byte.
    expect(emitModelText(r.model).startsWith(emitModelText(parseModel(readout)).slice(0, -2))).toBe(true)
  })

  it('removes a slot and renames the later ones', () => {
    const m = parseModel(readout)
    const r = removeLane(m, 'requests[1]')
    const doc = JSON.parse(emitModelText(r.model))
    expect(doc.requests.map((q: { label: string }) => q.label)).toEqual(['guardrails', 'revenue_sensitivity', 'regression_adjustment'])
    expect(r.renames.get('requests[2].tests[0]')).toBe('requests[1].tests[0]')
    expect(r.renames.get('requests[3]')).toBe('requests[2]')
    expect(r.renames.has('requests[0].tests[0]')).toBe(false)
    expect(renameLaneIds(['requests[3]', 'requests[1]', 'requests[0]'], 'requests[1]', r.renames)).toEqual(['requests[2]', 'requests[0]'])
  })

  it('never removes the last slot; fits always go', () => {
    let m = parseModel(fitsCompose)
    expect(removable(m, 'requests[0]')).toBe(true)
    m = removeLane(m, 'requests[0]').model
    expect(removable(m, 'requests[0]')).toBe(false)
    expect(() => removeLane(m, 'requests[0]')).toThrow()
    const noFits = removeLane(m, 'fits[0]').model
    expect(JSON.parse(emitModelText(noFits)).fits).toBeUndefined()
  })

  it('renames a slot label, and removes it when cleared', () => {
    const m = renameLane(parseModel(readout), 'requests[2]', 'mwu')
    expect(stringValue(m.nodes.get('requests[2].label')!.value)).toBe('mwu')
    const cleared = JSON.parse(emitModelText(renameLane(m, 'requests[2]', '')))
    expect('label' in cleared.requests[2]).toBe(false)
  })

  it('renames a fit and the bindings that name it', () => {
    const m = renameLane(parseModel(fitsCompose), 'fits[0]', 'pv')
    const doc = JSON.parse(emitModelText(m))
    expect(doc.fits[0].name).toBe('pv')
    expect(doc.requests[0].attributes[0].params.fit).toBe('pv')
    expect(() => renameLane(m, 'fits[0]', '')).toThrow()
  })
})
