// Build the site's generated content from the repo's sources of truth:
//   films/      → src/content/docs/films/*.mdx, public/films/
//   showcase/   → src/content/docs/case-studies/**, public/showcase/
//   both        → src/content/docs/topics/*.md (operators used, cross-linked)
// Everything written here is gitignored; edit films/ and showcase/, not the output.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(SITE, '..');
const FILMS = path.join(ROOT, 'films');
const SHOWCASE = path.join(ROOT, 'showcase');
const DOCS = path.join(SITE, 'src/content/docs');
const PUBLIC = path.join(SITE, 'public');
const GENERATED = path.join(SITE, 'src/generated');

// Operator-name prefix → topic. A film covers the topic in depth where one exists.
const TOPICS = [
  { prefix: 'FEAT', slug: 'features', title: 'Features', film: '03-features' },
  { prefix: 'FILTER', slug: 'filters', title: 'Filters', film: '04-filters' },
  { prefix: 'ATTR', slug: 'attributes', title: 'Attributes', film: '05-attributes' },
  { prefix: 'GROUP', slug: 'groups', title: 'Groups', film: '02-concepts' },
  { prefix: 'AGG', slug: 'aggregators', title: 'Aggregators', film: '06-aggregators' },
  { prefix: 'WIN', slug: 'windows', title: 'Windows', film: '07-windows' },
  { prefix: 'TEST', slug: 'tests', title: 'Tests', film: '08-tests' },
  { prefix: 'REG', slug: 'regression', title: 'Regression', film: '08-tests' },
  { prefix: 'MAT', slug: 'matrices', title: 'Matrices', film: '09-matrices' },
  { prefix: 'OVERLAY', slug: 'overlays', title: 'Overlays', film: '10-overlays' },
];
const topicOf = op => TOPICS.find(t => op.startsWith(t.prefix + '_'));

