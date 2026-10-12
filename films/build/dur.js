// Prints the film's total duration (seconds) for the page given as argv[2].
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const p = await b.newPage(); await p.goto('file://' + require('path').resolve(process.argv[2])); await p.waitForTimeout(500);
  require('fs').writeFileSync('dur.txt', String(await p.evaluate(() => window.__film.DUR))); await b.close();
})();
