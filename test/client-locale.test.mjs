import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const CLIENT_PATH = fileURLToPath(new URL('../lib/client.js', import.meta.url));
const SOURCE = readFileSync(CLIENT_PATH, 'utf8');

function createReact(queue = []) {
  const element = (type, props, ...children) => ({ type, props: props || {}, children });
  let cursor = 0;
  return {
    createElement: element,
    useState: (init) => {
      const value = cursor < queue.length ? queue[cursor] : typeof init === 'function' ? init() : init;
      cursor += 1;
      return [value, () => {}];
    },
    useEffect: () => {},
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    useRef: (value) => ({ current: value }),
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  };
}

function textOf(node) {
  if (node === null || node === undefined || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return textOf(node.children);
}

function findByProp(node, key, value) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findByProp(child, key, value);
      if (hit) return hit;
    }
    return null;
  }
  if (node.props && node.props[key] === value) return node;
  return findByProp(node.children, key, value);
}

function findByClass(node, className) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findByClass(child, className);
      if (hit) return hit;
    }
    return null;
  }
  if (node.props && node.props.className === className) return node;
  return findByClass(node.children, className);
}

/**
 * Load the real browser bundle with a fake host: the document language is the
 * stale \`en\` default the Host serves before its locale resolves, while the host
 * locale service already knows the active language.
 */
function loadPlugin({ documentLang, activeLocale, queue, fetchImpl }) {
  let spec = null;
  const react = createReact(queue);
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load: (loaded) => {
          spec = loaded;
        },
      },
    },
    document: {
      documentElement: { lang: documentLang, setAttribute() {}, getAttribute: () => documentLang },
      createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
      head: { appendChild() {} },
      querySelector: () => null,
      getElementById: () => null,
    },
    navigator: { language: 'zh-CN' },
    fetch: fetchImpl || (() => Promise.reject(new Error('unexpected fetch'))),
    console,
  };
  vm.runInNewContext(SOURCE, sandbox, { filename: CLIENT_PATH });
  assert.ok(spec, 'client bundle registers itself with the module loader');

  const exports = spec.factory((id) => {
    if (id === 'react') return react;
    throw new Error('unexpected require: ' + id);
  });

  const state = { active: activeLocale };
  const listeners = new Set();
  const registrations = [];
  const ctx = {
    locale: {
      getSnapshot: () => ({ active: state.active, locales: [], revision: 1 }),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    effect: (fn) => {
      const dispose = fn();
      return () => {
        if (typeof dispose === 'function') dispose();
      };
    },
    slots: {
      inject: (_name, fn) => fn(),
      register: (options, component) => {
        registrations.push({ options, component });
        return () => {};
      },
    },
  };

  return {
    exports,
    ctx,
    registrations,
    setLocale(active) {
      state.active = active;
      for (const listener of [...listeners]) listener();
    },
    lastEntry(name) {
      const rows = registrations.filter((entry) => entry.options.name === name);
      return rows[rows.length - 1];
    },
    panelTitle() {
      const main = this.lastEntry('main');
      assert.ok(main, 'main panel registered');
      const tree = main.component();
      const title = findByClass(tree, 'pt-title');
      assert.ok(title, 'panel title rendered');
      return textOf(title);
    },
  };
}

test('client language follows the host locale, not the stale document default', () => {
  const plugin = loadPlugin({ documentLang: 'en', activeLocale: 'zh' });
  plugin.exports.apply(plugin.ctx);

  const entry = plugin.registrations.find((row) => row.options.name === 'sidebar.panellist');
  assert.ok(entry, 'sidebar entry registered');
  assert.equal(entry.options.label, '上帝视角', 'sidebar label uses the host locale despite <html lang="en">');
  assert.equal(plugin.panelTitle(), '上帝视角');
});

test('client declares the locale service it reads', () => {
  const plugin = loadPlugin({ documentLang: 'zh-CN', activeLocale: 'zh' });
  assert.ok(Array.isArray(plugin.exports.inject), 'plugin declares injected services');
  assert.ok(plugin.exports.inject.includes('locale'), 'locale service is injected');
  assert.ok(plugin.exports.inject.includes('slots'), 'slots service is injected');
});

test('an open panel follows a runtime locale change without a reload', () => {
  const plugin = loadPlugin({ documentLang: 'zh-CN', activeLocale: 'zh' });
  plugin.exports.apply(plugin.ctx);
  assert.equal(plugin.panelTitle(), '上帝视角');

  plugin.setLocale('en');
  assert.equal(plugin.panelTitle(), "God's Eye View", 'panel re-renders in the new language');
  assert.equal(
    plugin.lastEntry('sidebar.panellist').options.label,
    "God's Eye",
    'sidebar label is registered again in the new language',
  );

  plugin.setLocale('zh');
  assert.equal(plugin.panelTitle(), '上帝视角', 'panel switches back');
  assert.equal(plugin.lastEntry('sidebar.panellist').options.label, '上帝视角', 'sidebar label returns to Chinese');
});

test('the read-only panel names claims and releases, never replies', () => {
  assert.doesNotMatch(SOURCE, /\breply\b/i, 'the client must not reintroduce a reply concept (ADR 2)');
  assert.doesNotMatch(SOURCE, /回复/);
});

test('the panel exposes one coordination switch that posts the new mode', () => {
  const calls = [];
  const board = {
    root: '/tmp/repo',
    projects: [],
    selectedRoot: '',
    agents: [],
    claims: [],
    changes: [],
    stats: { active: 0, claims: 0 },
  };
  const plugin = loadPlugin({
    documentLang: 'zh-CN',
    activeLocale: 'zh',
    // useTeamState allocates state, error, loading, coordination, switching in order.
    queue: [board, '', false, { enabled: false, trackedSessions: 0, roots: [] }, false],
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ enabled: true, trackedSessions: 0, roots: [] }) };
    },
  });
  plugin.exports.apply(plugin.ctx);
  const main = plugin.lastEntry('main');
  assert.ok(main, 'main panel registered');
  const toggle = findByProp(main.component(), 'role', 'switch');
  assert.ok(toggle, 'coordination switch rendered');
  assert.equal(toggle.props['data-coordination'], 'off');
  toggle.props.onClick();
  assert.equal(calls.length, 1, 'clicking the switch posts once');
  assert.match(calls[0].url, /\/coordination$/);
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body), { enabled: true });
});
