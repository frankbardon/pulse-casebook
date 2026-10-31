// @ts-check
import fs from 'node:fs';
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Written by scripts/sync.mjs (runs before dev and build).
const nav = JSON.parse(fs.readFileSync(new URL('./src/generated/sidebar.json', import.meta.url), 'utf8'));
// Old film folders → their renumbered folders (films/slugs.json). Film pages live at
// /films/<topic>/ and never moved; a film's own page and files moved from
// /films/<old folder>/ to /films/<new folder>/. Each old folder page redirects here;
// scripts/sync.mjs also writes public/_redirects for the files inside it.
const { folders } = JSON.parse(fs.readFileSync(new URL('../films/slugs.json', import.meta.url), 'utf8'));
const redirects = Object.fromEntries(Object.entries(folders).filter(([from, to]) => from !== to)
	.map(([from, to]) => [`/films/${from}`, `/films/${to}/`]));

export default defineConfig({
	redirects,
	integrations: [
		starlight({
			title: 'Pulse Casebook',
			description: 'Learn Pulse through narrated films and worked case studies.',
			// The Pulse ring, vendored (c2pa metadata stripped). The home hero's live mark
			// is the vendored embed in public/brand/ (pulse-mark.js + pinned three 0.184.0).
			logo: { src: './src/assets/pulse-ring.svg', alt: 'Pulse' },
			// Favicons are a simplified ring (light SVG + PNG rasters); the header logo stays the full ring.
			head: [
				{ tag: 'link', attrs: { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' } },
				{ tag: 'link', attrs: { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' } },
				{ tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' } },
			],
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
