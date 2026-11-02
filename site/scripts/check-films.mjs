// Plays every film inline on its docs page, in light and dark, against a running preview.
// Needs Range support for narration, so `astro preview`, not a plain static server.
//   BASE=http://localhost:4321 NODE_PATH=../films/build/node_modules node scripts/check-films.mjs
// Playwright lives in films/build/node_modules; CHROMIUM=<path> uses a system browser instead.
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = (process.env.BASE || 'http://localhost:4321').replace(/\/$/, '');
const films = new URL('../../films/', import.meta.url);
// Topic = folder name after NN-; the docs page is /films/<topic>/.
const topics = fs.readdirSync(films).filter(d => /^\d\d-/.test(d)).sort().map(d => d.slice(3));
const secs = s => s.split(':').reduce((m, x) => m * 60 + Number(x), 0);

const browser = await chromium.launch({
	executablePath: process.env.CHROMIUM || undefined,
	args: ['--autoplay-policy=no-user-gesture-required'],
});
const failures = [];
for (const theme of ['light', 'dark']) {
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	await ctx.addInitScript(t => localStorage.setItem('starlight-theme', t), theme);
	for (const topic of topics) {
		const page = await ctx.newPage();
		const errs = [];
		page.on('pageerror', e => errs.push('pageerror: ' + e.message));
		page.on('console', m => m.type() === 'error' && errs.push('console: ' + m.text()));
		// Chrome aborts media fetches as it switches to range requests or the page closes; not a failure.
		page.on('requestfailed', r => r.resourceType() === 'media' && r.failure()?.errorText === 'net::ERR_ABORTED'
			|| errs.push('requestfailed: ' + r.url() + ' ' + r.failure()?.errorText));
		page.on('response', r => r.status() >= 400 && errs.push(`HTTP ${r.status()}: ${r.url()}`));
		const fail = msg => errs.push(msg);
		try {
			await page.goto(`${BASE}/films/${topic}/`, { waitUntil: 'load' });
			if ((await page.getAttribute('html', 'data-theme')) !== theme) fail('theme not applied');
			if (!(await page.$('[data-pulse-film]'))) fail('no [data-pulse-film]');
			if (await page.$('iframe')) fail('iframe present');
			await page.waitForFunction(() => window.__film, null, { timeout: 10000 });
			const time = () => page.textContent('[data-pulse-film] .time').then(t => secs(t.split('/')[0].trim()));
			await page.click('[data-pulse-film] .play');
			await page.waitForTimeout(2200);
			if ((await time()) < 1) fail('play did not advance the time');
			// The canvas must have drawn something other than a flat fill.
			const drawn = await page.$eval('[data-pulse-film] canvas', c => {
				const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
				const seen = new Set(); for (let i = 0; i < d.length; i += 4 * 997) seen.add(d[i] << 16 | d[i + 1] << 8 | d[i + 2]);
				return seen.size;
			});
			if (drawn < 4) fail('canvas looks blank');
			const chaps = await page.$$('[data-pulse-film] .chap');
			if (chaps.length < 2) fail('no chapters');
			else {
				const last = chaps[chaps.length - 1];
				const start = secs((await last.textContent()).match(/(\d+:\d\d)/)[1]);
				await last.click();
				await page.waitForTimeout(300);
				const t = await time();
				if (t < start || t > start + 3) fail(`chapter jump to ${start}s landed at ${t}s`);
				if ((await last.getAttribute('aria-current')) !== 'true') fail('chapter not marked current');
			}
		} catch (e) { fail('exception: ' + e.message.split('\n')[0]); }
		console.log(`${errs.length ? 'FAIL' : 'ok  '} ${theme.padEnd(5)} ${topic}${errs.length ? '\n    ' + errs.join('\n    ') : ''}`);
		if (errs.length) failures.push(`${theme} ${topic}`);
		await page.close();
	}
	await ctx.close();
}
await browser.close();
console.log(`\n${topics.length * 2 - failures.length}/${topics.length * 2} passed`);
process.exit(failures.length ? 1 : 0);