// ---------- helpers ----------
const read = p => fs.readFileSync(p, 'utf8');
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const reset = p => { fs.rmSync(p, { recursive: true, force: true }); fs.mkdirSync(p, { recursive: true }); };
const yaml = s => JSON.stringify(s); // JSON strings are valid YAML scalars
const plain = md => md.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`>]/g, '').replace(/\s+/g, ' ').trim();
const clip = (s, n = 220) => (s.length > n ? s.slice(0, s.lastIndexOf(' ', n)) + '…' : s);
const mdxText = s => s.replace(/[{}<>]/g, c => ({ '{': '&#123;', '}': '&#125;', '<': '&lt;', '>': '&gt;' })[c]);
const decode = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

function walk(dir, skip = () => false, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name), rel = path.relative(base, p);
    if (skip(rel, e)) continue;
    if (e.isDirectory()) out.push(...walk(p, skip, base)); else out.push(rel);
  }
  return out.sort();
}
function copyFiles(from, to, files) {
  for (const f of files) { fs.mkdirSync(path.dirname(path.join(to, f)), { recursive: true }); fs.copyFileSync(path.join(from, f), path.join(to, f)); }
}
// Operator names in a request file: quoted SCREAMING_SNAKE values with a known prefix.
function operators(file) {
  const ops = new Map();
  for (const [, op] of read(file).matchAll(/"([A-Z][A-Z0-9]*_[A-Z0-9_]+)"/g)) if (topicOf(op)) ops.set(op, (ops.get(op) || 0) + 1);
  return ops;
}
// .layout.json = Pulse Studio layout sidecars: never requests, never published.
const isLayout = f => f.endsWith('.layout.json');
// .out/.predict = saved responses.
const isRequest = f => f.endsWith('.json') && !/\.(out|predict|layout)\.json$/.test(f);
const fmtSize = n => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

// usage[topicSlug] = [{ kind, slug, title, href, ops: Map }]
const usage = Object.fromEntries(TOPICS.map(t => [t.slug, []]));
function recordUsage(kind, slug, title, href, files) {
  const byTopic = {};
  for (const f of files) for (const [op, n] of operators(f)) {
    const t = topicOf(op).slug; (byTopic[t] ??= new Map()).set(op, (byTopic[t].get(op) || 0) + n);
  }
  for (const [t, ops] of Object.entries(byTopic)) usage[t].push({ kind, slug, title, href, ops });
  return Object.keys(byTopic);
}

for (const d of ['films', 'case-studies', 'topics']) reset(path.join(DOCS, d));
for (const d of ['films', 'showcase', 'plates']) reset(path.join(PUBLIC, d));
fs.mkdirSync(GENERATED, { recursive: true });

// ---------- films ----------
const films = fs.readdirSync(FILMS).filter(d => /^\d\d-/.test(d)).sort().map(dir => {
  const html = read(path.join(FILMS, dir, 'index.html'));
  const num = parseInt(dir, 10), topic = dir.replace(/^\d\d-/, '');
  const title = decode(html.match(/<title>([^<]*)<\/title>/)[1].replace(/^Pulse\s+/, ''));
  const intro = decode((html.match(/<p class="intro">([\s\S]*?)<\/p>/) || [, ''])[1].replace(/<[^>]+>/g, ''));
  const dataDir = path.join(FILMS, dir, 'data');
  const dataFiles = fs.existsSync(dataDir) ? walk(dataDir, rel => rel.endsWith('.pulse') || isLayout(rel)) : [];
  return { dir, num, topic, title, intro, dataFiles };
});
copyFiles(FILMS, path.join(PUBLIC, 'films'), ['kit/film-kit.js']);
fs.copyFileSync(path.join(FILMS, 'plates/index.html'), path.join(PUBLIC, 'plates/index.html'));
for (const f of films) {
  const keep = ['index.html', 'scenes.js', 'narration.mp3', 'subtitles.srt'].filter(n => fs.existsSync(path.join(FILMS, f.dir, n)));
  copyFiles(path.join(FILMS, f.dir), path.join(PUBLIC, 'films', f.dir), [...keep, ...f.dataFiles.map(d => `data/${d}`)]);
  f.topics = recordUsage('film', f.dir, `Film ${f.num}: ${f.title}`, `/films/${f.topic}/`,
    f.dataFiles.filter(isRequest).map(d => path.join(FILMS, f.dir, 'data', d)));
}

function transcript(srt) {
  return srt.trim().split(/\n\s*\n/).map(block => block.split('\n').slice(2).join(' ').trim()).filter(Boolean);
}

// ---------- case studies ----------
const studies = fs.readdirSync(SHOWCASE).filter(d => fs.existsSync(path.join(SHOWCASE, d, 'README.md'))).sort().map(slug => {
  const dir = path.join(SHOWCASE, slug);
  const readme = read(path.join(dir, 'README.md'));
  const title = readme.match(/^#\s+(.+)$/m)[1].trim();
  const body = readme.replace(/^#\s+.+\n/, '');
  const firstPara = body.split(/\n\s*\n/).map(p => p.trim()).find(p => p && !p.startsWith('#') && !p.startsWith('|'));
  const files = walk(dir, (rel, e) => /^(out|deliver)$/.test(e.name) || e.name.endsWith('.pulse') || isLayout(e.name) || e.name === '.gitignore');
  return { slug, dir, title, body, description: clip(plain(firstPara || title)), files };
});

// Rewrite a showcase's relative links for the site.
function rewriteLinks(md, s) {
  return md.replace(/\]\(([^)\s]+)\)/g, (m, target) => {
    if (/^(https?:|mailto:|#|\/)/.test(target)) return m;
    const [file, hash = ''] = target.split('#'), h = hash ? `#${hash}` : '';
    const clean = path.posix.normalize(file).replace(/^\.\//, '');
    if (clean === 'REPRODUCE.md') return `](/case-studies/${s.slug}/reproduce/${h})`;
    if (clean === 'README.md' || clean === '.') return `](/case-studies/${s.slug}/${h})`;
    if (clean.endsWith('/') || fs.existsSync(path.join(s.dir, clean)) && fs.statSync(path.join(s.dir, clean)).isDirectory())
      return `](/case-studies/${s.slug}/files/#${clean.replace(/\/$/, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase()})`;
    return `](/showcase/${s.slug}/${clean}${h})`;
  });
}

for (const [i, s] of studies.entries()) {
  copyFiles(s.dir, path.join(PUBLIC, 'showcase', s.slug), s.files);
  s.topics = recordUsage('case', s.slug, s.title, `/case-studies/${s.slug}/`,
    s.files.filter(f => isRequest(f) && f.startsWith('req/')).map(f => path.join(s.dir, f)));
  const topicLinks = TOPICS.filter(t => s.topics.includes(t.slug)).map(t => `[${t.title}](/topics/${t.slug}/)`).join(' · ');
  write(path.join(DOCS, 'case-studies', s.slug, 'index.md'), `---
title: ${yaml(s.title)}
description: ${yaml(s.description)}
sidebar:
  order: ${i + 1}
---

:::note[Run it yourself]
Every figure on this page comes from a Pulse request. See [how to reproduce it](/case-studies/${s.slug}/reproduce/) and [browse its files](/case-studies/${s.slug}/files/).
${topicLinks ? `\n**Pulse topics used:** ${topicLinks}\n` : ''}:::

${rewriteLinks(s.body, s)}`);
  if (fs.existsSync(path.join(s.dir, 'REPRODUCE.md'))) {
    const rep = read(path.join(s.dir, 'REPRODUCE.md'));
    write(path.join(DOCS, 'case-studies', s.slug, 'reproduce.md'), `---
title: ${yaml(`Reproduce: ${s.title}`)}
description: ${yaml(`Commands that rebuild every figure in the ${s.title} case study.`)}
---

${rewriteLinks(rep.replace(/^#\s+.+\n/, ''), s)}`);
  }
  const groups = {};
  for (const f of s.files) (groups[f.includes('/') ? f.split('/')[0] : '.'] ??= []).push(f);
  const sections = Object.entries(groups).map(([g, fs_]) => `## ${g === '.' ? 'Top level' : `${g}/`}\n\n` +
    fs_.map(f => `- [\`${f}\`](/showcase/${s.slug}/${f}) <small>${fmtSize(fs.statSync(path.join(s.dir, f)).size)}</small>`).join('\n')).join('\n\n');
  write(path.join(DOCS, 'case-studies', s.slug, 'files.md'), `---
title: ${yaml(`Files: ${s.title}`)}
description: ${yaml(`Requests, data and scripts behind the ${s.title} case study.`)}
---

Everything the [case study](/case-studies/${s.slug}/) uses, as committed in \`showcase/${s.slug}/\`.

${sections}
`);
}

