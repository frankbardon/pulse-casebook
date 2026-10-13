# Third-party notices

Pulse Studio ships the following third-party component under a licence that asks for notice. Other
UI dependencies are listed with their versions in `ui/package-lock.json`.

## libavoid-js 0.5.0-beta.5

- **What it is:** a WebAssembly build of libavoid, the object-avoiding connector router from the
  Adaptagrams project, with a JavaScript wrapper. Studio uses it to route wires around nodes
  (the "Routed" wire mode; see `ui/src/graph/route.worker.ts` and `ui/src/graph/avoidRoute.ts`).
- **Author:** Vladyslav Hnatiuk and contributors.
- **Licence:** GNU Lesser General Public License, version 2.1 or (at your option) any later version
  (`LGPL-2.1-or-later`). The full text of version 2.1 is in [licenses/LGPL-2.1.txt](licenses/LGPL-2.1.txt),
  copied from the package.
- **Source:** <https://github.com/Aksem/libavoid-js> (the npm package `libavoid-js`, pinned to
  exactly `0.5.0-beta.5` in `ui/package.json`). The libavoid C++ sources it is built from are part
  of Adaptagrams: <https://github.com/mjwybrow/adaptagrams>.
- **Unmodified:** Studio uses the package as published. It does not patch it.

### How it is loaded, and how to replace it

libavoid-js is a separate module. Studio does not link it into its own code:

- The compiled library is a separate WebAssembly file. `make studio` emits it as its own asset,
  `web/dist/assets/libavoid-<hash>.wasm`, and the router fetches it by URL at runtime. Nothing else
  is compiled into it.
- The package's small JavaScript loader is bundled by Vite into the route worker chunk,
  `web/dist/assets/route.worker-<hash>.js`, alongside Studio's own routing code. It runs only in
  that web worker, which fetches the WebAssembly file on its first routing request. It is not part
  of the main application bundle.
- Studio talks to the library only through its public API (`AvoidLib.load` and the router
  classes). Any build of libavoid-js that offers the same API can take its place.

To use a modified or different libavoid-js, point the `libavoid-js` dependency in
`ui/package.json` at your build (a version, a git URL or a local path), run `npm install` in `ui/`,
and rebuild with `make studio`. All of Studio's source is in this repository, so you can always
rebuild the binary with the replacement embedded.
