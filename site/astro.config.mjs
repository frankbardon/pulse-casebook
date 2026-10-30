// @ts-check
import fs from 'node:fs';
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Written by scripts/sync.mjs (runs before dev and build).
const nav = JSON.parse(fs.readFileSync(new URL('./src/generated/sidebar.json', import.meta.url), 'utf8'));

export default defineConfig({
	integrations: [
		starlight({
			title: 'Pulse Casebook',
			description: 'Learn Pulse through narrated films and worked case studies.',
			// The Pulse ring, vendored (c2pa metadata stripped). The home hero's live mark
			// is the vendored embed in public/brand/ (pulse-mark.js + pinned three 0.184.0).
			logo: { src: './src/assets/pulse-ring.svg', alt: 'Pulse' },
			social: [{ icon: 'github', label: 'Pulse on GitHub', href: 'https://github.com/frankbardon/pulse' }],
			sidebar: [
				{ label: 'Start here', items: [{ slug: 'paths/analyst' }, { slug: 'paths/developer' }, { slug: 'paths/running-examples' }] },
				{ label: 'Films', items: nav.films },
				{ label: 'Case studies', items: nav.cases },
				{ label: 'Topics', collapsed: true, items: nav.topics },
				{ label: 'Reference', items: [{ slug: 'reference/plates' }, { slug: 'reference/film-data' }, { label: 'Pulse documentation ↗', link: 'https://github.com/frankbardon/pulse/tree/main/docs' }] },
			],
		}),
	],
});