// ---------- film pages ----------
for (const f of films) {
  const lines = fs.existsSync(path.join(FILMS, f.dir, 'subtitles.srt')) ? transcript(read(path.join(FILMS, f.dir, 'subtitles.srt'))) : [];
  const related = TOPICS.filter(t => t.film === f.dir);
  const cases = studies.filter(s => related.some(t => s.topics.includes(t.slug)));
  const dataList = f.dataFiles.map(d => `- [\`${d}\`](/films/${f.dir}/data/${d})`).join('\n');
  write(path.join(DOCS, 'films', `${f.topic}.mdx`), `---
title: ${yaml(`${f.num}. ${f.title}`)}
description: ${yaml(clip(f.intro))}
sidebar:
  order: ${f.num}
---
import FilmEmbed from '../../../components/FilmEmbed.astro';

<FilmEmbed src="/films/${f.dir}/index.html" title=${yaml(`Pulse film: ${f.title}`)} />
${related.length ? `
## See it in a real case

${cases.length ? cases.map(s => `- [${mdxText(s.title)}](/case-studies/${s.slug}/)`).join('\n') : 'No case study uses this yet.'}

Topic pages: ${related.map(t => `[${t.title}](/topics/${t.slug}/)`).join(' · ')}
` : ''}${dataList ? `
## Data behind this film

Every figure on this film's result cards comes from these Pulse runs. See [the film data guide](/reference/film-data/).

${dataList}
` : ''}${lines.length ? `
## Transcript

<details>
<summary>Read the narration</summary>

${lines.map(mdxText).join('\n\n')}

</details>
` : ''}`);
}

// ---------- topics ----------
for (const [i, t] of TOPICS.entries()) {
  const film = films.find(f => f.dir === t.film);
  const uses = usage[t.slug];
  const all = new Map();
  for (const u of uses) for (const [op, n] of u.ops) all.set(op, (all.get(op) || 0) + n);
  const where = uses.map(u => `| [${u.title}](${u.href}) | ${[...u.ops.keys()].sort().map(o => `\`${o}\``).join(', ')} |`).join('\n');
  write(path.join(DOCS, 'topics', `${t.slug}.md`), `---
title: ${yaml(t.title)}
description: ${yaml(`Where ${t.title.toLowerCase()} (${t.prefix}_*) appear across the films and case studies.`)}
sidebar:
  order: ${i + 1}
---

${film ? `**Learn it:** [Film ${film.num}: ${film.title}](/films/${film.topic}/)${t.film === '02-concepts' ? ' introduces them; no film covers them in depth yet.' : ''}` : ''}

## Operators in use

${all.size ? [...all].sort((a, b) => b[1] - a[1]).map(([op, n]) => `\`${op}\` ×${n}`).join(' · ') : 'None of the committed requests use this topic yet.'}

${where ? `## Where they appear\n\n| Used in | Operators |\n|---|---|\n${where}\n` : ''}
<small>Counted from the request files under each case study's \`req/\` and each film's \`data/\`. Pulse adds operators over time; your instance's manifest lists the ones it offers.</small>
`);
}

// ---------- reference: film data (single source: films/DATA.md) ----------
write(path.join(DOCS, 'reference/film-data.md'), `---
title: Film data
description: The cohorts, requests and captured Pulse outputs behind films 6 to 10.
---

${read(path.join(FILMS, 'DATA.md')).replace(/^#\s+.+\n/, '')}`);

// ---------- sidebar ----------
write(path.join(GENERATED, 'sidebar.json'), JSON.stringify({
  films: films.map(f => ({ label: `${f.num}. ${f.title}`, slug: `films/${f.topic}` })),
  cases: studies.map(s => ({ label: s.title.split(':')[0], slug: `case-studies/${s.slug}` })),
  topics: TOPICS.map(t => ({ label: t.title, slug: `topics/${t.slug}` })),
}, null, 2));

console.log(`synced ${films.length} films, ${studies.length} case studies, ${TOPICS.length} topics`);
