// route.worker routes wires off the main thread so dragging and typing
// stay smooth. libavoid (WASM) is loaded on the first request; the .wasm
// is a bundled asset next to this worker (embedded with the UI), never a
// CDN fetch.
import { AvoidLib } from 'libavoid-js'
import wasmUrl from '../../node_modules/libavoid-js/dist/libavoid.wasm?url'
import { routeScene } from './avoidRoute.ts'
import type { Route, Scene } from './routing.ts'

export type RouteJob = { seq: number; scene: Scene }
export type RouteReply = { seq: number; routes: [string, Route][]; ms: number } | { seq: number; error: string }

let ready: Promise<unknown> | null = null

self.onmessage = async (ev: MessageEvent<RouteJob>) => {
  const { seq, scene } = ev.data
  try {
    ready ??= AvoidLib.load(wasmUrl)
    await ready
    const t0 = performance.now()
    const routes = routeScene(AvoidLib.getInstance(), scene)
    const reply: RouteReply = { seq, routes: [...routes], ms: performance.now() - t0 }
    self.postMessage(reply)
  } catch (e) {
    ready = null
    const reply: RouteReply = { seq, error: e instanceof Error ? e.message : String(e) }
    self.postMessage(reply)
  }
}
