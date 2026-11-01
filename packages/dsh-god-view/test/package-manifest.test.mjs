import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

test('package declares an installable DSH bundle', () => {
  assert.equal(pkg.dsh?.bundle?.patch, './cordis.patch.yml');
  assert.equal(pkg.dsh?.client?.platform, 'web');
  assert.match(pkg.engines?.dsh || '', /^>=0\.2\.0/);
});

test('package is the DSH adapter, not the generic core', () => {
  assert.equal(pkg.main, './lib/index.js');
  assert.equal(pkg.exports?.['./store'], undefined, 'the store is owned by godview');
  assert.equal(pkg.bin, undefined, 'the CLI is owned by godview');
  assert.equal(pkg.dependencies?.godview, '^0.1.0');
  assert.ok(pkg.files.includes('README.md'));
  assert.ok(pkg.files.includes('LICENSE'));
});

test('bundle patch is shipped, targets this package, and has no config-as-code', () => {
  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8');
  assert.match(patch, /id:\s*dsh-god-view/);
  assert.match(patch, /name:\s*dsh-god-view/);
  assert.doesNotMatch(patch, /!!js/);
  assert.ok(pkg.files.includes('cordis.patch.yml'));
});

test('market metadata exports are declared and complete', () => {
  assert.equal(pkg.exports?.['./cordis.patch.yml'], './cordis.patch.yml');
  assert.equal(pkg.exports?.['./locale/*.json'], './locale/*.json');
  assert.equal(pkg.exports?.['./icon'], './icon.svg');
  assert.ok(pkg.files.includes('locale/*.json'));
  assert.ok(pkg.files.includes('icon.svg'));

  for (const lang of ['en', 'zh']) {
    const locale = JSON.parse(readFileSync(join(root, 'locale', lang + '.json'), 'utf8'));
    assert.ok(locale.meta?.title?.trim(), lang + ' title');
    assert.ok(locale.meta?.description?.trim(), lang + ' description');
  }
});

test('icon is a small valid SVG on the same 24x24 grid as the panel mark', () => {
  const icon = readFileSync(join(root, 'icon.svg'));
  assert.ok(icon.length <= 256 * 1024);
  const text = icon.toString('utf8');
  assert.match(text, /^<svg\b/);
  assert.match(text, /viewBox="0 0 24 24"/);
  assert.match(text, /r="4\.4"/);
});
