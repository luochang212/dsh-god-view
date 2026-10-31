#!/usr/bin/env node
// Build the published ADR archive. Runs before "astro dev" and "astro build".
// The atlas pages are self-contained HTML from adr-kit; this script also writes
// the small JSON index the Astro landing page reads.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, '..');
const repoRoot = resolve(siteRoot, '..');
const adrRoot = join(repoRoot, 'adr');
const outDir = join(siteRoot, 'public', 'decisions');
const dataDir = join(siteRoot, 'src', 'data');
const cli = join(repoRoot, 'node_modules', 'adr-kit', 'bin', 'adrkit.js');
const statuses = ['implemented', 'proposed', 'rejected', 'archived'];
const atlasPages = [
  ['folio', 'zh'],
  ['folio', 'en'],
  ['signal', 'zh'],
  ['signal', 'en'],
];

if (!existsSync(cli)) {
  throw new Error('adr-kit is not installed at the repository root; run npm ci there first.');
}

function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) return {};
  const end = text.indexOf('\n---', 4);
  if (end < 0) return {};
  return parse(text.slice(4, end)) ?? {};
}

function readTitle(text, file) {
  const heading = text.match(/^#\s+(?:ADR:\s*(?:\d+)\s+|Proposal:\s*|Rejected:\s*|Archived:\s*)(.+)$/m);
  if (heading) return heading[1].trim();
  return file
    .replace(/^\d+-/, '')
    .replace(/\.md$/, '')
    .replace(/-/g, ' ')
    .replace(/^[a-z]/, (letter) => letter.toUpperCase());
}

function readRecords() {
  const records = [];
  for (const status of statuses) {
    const dir = join(adrRoot, status);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.md')) continue;
      const absolute = join(dir, name);
      const text = readFileSync(absolute, 'utf8');
      const frontmatter = parseFrontmatter(text);
      const numbered = name.match(/^(\d+)-/);
      const file = relative(repoRoot, absolute).split(/[\\/]/).join('/');
      records.push({
        number: numbered ? Number(numbered[1]) : null,
        title: readTitle(text, name),
        description: String(frontmatter.description ?? ''),
        status,
        date: String(frontmatter.date ?? frontmatter.created ?? '').slice(0, 10),
        paths: Array.isArray(frontmatter.paths) ? frontmatter.paths.map(String) : [],
        file,
        href: 'https://github.com/luochang212/dsh-god-view/blob/main/' + file,
      });
    }
  }
  return records.sort(
    (a, b) =>
      (a.number ?? Number.MAX_SAFE_INTEGER) - (b.number ?? Number.MAX_SAFE_INTEGER) || a.title.localeCompare(b.title),
  );
}

function shortCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return String(process.env.GITHUB_SHA ?? 'unknown').slice(0, 7);
  }
}

function adrKitVersion() {
  try {
    return JSON.parse(readFileSync(join(repoRoot, 'node_modules', 'adr-kit', 'package.json'), 'utf8')).version;
  } catch {
    return 'unknown';
  }
}

function buildAtlases() {
  mkdirSync(outDir, { recursive: true });
  for (const [theme, language] of atlasPages) {
    execFileSync(
      process.execPath,
      [
        cli,
        'atlas',
        '--format',
        'html',
        '--theme',
        theme,
        '--lang',
        language,
        '--out',
        join(outDir, theme + '.' + language + '.html'),
      ],
      { cwd: repoRoot, stdio: 'inherit' },
    );
  }
}

function buildIndex(records) {
  const counts = Object.fromEntries(
    statuses.map((status) => [status, records.filter((record) => record.status === status).length]),
  );
  const dates = records
    .map((record) => record.date)
    .filter(Boolean)
    .sort();
  mkdirSync(dataDir, { recursive: true });
  const payload = {
    project: 'dsh-god-view',
    adrKitVersion: adrKitVersion(),
    commit: shortCommit(),
    generatedAt: new Date().toISOString(),
    counts,
    dates: {
      earliest: dates[0] ?? '',
      latest: dates.at(-1) ?? '',
      days: new Set(dates).size,
    },
    uniquePaths: new Set(records.flatMap((record) => record.paths)).size,
    records,
  };
  writeFileSync(join(dataDir, 'decisions.json'), JSON.stringify(payload, null, 2) + '\n');
  return payload;
}

const records = readRecords();
buildAtlases();
const index = buildIndex(records);
console.log(
  'archive ready: ' +
    index.counts.implemented +
    ' implemented, ' +
    index.counts.archived +
    ' archived, ' +
    index.uniquePaths +
    ' files across ' +
    index.dates.days +
    ' decision days.',
);
