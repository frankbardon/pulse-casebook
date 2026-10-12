const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
  const p = await b.newPage(); const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.goto('file://'+require('path').resolve(process.argv[2])); await p.waitForTimeout(800);
  const cues = await p.evaluate(()=>window.__film.cues());
  require('fs').writeFileSync(process.argv[3], JSON.stringify(cues, null, 1));
  console.log(cues.length, 'cues', 'errors:', errs); await b.close();
})();
