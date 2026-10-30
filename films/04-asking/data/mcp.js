// Drives `pulse mcp` over stdio under the feature profile in profile.json, and
// records what an agent sees: the tools the profile offers (mcp.tools.json) and
// pulse_predict's answer to par.json, which declares Request.Params while the
// profile does not list capability:params (mcp.par.json).
// Usage: node mcp.js /path/to/pulse   (run from this folder; PULSE_DATA_DIR is this folder)
const fs = require('fs');
const { spawn } = require('child_process');
const pulse = process.argv[2];
const child = spawn(pulse, ['mcp', '--data-dir', '.', '--no-cohort-scan', '--feature-profile', 'profile.json'], { stdio: ['pipe', 'pipe', 'inherit'] });
let buf = '', id = 0;
const waiting = new Map();
child.stdout.on('data', d => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id != null && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
  }
});
const call = (method, params) => new Promise(res => { const n = ++id; waiting.set(n, res); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: n, method, params }) + '\n'); });
const note = (method, params) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
(async () => {
  await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'pulse-anatomy-film-4', version: '1' } });
  note('notifications/initialized', {});
  const tools = await call('tools/list', {});
  fs.writeFileSync('mcp.tools.json', JSON.stringify({ tools: tools.result.tools.map(t => t.name).sort() }, null, 2) + '\n');
  const req = JSON.parse(fs.readFileSync('par.json', 'utf8'));
  const res = await call('tools/call', { name: 'pulse_predict', arguments: req });
  const out = res.result || res.error;
  if (out && out.content) for (const c of out.content) if (c.type === 'text') { try { c.text = JSON.parse(c.text); } catch (e) { /* keep text */ } }
  fs.writeFileSync('mcp.par.json', JSON.stringify(out, null, 2) + '\n');
  child.stdin.end(); child.kill();
})();
