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

function findNode(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findNode(child, predicate);
      if (hit) return hit;
    }
    return null;
  }
  if (predicate(node)) return node;
  return findNode(node.children, predicate);
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
test('the rail lists active projects only', () => {
  const active = { root: '/repo/active', name: 'active-repo', active: 2, claims: 1, changes: 1 };
  const idle = { root: '/repo/idle', name: 'idle-repo', active: 0, claims: 0, changes: 0 };
  const board = {
    root: active.root,
    projects: [idle, active],
    selectedRoot: active.root,
    agents: [],
    claims: [],
    changes: [],
    stats: { active: 2, claims: 1 },
  };
  const plugin = loadPlugin({
    documentLang: 'zh-CN',
    activeLocale: 'zh',
    queue: [board, '', false, { enabled: true, trackedSessions: 1, roots: [] }, false],
  });
  plugin.exports.apply(plugin.ctx);
  const tree = plugin.lastEntry('main').component();
  const list = findNode(tree, (node) => Array.isArray(node.props && node.props.projects));
  assert.ok(list, 'project list rendered');
  assert.deepEqual(
    list.props.projects.map((project) => project.name),
    ['active-repo'],
    'idle boards stay out of the rail',
  );
  assert.ok(findByClass(tree, 'pt-card'), 'a populated board renders section cards');
});

test('an empty board renders one blank state, not empty section boxes', () => {
  const board = {
    root: '',
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
    queue: [board, '', false, { enabled: true, trackedSessions: 0, roots: [] }, false],
  });
  plugin.exports.apply(plugin.ctx);
  const tree = plugin.lastEntry('main').component();
  assert.ok(findByClass(tree, 'pt-blank'), 'blank state rendered');
  assert.equal(findByClass(tree, 'pt-card'), null, 'no cards on a blank board');
  const text = textOf(tree);
  assert.ok(text.includes('没有活跃项目'), 'topbar names the blank state');
  assert.ok(text.includes('有会话在这里工作后'), 'blank state explains how projects appear');
});
test('the brand mark is the radiant eye, in the rail and on the blank page', () => {
  const project = { root: '/repo/one', name: 'one', active: 1, claims: 1, changes: 0 };
  const board = {
    root: project.root,
    projects: [project],
    selectedRoot: project.root,
    agents: [],
    claims: [],
    changes: [],
    stats: { active: 1, claims: 1 },
  };
  const plugin = loadPlugin({
    documentLang: 'zh-CN',
    activeLocale: 'zh',
    queue: [board, '', false, { enabled: true, trackedSessions: 1, roots: [] }, false],
  });
  plugin.exports.apply(plugin.ctx);

  const marks = [];
  const collect = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(collect);
      return;
    }
    if (typeof node.type === 'function' && node.type.name === 'BrandGlyph') marks.push(node);
    collect(node.children);
  };
  collect(plugin.lastEntry('main').component());
  assert.ok(marks.length > 0, 'the rail renders the brand mark');
  const svg = marks[0].type(marks[0].props);
  assert.equal(svg.props['data-glyph'], 'radiant-eye');
  assert.equal(svg.children.length, 3, 'lens, pupil, rays');
  assert.equal(svg.children[2].props.d.split('M').length - 1, 8, 'eight radiating strokes');

  const empty = loadPlugin({
    documentLang: 'zh-CN',
    activeLocale: 'zh',
    queue: [
      {
        root: '',
        projects: [],
        selectedRoot: '',
        agents: [],
        claims: [],
        changes: [],
        stats: { active: 0, claims: 0 },
      },
      '',
      false,
      { enabled: true, trackedSessions: 0, roots: [] },
      false,
    ],
  });
  empty.exports.apply(empty.ctx);
  const blankMarks = [];
  const collectBlank = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(collectBlank);
      return;
    }
    if (typeof node.type === 'function' && node.type.name === 'BrandGlyph') blankMarks.push(node);
    collectBlank(node.children);
  };
  collectBlank(empty.lastEntry('main').component());
  assert.deepEqual(
    blankMarks.map((mark) => mark.props.size),
    [20, 26],
    'rail brand mark plus the larger blank-page mark',
  );
});

test('the panel shows the Gantt without an event list', () => {
  assert.doesNotMatch(SOURCE, /TimelineSection|事件明细|Event details/);
  assert.doesNotMatch(SOURCE, /pt-tl|pt-timeline/);
});
