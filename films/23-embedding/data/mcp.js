// Drives `pulse mcp` with its two observability exports switched on, and records what a host
// receives: the OTLP/HTTP posts (to a stand-in collector this script runs on a loopback port)
// and a Prometheus scrape of --metrics-addr, after one pulse_process tool call (hash_a.json).
// Usage: node mcp.js /path/to/pulse   (run from this folder; the data dir is this folder)
// Writes mcp_observe.out.json. Ports are picked at run time, so they are written as PORT.
const fs = require('fs'), http = require('http');
const { spawn } = require('child_process');
const pulse = process.argv[2];
const posts = [];
const collector = http.createServer((req, res) => {
  const parts = [];
  req.on('data', d => parts.push(d));
  req.on('end', () => {
    const body = Buffer.concat(parts), s = body.toString('latin1');
    const has = ['pulse.process', 'pulse.request_hash', 'pulse.rows_scanned', 'pulse_operations_total', 'pulse_rows_scanned_total', 'service.name']
      .filter(k => s.includes(k));
    posts.push({ path: req.url, content_type: req.headers['content-type'], contains: has });
    res.writeHead(200, { 'content-type': 'application/x-protobuf' }); res.end();
  });
});
collector.listen(0, '127.0.0.1', () => {
  const port = collector.address().port;
  const env = { ...process.env, OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${port}` };
  delete env.OTEL_SERVICE_NAME; delete env.OTEL_RESOURCE_ATTRIBUTES;
  const child = spawn(pulse, ['mcp', '--data-dir', '.', '--no-cohort-scan', '--metrics-addr', '127.0.0.1:0'], { stdio: ['pipe', 'pipe', 'pipe'], env });
  let buf = '', err = '', id = 0;
  const waiting = new Map();
  child.stderr.on('data', d => { err += d; });
  child.stdout.on('data', d => {
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.id != null && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
    }
  });
  const call = (method, params) => new Promise(res => { const n = ++id; waiting.set(n, res); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: n, method, params }) + '\n'); });
  const note = (method, params) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  const get = url => new Promise((res, rej) => http.get(url, r => { let s = ''; r.on('data', d => s += d); r.on('end', () => res(s)); }).on('error', rej));
  (async () => {
    await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'pulse-anatomy-film-23', version: '1' } });
    note('notifications/initialized', {});
    const req = JSON.parse(fs.readFileSync('hash_a.json', 'utf8'));
    const res = await call('tools/call', { name: 'pulse_process', arguments: req });
    let data = null;
    for (const c of (res.result && res.result.content) || []) if (c.type === 'text') { try { data = JSON.parse(c.text); } catch (e) { /* keep */ } }
    const m = err.match(/metrics[^\n]*?(127\.0\.0\.1:\d+)/);
    let scrape = [];
    if (m) {
      const text = await get(`http://${m[1]}/metrics`);
      // Keep the pulse_ series that are not timings; a timing's value changes every run.
      scrape = text.split('\n').filter(l => /^pulse_/.test(l) && !/_seconds/.test(l));
    }
    child.stdin.end();
    child.on('exit', code => {
      setTimeout(() => {
        const notice = err.split('\n').filter(l => /^pulse mcp/.test(l)).map(l => l.replace(/127\.0\.0\.1:\d+/g, '127.0.0.1:PORT'));
        const seen = {};
        for (const p of posts) { const k = p.path; seen[k] = seen[k] || { path: p.path, content_type: p.content_type, posts: 0, contains: [] }; seen[k].posts++; for (const c of p.contains) if (!seen[k].contains.includes(c)) seen[k].contains.push(c); }
        const out = { env: { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:PORT' }, args: ['mcp', '--data-dir', '.', '--no-cohort-scan', '--metrics-addr', '127.0.0.1:0'],
          startup_notice: notice, tool_call: { name: 'pulse_process', rows: data && data.data ? data.data.length : null, data: data && data.data },
          metrics_scrape: scrape, otlp_received: Object.values(seen).sort((a, b) => a.path < b.path ? -1 : 1).map(x => ({ ...x, posts: undefined })), exit_code: code };
        fs.writeFileSync('mcp_observe.out.json', JSON.stringify(out, null, 2) + '\n');
        collector.close();
      }, 300);
    });
  })();
});
