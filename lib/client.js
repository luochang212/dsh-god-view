/**
 * dsh-god-view browser plugin.
 *
 * Read-only observability. The board answers:
 *   which conversation is active?
 *   what change is it making, on which files?
 *   what was released / done?
 *   who held which file, and when was it released?
 *
 * There is no human composer or message queue: agents own focus, claim, and release.
 */
window.__ModuleLoader__.load({
  id: 'dsh-god-view',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    const React = require('react');
    const h = React.createElement;
    const PANEL_ID = 'dsh-god-view';
    const API = '/plugins/dsh-god-view/api';
    const STYLE_ID = 'dsh-god-view-style';

    // The Host owns the UI language. apply() subscribes to the Host locale
    // service; the served document language is only the pre-apply fallback, and
    // it is a stale "en" until the Host locale has resolved.
    function readDocumentLanguage() {
      try {
        const lang = (document.documentElement.lang || navigator.language || '').toLowerCase();
        return lang.indexOf('zh') === 0;
      } catch (_error) {
        return false;
      }
    }

    let chinese = readDocumentLanguage();
    const languageListeners = new Set();

    function setChinese(next) {
      if (next === chinese) return;
      chinese = next;
      for (const listener of Array.from(languageListeners)) {
        try {
          listener();
        } catch (_error) {}
      }
    }

    function subscribeLanguage(listener) {
      languageListeners.add(listener);
      return () => {
        languageListeners.delete(listener);
      };
    }

    function useChinese() {
      return React.useSyncExternalStore(
        subscribeLanguage,
        () => chinese,
        () => chinese,
      );
    }

    function L(zh, en) {
      return chinese ? zh : en;
    }

    function statusLabel(status) {
      if (status === 'active') return L('进行中', 'active');
      if (status === 'idle') return L('空闲', 'idle');
      if (status === 'blocked') return L('受阻', 'blocked');
      if (status === 'done') return L('已结束', 'ended');
      return status;
    }

    const CSS = [
      '.pt-root{--pt-fs-10:10px;--pt-fs-11:11px;--pt-fs-12:12px;--pt-fs-13:13px;--pt-fs-15:15px;--pt-fs-16:16px;--pt-gap-1:4px;--pt-gap-2:8px;--pt-gap-3:12px;--pt-gap-4:16px;--pt-gap-5:20px;--pt-radius-md:12px;--pt-rail:264px;--pt-topbar:56px;position:relative;box-sizing:border-box;height:100%;min-height:100%;overflow:hidden;display:flex;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#111);font-family:var(--dsw-font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--pt-fs-13);line-height:1.45}',
      '.pt-root *{box-sizing:border-box}',
      '.pt-side{width:var(--pt-rail);flex:none;display:flex;flex-direction:column;min-height:0;order:2;padding:56px 10px 10px;background:var(--dsw-specific-sidebar-fill,#f9fafb);border-left:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.04))}',
      '.pt-projects{flex:1;min-height:0;display:flex;flex-direction:column;gap:1px;overflow:auto;padding:6px 2px 6px 0;scrollbar-gutter:stable;scrollbar-color:var(--dsw-alias-border-l3,#d1d5db) transparent}',
      '.pt-project{position:relative;display:flex;align-items:center;gap:8px;width:100%;min-height:40px;text-align:left;font:inherit;line-height:1.2;cursor:pointer;border:0;border-radius:8px;padding:6px 8px;background:transparent;color:inherit;transition:background .15s ease}',
      '.pt-project:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06))}',
      '.pt-project:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#3b82f6));outline-offset:-2px}',
      '.pt-project.selected{background:var(--dsw-alias-bg-multi-select,#f5f7fa)}',
      '.pt-project-dot{width:7px;height:7px;border-radius:50%;flex:none;background:var(--dsw-alias-label-dimmed,#9ca3af)}',
      '.pt-project-dot.working{background:var(--dsw-alias-state-success-primary,#22c55e);animation:pt-dot-pulse 2.4s ease-out infinite}',
      '.pt-project-dot.blocked{background:var(--dsw-alias-label-error,#dc2626)}',
      '.pt-project-dot.claimed{background:var(--dsw-alias-state-warn-primary,#f59e0b)}',
      '.pt-project-body{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}',
      '.pt-project-line{display:flex;align-items:center;gap:6px;min-width:0;line-height:16px}',
      '.pt-project-name{font-weight:600;font-size:var(--pt-fs-12);line-height:16px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.pt-project-meta{font-size:var(--pt-fs-10);line-height:12px;color:var(--dsw-alias-label-tertiary,#8a8f98);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.pt-project-seen{font-size:var(--pt-fs-10);line-height:16px;color:var(--dsw-alias-label-tertiary,#8a8f98);flex:none}',
      '.pt-main{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden}',
      '.pt-topbar{flex:none;display:flex;align-items:center;gap:14px;height:var(--pt-topbar);padding:0 20px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.04));min-width:0}',
      '.pt-topbar-title{display:flex;flex-direction:column;justify-content:center;gap:1px;min-width:0;flex:1}',
      '.pt-project-title{margin:0;font-size:var(--pt-fs-15);font-weight:650;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.pt-project-path{margin:0;font-family:var(--dsw-font-markdown-code-font-family,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:var(--pt-fs-11);line-height:1.35;color:var(--dsw-alias-label-tertiary,#8a8f98);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.pt-topbar-actions{display:flex;align-items:center;gap:10px;flex:none}',
      '.pt-switch{position:relative;flex:none;width:36px;height:20px;padding:2px;border:0;border-radius:999px;corner-shape:round;background:var(--dsw-alias-border-l3,rgba(0,0,0,.12));cursor:pointer}',
      '.pt-switch:disabled{cursor:default;opacity:.5}',
      '.pt-switch:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#3b82f6));outline-offset:2px}',
      '.pt-thumb{display:block;width:16px;height:16px;border-radius:50%;corner-shape:round;background:var(--dsw-alias-switch-thumb,#fff);transition:transform 120ms ease}',
      '.pt-switch[aria-checked="true"]{background:var(--dsw-alias-brand-primary,#111)}',
      '.pt-switch[aria-checked="true"] .pt-thumb{background:var(--dsw-alias-label-primary-foreground,#fff);transform:translateX(16px)}',
      '.pt-iconbtn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;flex:none;padding:0;border:0;border-radius:var(--dsw-radius-sm,8px);background:transparent;color:var(--dsw-alias-label-secondary,#5a5f66);cursor:pointer}',
      '.pt-iconbtn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06))}',
      '.pt-iconbtn:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#3b82f6));outline-offset:2px}',
      '.pt-iconbtn[aria-expanded="true"] svg{transform:scaleX(-1)}',
      '.pt-rail-toggle{position:absolute;top:14px;right:14px;z-index:5}',
      '.pt-topbar-actions-offset{padding-right:46px}',
      '@media (prefers-reduced-motion:reduce){.pt-switch,.pt-thumb{transition:none}}',
      '.pt-content{flex:1;min-height:0;overflow:auto;padding:20px 24px 28px;scrollbar-color:var(--dsw-alias-border-l3,#d1d5db) transparent}',
      '.pt-content::-webkit-scrollbar{width:10px;height:10px}',
      '.pt-content::-webkit-scrollbar-thumb{background-color:var(--dsw-alias-border-l3,#d1d5db);border:3px solid transparent;background-clip:content-box;border-radius:999px}',
      '.pt-content::-webkit-scrollbar-track{background:transparent}',
      '.pt-card{margin:0 0 14px;background:var(--dsw-alias-bg-base,#fff);border-radius:var(--pt-radius-md);box-shadow:var(--dsw-elevation-soft,0 0 0 .5px rgba(15,18,25,.08))}',
      '.pt-card:last-child{margin-bottom:0}',
      '.pt-card-head{display:flex;align-items:center;gap:var(--pt-gap-2);padding:11px 16px;border-bottom:1px solid var(--dsw-alias-border-l1,#eef0f2)}',
      '.pt-card-title{display:inline-flex;align-items:center;gap:6px;font-size:var(--pt-fs-11);font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary,#8a8f98)}',
      '.pt-card-count{font-size:var(--pt-fs-10);color:var(--dsw-alias-label-tertiary,#8a8f98);font-variant-numeric:tabular-nums}',
      '.pt-card-note{margin-left:auto;font-size:var(--pt-fs-10);color:var(--dsw-alias-label-tertiary,#8a8f98);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.pt-card-body{min-width:0;padding:4px 0 6px}',
      '.pt-list{display:flex;flex-direction:column}',
      '.pt-row{display:flex;align-items:flex-start;gap:9px;min-width:0;padding:10px 16px}',
      '.pt-row + .pt-row{border-top:1px solid var(--dsw-alias-border-l1,#eef0f2)}',
      '.pt-row-body{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}',
      '.pt-row-line{display:flex;align-items:center;gap:var(--pt-gap-2);min-width:0}',
      '.pt-row-meta{display:flex;align-items:center;gap:6px;min-width:0;font-size:var(--pt-fs-10);color:var(--dsw-alias-label-tertiary,#8a8f98);white-space:nowrap;overflow:hidden}',
      '.pt-status{width:8px;height:8px;border-radius:50%;flex:none;margin-top:5px;background:var(--dsw-alias-label-dimmed,#9ca3af)}',
      '.pt-status.active{background:var(--dsw-alias-state-success-primary,#22c55e)}',
      '.pt-status.blocked{background:var(--dsw-alias-state-warn-primary,#f59e0b)}',
      '.pt-status.idle{background:var(--dsw-alias-label-dimmed,#9ca3af)}',
      '.pt-status.done{background:var(--dsw-alias-state-business-primary,#3b82f6)}',
      '.pt-name{font-weight:600;font-size:var(--pt-fs-13);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;flex:none}',
      '.pt-focus{font-size:var(--pt-fs-12);color:var(--dsw-alias-label-secondary,#444);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.pt-ptitle{font-size:var(--pt-fs-10);color:var(--dsw-alias-label-secondary,#555);max-width:200px;flex:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.pt-empty{padding:14px 16px;color:var(--dsw-alias-label-tertiary,#8a8f98);font-size:12px}',
      '.pt-blank{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:32px 24px;text-align:center}',
      '.pt-blank-glyph{display:inline-flex;color:var(--dsw-alias-label-tertiary,#8a8f98);opacity:.5}',
      '.pt-blank-text{margin:0;max-width:340px;font-size:var(--pt-fs-12);line-height:1.65;color:var(--dsw-alias-label-tertiary,#8a8f98)}',
      '.pt-error{border:1px solid color-mix(in srgb,var(--dsw-alias-label-error,#dc2626) 35%,transparent);background:color-mix(in srgb,var(--dsw-alias-label-error,#dc2626) 7%,transparent);color:var(--dsw-alias-label-error,#b91c1c);border-radius:9px;padding:10px 12px;font-size:12.5px;margin-bottom:14px;word-break:break-word}',
      '.pt-loading{color:var(--dsw-alias-label-tertiary,#8a8f98);font-size:12.5px;padding:24px 0}',
      '.pt-gantt{padding:10px 16px 14px}',
      '.pt-gantt-legend{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px;font-size:11px;color:var(--dsw-alias-label-secondary,#555)}',
      '.pt-gantt-legend-item{display:inline-flex;align-items:center;gap:5px}',
      '.pt-gantt-legend-dot{width:8px;height:8px;border-radius:2px}',
      '.pt-gantt-head{display:grid;grid-template-columns:190px 1fr;gap:0 10px;align-items:end}',
      '.pt-gantt-axis{position:relative;height:17px}',
      '.pt-gantt-tick{position:absolute;transform:translateX(-50%);font-family:var(--dsw-font-markdown-code-font-family,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:9.5px;color:var(--dsw-alias-label-tertiary,#8a8f98);white-space:nowrap}',
      '.pt-gantt-row{display:grid;grid-template-columns:190px 1fr;gap:0 10px;align-items:center;min-height:30px;border-top:1px solid var(--dsw-alias-border-l1,#eef0f2)}',
      '.pt-gantt-path{font-family:var(--dsw-font-markdown-code-font-family,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:10.5px;color:var(--dsw-alias-label-secondary,#555);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.pt-gantt-lane{position:relative;height:24px;background:var(--dsw-alias-bg-layer-1,#fafafa);border-radius:4px;margin:3px 0;overflow:hidden}',
      '.pt-gantt-grid{position:absolute;top:0;bottom:0;border-left:1px dashed var(--dsw-alias-border-l2,#e5e7eb);opacity:.65}',
      '.pt-gantt-bar{position:absolute;top:4px;height:16px;border-radius:4px;min-width:3px;color:#fff;font-size:9.5px;display:flex;align-items:center;padding:0 5px;overflow:hidden;white-space:nowrap;box-shadow:0 1px 1px rgba(0,0,0,.12)}',
      '.pt-gantt-bar.active{background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.22) 0 4px,transparent 4px 8px);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-warn-primary,#f59e0b) 45%,transparent)}',
      '.pt-gantt-bar-label{overflow:hidden;text-overflow:ellipsis}',
      '.pt-gantt-bar:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:2px}',
      '.pt-tip{position:fixed;z-index:9999;pointer-events:none;transform:translate(-50%,-100%);max-width:320px;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:8px;background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-primary,#111);box-shadow:0 8px 24px rgba(0,0,0,.14);padding:8px 10px;font-size:11px;line-height:1.4}',
      '.pt-tip-title{font-family:var(--dsw-font-markdown-code-font-family,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:10.5px;font-weight:600;word-break:break-all;margin-bottom:3px}',
      '.pt-tip-line{color:var(--dsw-alias-label-secondary,#555);white-space:nowrap}',
      '.pt-tip-note{color:var(--dsw-alias-label-tertiary,#8a8f98);margin-top:3px;word-break:break-word}',
      '.pt-gantt-now{position:absolute;top:0;bottom:0;border-left:1px solid var(--dsw-alias-label-error,#dc2626);opacity:.7}',
      '@keyframes pt-dot-pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--dsw-alias-state-success-primary,#22c55e) 45%,transparent)}70%{box-shadow:0 0 0 5px transparent}100%{box-shadow:0 0 0 0 transparent}}',
      '@media(prefers-reduced-motion:reduce){.pt-project-dot.working{animation:none}}',
      '@media(max-width:820px){.pt-root{--pt-rail:220px}}',
      '@media(max-width:700px){.pt-root{flex-direction:column}.pt-side{order:0;width:100%;height:auto;max-height:208px;border-left:0;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.04))}.pt-main{order:1}}',
    ].join('\n');

    function ensureStyle() {
      let element = document.getElementById(STYLE_ID);
      if (element) return () => {};
      element = document.createElement('style');
      element.id = STYLE_ID;
      element.textContent = CSS;
      document.head.appendChild(element);
      return () => {
        try {
          element.remove();
        } catch (_error) {}
      };
    }

    // Brand mark: the radiant eye. A lens outline and pupil with eight
    // radiating strokes, drawn on the same 24x24 grid and 1.8 stroke as the
    // lucide icons around it so it stays legible at 18-19px (ADR 12).
    function BrandGlyph(props) {
      const size = props && props.size ? props.size : 20;
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'data-glyph': 'radiant-eye',
          'aria-hidden': 'true',
        },
        h('circle', { cx: 12, cy: 12, r: 4.4 }),
        h('circle', { cx: 12, cy: 12, r: 1.4 }),
        h('path', {
          d: 'M12 3.8V1.4M12 20.2V22.6M20.2 12H22.6M3.8 12H1.4M17.8 6.2l1.7-1.7M17.8 17.8l1.7 1.7M6.2 17.8l-1.7 1.7M6.2 6.2L4.5 4.5',
        }),
      );
    }

    function SidebarIcon(props) {
      return h(BrandGlyph, { size: props && props.size ? props.size : 18 });
    }

    function Icon(props) {
      const size = props.size || 14;
      let content = null;
      if (props.name === 'users') {
        content = [
          h('circle', { key: 'a', cx: 9, cy: 8, r: 3 }),
          h('path', { key: 'b', d: 'M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6' }),
          h('circle', { key: 'c', cx: 17.5, cy: 9, r: 2.2 }),
          h('path', { key: 'd', d: 'M15.7 14.7c2.3.2 4 1.7 4.6 4.1' }),
        ];
      } else if (props.name === 'chart') {
        content = [
          h('path', { key: 'a', d: 'M4 20V10' }),
          h('path', { key: 'b', d: 'M10 20V4' }),
          h('path', { key: 'c', d: 'M16 20v-7' }),
          h('path', { key: 'd', d: 'M22 20H2' }),
        ];
      } else if (props.name === 'panel') {
        content = [
          h('rect', { key: 'a', x: 3, y: 4, width: 18, height: 16, rx: 2 }),
          h('path', { key: 'b', d: 'M15 4v16' }),
        ];
      }
      return h(
        'svg',
        {
          className: 'pt-icon',
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        content,
      );
    }

    function ago(ms) {
      if (!ms) return L('从未', 'never');
      const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
      if (seconds < 60) return seconds + 's';
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return minutes + 'm';
      const hours = Math.floor(minutes / 60);
      if (hours < 48) return hours + 'h';
      return Math.floor(hours / 24) + 'd';
    }

    function clock(ms) {
      try {
        return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch (_error) {
        return '';
      }
    }

    function shortSession(sessionId) {
      if (!sessionId) return L('CLI', 'CLI');
      return String(sessionId)
        .replace(/^session-/, '')
        .slice(0, 8);
    }

    async function request(path) {
      const response = await fetch(API + path, { credentials: 'same-origin' });
      let value;
      try {
        value = await response.json();
      } catch (_error) {
        value = undefined;
      }
      if (!response.ok) throw new Error(value && value.error ? value.error : 'HTTP ' + response.status);
      return value;
    }

    function useTeamState() {
      const [state, setState] = React.useState(null);
      const [error, setError] = React.useState('');
      const [loading, setLoading] = React.useState(true);
      const [coordination, setCoordination] = React.useState({ enabled: false, trackedSessions: 0, roots: [] });
      const [switching, setSwitching] = React.useState(false);
      const requestId = React.useRef(0);
      const selectedRef = React.useRef('');

      const load = React.useCallback(async (quiet, wantedRoot) => {
        const id = ++requestId.current;
        if (!quiet) setLoading(true);
        try {
          const board = await request('/projects');
          if (id !== requestId.current) return;
          const projects = Array.isArray(board.projects) ? board.projects : [];
          // The rail lists active boards only, so selection follows an active
          // project: an idle selection is dropped instead of showing a dead page.
          const actives = projects.filter(isActiveProject);
          let root = wantedRoot || selectedRef.current || board.currentRoot || (actives[0] && actives[0].root);
          if (root && !actives.some((project) => project.root === root)) root = actives[0] ? actives[0].root : '';
          if (!root) {
            // A dormant install has no board yet; that is a state, not an error.
            // A refreshed client can also outrun the host process, so a missing
            // route must not fail the whole load.
            const orphan = await request('/coordination').catch(() => null);
            const info = orphan || { enabled: false, trackedSessions: 0, roots: [], unavailable: true };
            setCoordination(info);
            selectedRef.current = '';
            setState({
              projects,
              selectedRoot: '',
              coordination: info,
              agents: [],
              claims: [],
              changes: [],
              stats: { active: 0, working: 0, blocked: 0, claims: 0 },
            });
            setError('');
            return;
          }
          selectedRef.current = root;
          const value = await request('/state?root=' + encodeURIComponent(root));
          if (id !== requestId.current) return;
          const info = value.coordination || {
            enabled: false,
            trackedSessions: 0,
            roots: [],
            unavailable: true,
          };
          setCoordination(info);
          setState(Object.assign({}, value, { projects, selectedRoot: root, coordination: info }));
          setError('');
        } catch (caught) {
          if (id !== requestId.current) return;
          setError(caught && caught.message ? caught.message : String(caught));
        } finally {
          if (id === requestId.current) setLoading(false);
        }
      }, []);

      React.useEffect(() => {
        load(false);
        const timer = setInterval(() => {
          if (document.visibilityState === 'hidden') return;
          load(true);
        }, 2500);
        return () => clearInterval(timer);
      }, [load]);

      const setCoordinationMode = React.useCallback(
        async (enabled) => {
          setSwitching(true);
          try {
            const response = await fetch(API + '/coordination', {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ enabled: enabled === true }),
            });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            setCoordination(await response.json());
            await load(true);
          } catch (caught) {
            setError(caught && caught.message ? caught.message : String(caught));
          } finally {
            setSwitching(false);
          }
        },
        [load],
      );

      return {
        state,
        error,
        loading,
        coordination,
        switching,
        setCoordinationMode,
        selectProject: (root) => {
          selectedRef.current = root;
          load(false, root);
        },
      };
    }

    function projectStatus(project) {
      if (project.status) return project.status;
      if (project.working > 0 || project.blocked > 0) return 'active';
      return project.claims > 0 ? 'claimed' : 'idle';
    }

    function isActiveProject(project) {
      return projectStatus(project) !== 'idle';
    }

    function ProjectRow(props) {
      const project = props.project;
      const selected = props.selected;
      const working = Number(project.working) || 0;
      const blocked = Number(project.blocked) || 0;
      const claims = Number(project.claims) || 0;
      const changes = Number(project.changes) || 0;
      const dot = blocked > 0 ? 'blocked' : working > 0 ? 'working' : claims > 0 ? 'claimed' : '';
      const state = blocked
        ? L('受阻', 'blocked')
        : working
          ? L('进行中', 'working')
          : claims
            ? L('占用', 'claimed')
            : L('最近活跃', 'recent');
      const seen = project.lastActivityAt || project.lastSeenAt;
      const title = [project.root, project.lastSummary, state].filter(Boolean).join('\n');
      const meta = [
        working + L(' 进行中', ' working'),
        blocked ? blocked + L(' 受阻', ' blocked') : null,
        claims + L(' 占用', ' claims'),
        changes + L(' 变更', ' changes'),
      ]
        .filter(Boolean)
        .join(' · ');
      return h(
        'button',
        {
          className: 'pt-project' + (selected ? ' selected' : ''),
          onClick: () => props.onSelect(project.root),
          title,
          'aria-current': selected ? 'page' : undefined,
        },
        h('span', { className: 'pt-project-dot' + (dot ? ' ' + dot : '') }),
        h(
          'span',
          { className: 'pt-project-body' },
          h(
            'span',
            { className: 'pt-project-line' },
            h('span', { className: 'pt-project-name' }, project.name),
            h('span', { className: 'pt-project-seen' }, seen ? ago(seen) : ''),
          ),
          h('span', { className: 'pt-project-meta' }, meta),
        ),
      );
    }

    function ProjectsSection(props) {
      if (props.projects.length === 0) return null;
      return h(
        'div',
        { className: 'pt-projects' },
        props.projects.map((project) =>
          h(ProjectRow, {
            key: project.root,
            project,
            selected: project.root === props.selectedRoot,
            onSelect: props.onSelect,
          }),
        ),
      );
    }

    function SessionRow(props) {
      const agent = props.agent;
      const focus = agent.focus || agent.lastAction || L('尚未说明在做什么', 'No focus yet');
      return h(
        'div',
        { className: 'pt-row' },
        h('span', { className: 'pt-status ' + (agent.stale ? '' : agent.status) }),
        h(
          'div',
          { className: 'pt-row-body' },
          h(
            'div',
            { className: 'pt-row-line' },
            h('span', { className: 'pt-name', title: agent.name }, agent.name),
            h('span', { className: 'pt-focus', title: focus }, focus),
          ),
          h(
            'div',
            { className: 'pt-row-meta' },
            agent.sessionTitle
              ? h('span', { className: 'pt-ptitle', title: agent.sessionTitle }, agent.sessionTitle)
              : null,
            h('span', null, 'session ' + shortSession(agent.sessionId)),
            h('span', null, '·'),
            h('span', null, statusLabel(agent.stale ? 'idle' : agent.status)),
            h('span', null, '·'),
            h('span', { title: L('最后活动', 'last activity') }, ago(agent.updatedAt || agent.heartbeatAt)),
            agent.activeChanges ? h('span', null, '· ' + agent.activeChanges + L(' 个变更', ' changes')) : null,
          ),
        ),
      );
    }

    function stamp(ms) {
      try {
        const d = new Date(ms);
        const p = (n) => String(n).padStart(2, '0');
        return (
          p(d.getMonth() + 1) +
          '-' +
          p(d.getDate()) +
          ' ' +
          p(d.getHours()) +
          ':' +
          p(d.getMinutes()) +
          ':' +
          p(d.getSeconds())
        );
      } catch (_error) {
        return '';
      }
    }

    const AGENT_COLORS = ['#4d6bfe', '#b45309', '#15803d', '#be185d', '#6d28d9', '#0e7490', '#b91c1c', '#4d7c0f'];

    function colorFor(key) {
      const text = String(key || '');
      let h = 0;
      for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
      return AGENT_COLORS[h % AGENT_COLORS.length];
    }

    function fmtDuration(ms) {
      const value = Math.max(0, ms);
      if (value < 60_000) return Math.max(1, Math.round(value / 1000)) + 's';
      const minutes = Math.floor(value / 60_000);
      const seconds = Math.floor((value % 60_000) / 1000);
      if (minutes < 60) return minutes + 'm' + (seconds ? ' ' + seconds + 's' : '');
      const hours = Math.floor(minutes / 60);
      const rest = minutes % 60;
      return hours + 'h' + (rest ? ' ' + rest + 'm' : '');
    }

    function tickLabel(ms, span) {
      try {
        const d = new Date(ms);
        const p = (n) => String(n).padStart(2, '0');
        if (span < 5 * 60_000) return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
        if (span < 24 * 3600_000) return p(d.getHours()) + ':' + p(d.getMinutes());
        return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
      } catch (_error) {
        return '';
      }
    }

    function buildIntervals(changes) {
      const events = [];
      for (const change of changes) {
        for (const event of change.timeline || []) {
          const paths = event.path ? [event.path] : Array.isArray(event.paths) ? event.paths : [];
          for (const path of paths) events.push(Object.assign({}, event, { path, change }));
        }
      }
      events.sort((a, b) => (a.at || 0) - (b.at || 0));
      const open = new Map();
      const intervals = [];
      for (const event of events) {
        if (!event.path) continue;
        const at = event.at || event.change.createdAt || Date.now();
        if (event.type === 'claim') {
          const previous = open.get(event.path);
          if (previous !== undefined) {
            intervals[previous].end = at;
            intervals[previous].summary = 'superseded';
          }
          const index =
            intervals.push({
              path: event.path,
              agent: event.agent || event.change.agent,
              agentName: event.agentName || event.change.agentName,
              start: at,
              end: null,
              intent: event.intent || event.change.intent,
              sessionTitle: event.change.sessionTitle,
              sessionId: event.change.sessionId,
              changeId: event.change.id,
              auto: event.auto === true,
            }) - 1;
          open.set(event.path, index);
        } else {
          const index = open.get(event.path);
          if (index !== undefined) {
            intervals[index].end = at;
            intervals[index].summary = event.summary || '';
            open.delete(event.path);
          }
        }
      }
      const now = Date.now();
      for (const item of intervals) {
        item.active = item.end === null;
        if (item.active) item.end = now;
      }
      return intervals;
    }

    function GanttSection(props) {
      const [tip, setTip] = React.useState(null);
      const intervals = props.intervals;
      if (intervals.length === 0)
        return h('div', { className: 'pt-empty' }, L('还没有占用/释放记录', 'No claim/release events yet'));
      const now = Date.now();
      let axisStart = Math.min(...intervals.map((item) => item.start));
      let axisEnd = Math.max(...intervals.map((item) => item.end));
      if (!(axisEnd > axisStart)) axisEnd = axisStart + 60_000;
      if (axisEnd - axisStart < 60_000) axisEnd = axisStart + 60_000;
      const pad = Math.max(1000, (axisEnd - axisStart) * 0.04);
      axisStart -= pad;
      axisEnd += pad;
      const span = axisEnd - axisStart;
      const ticks = [0, 1, 2, 3, 4].map((index) => axisStart + (span * index) / 4);
      const paths = Array.from(new Set(intervals.map((item) => item.path)));
      const firstStart = new Map();
      for (const item of intervals)
        firstStart.set(item.path, Math.min(firstStart.get(item.path) || Infinity, item.start));
      paths.sort((a, b) => firstStart.get(a) - firstStart.get(b));
      const agents = Array.from(
        new Map(intervals.map((item) => [item.agentName, colorFor(item.agent || item.agentName)])).entries(),
      );
      const hasActive = intervals.some((item) => item.active);
      const nowLeft = ((now - axisStart) / span) * 100;
      const showTip = (event, item, path) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setTip({
          x: Math.min(Math.max(rect.left + rect.width / 2, 120), window.innerWidth - 120),
          y: rect.top - 6,
          path,
          actor: item.agentName,
          duration: fmtDuration(item.end - item.start),
          start: stamp(item.start),
          end: item.active ? L('现在', 'now') : stamp(item.end),
          active: item.active,
          note: [item.intent, item.summary].filter(Boolean).join(' · '),
        });
      };
      return h(
        'div',
        { className: 'pt-gantt' },
        h(
          'div',
          { className: 'pt-gantt-legend' },
          agents.map(([name, color]) =>
            h(
              'span',
              { className: 'pt-gantt-legend-item', key: name },
              h('span', { className: 'pt-gantt-legend-dot', style: { background: color } }),
              name,
            ),
          ),
        ),
        h(
          'div',
          { className: 'pt-gantt-head' },
          h('span', null, ''),
          h(
            'div',
            { className: 'pt-gantt-axis' },
            ticks.map((tick, index) =>
              h(
                'span',
                {
                  className: 'pt-gantt-tick',
                  key: index,
                  style: {
                    left: (index / 4) * 100 + '%',
                    transform: index === 0 ? 'translateX(0)' : index === 4 ? 'translateX(-100%)' : 'translateX(-50%)',
                  },
                },
                tickLabel(tick, span),
              ),
            ),
          ),
        ),
        paths.map((path) =>
          h(
            'div',
            { className: 'pt-gantt-row', key: path },
            h('div', { className: 'pt-gantt-path', title: path }, path),
            h(
              'div',
              { className: 'pt-gantt-lane' },
              ticks.map((tick, index) =>
                h('span', { className: 'pt-gantt-grid', key: index, style: { left: (index / 4) * 100 + '%' } }),
              ),
              hasActive ? h('span', { className: 'pt-gantt-now', style: { left: nowLeft + '%' } }) : null,
              intervals
                .filter((item) => item.path === path)
                .map((item, index) => {
                  const left = Math.max(0, ((item.start - axisStart) / span) * 100);
                  const width = Math.max(0.3, ((Math.min(item.end, axisEnd) - axisStart) / span) * 100 - left);
                  const title = [
                    path,
                    item.agentName + (item.active ? ' (still held)' : '') + ' · ' + fmtDuration(item.end - item.start),
                    'start ' + stamp(item.start),
                    'end ' + (item.active ? 'now' : stamp(item.end)),
                    'intent: ' + (item.intent || ''),
                    item.summary ? 'summary: ' + item.summary : '',
                  ]
                    .filter(Boolean)
                    .join('\n');
                  return h(
                    'div',
                    {
                      className: 'pt-gantt-bar' + (item.active ? ' active' : ''),
                      key: index,
                      role: 'img',
                      tabIndex: 0,
                      'aria-label': title.replace(/\n/g, ' · '),
                      onMouseEnter: (event) => showTip(event, item, path),
                      onFocus: (event) => showTip(event, item, path),
                      onMouseLeave: () => setTip(null),
                      onBlur: () => setTip(null),
                      style: {
                        left: left + '%',
                        width: width + '%',
                        background: colorFor(item.agent || item.agentName),
                      },
                    },
                    width < 10
                      ? null
                      : h(
                          'span',
                          { className: 'pt-gantt-bar-label' },
                          String(item.agentName || '')
                            .split(/[\s/]+/)
                            .filter(Boolean)
                            .pop() +
                            (item.active ? ' · held' : width >= 18 ? ' · ' + fmtDuration(item.end - item.start) : ''),
                        ),
                  );
                }),
            ),
          ),
        ),
        tip
          ? h(
              'div',
              { className: 'pt-tip', style: { left: tip.x, top: tip.y } },
              h('div', { className: 'pt-tip-title' }, tip.path),
              h('div', { className: 'pt-tip-line' }, tip.actor + ' · ' + tip.duration + (tip.active ? ' · held' : '')),
              h('div', { className: 'pt-tip-line' }, tip.start + ' → ' + tip.end),
              tip.note ? h('div', { className: 'pt-tip-note' }, tip.note) : null,
            )
          : null,
      );
    }

    // The rail preference is chrome, not board state: it lives in local storage
    // so a reload keeps the layout the human chose (ADR 17).
    const RAIL_KEY = 'dsh-god-view:rail';

    function readRailOpen() {
      try {
        return window.localStorage.getItem(RAIL_KEY) !== 'closed';
      } catch (_error) {
        return true;
      }
    }

    function saveRailOpen(open) {
      try {
        window.localStorage.setItem(RAIL_KEY, open ? 'open' : 'closed');
      } catch (_error) {
        // Storage can be unavailable; the rail still works for this render.
      }
    }

    function Panel() {
      useChinese();
      const { state, error, loading, selectProject, coordination, switching, setCoordinationMode } = useTeamState();
      const coordinationOn = Boolean(coordination && coordination.enabled);
      const projects = state && state.projects ? state.projects : [];
      const selectedRoot = state && state.selectedRoot ? state.selectedRoot : '';
      const sessions = (state && state.agents ? state.agents : []).filter(
        (agent) => !agent.stale && agent.status !== 'done',
      );
      const claims = state && state.claims ? state.claims : [];
      const changes = state && state.changes ? state.changes : [];
      const intervals = buildIntervals(changes);
      const workingSessions = sessions.filter((agent) => agent.status === 'active').length;
      const blockedSessions = sessions.filter((agent) => agent.status === 'blocked').length;
      const sessionSummary =
        sessions.length +
        L(' 会话', ' sessions') +
        (workingSessions ? ' · ' + workingSessions + L(' 进行中', ' working') : '') +
        (blockedSessions ? ' · ' + blockedSessions + L(' 受阻', ' blocked') : '');
      const boardRoot = state && state.root ? state.root : '';
      const currentProject = projects.find((project) => project.root === selectedRoot);
      const currentName = currentProject
        ? currentProject.name
        : boardRoot
          ? boardRoot.split('/').filter(Boolean).pop()
          : '';
      const activeProjects = projects.filter(isActiveProject);
      const blank = !activeProjects.some((project) => project.root === selectedRoot);
      const [railOpen, setRailOpenState] = React.useState(readRailOpen);
      const setRailOpen = (next) => {
        setRailOpenState(next);
        saveRailOpen(next);
      };

      // Two controls, both chrome: the global coordination switch and the rail
      // toggle. The rail itself holds no control, so collapsing it never hides
      // the switch (ADR 17).
      const railToggle = h(
        'button',
        {
          type: 'button',
          className: 'pt-iconbtn pt-rail-toggle',
          'aria-label': railOpen ? L('收起项目栏', 'Hide project rail') : L('展开项目栏', 'Show project rail'),
          title: railOpen ? L('收起项目栏', 'Hide project rail') : L('展开项目栏', 'Show project rail'),
          'aria-expanded': railOpen ? 'true' : 'false',
          'aria-controls': 'pt-rail',
          onClick: () => {
            const next = !railOpen;
            setRailOpen(next);
          },
        },
        h(Icon, { name: 'panel', size: 16 }),
      );
      const switchButton = h(
        'button',
        {
          className: 'pt-switch',
          role: 'switch',
          'aria-label': L('协作开关', 'Coordination switch'),
          'aria-checked': coordinationOn ? 'true' : 'false',
          'data-coordination': coordination.unavailable ? 'unavailable' : coordinationOn ? 'on' : 'off',
          title: coordination.unavailable
            ? L('宿主尚未加载协作开关，重启 DSH 后可用', 'The host has not loaded the coordination switch; restart DSH')
            : coordinationOn
              ? L(
                  '关闭协作：不记录文件占用，也不阻断并发写入',
                  'Turn coordination off: no leases are recorded and conflicting writes are not blocked',
                )
              : L(
                  '开启协作：记录文件占用，并在并发写入时阻断',
                  'Turn coordination on: record leases and block conflicting writes',
                ),
          onClick: () => setCoordinationMode(!coordinationOn),
          disabled: switching || Boolean(coordination.unavailable),
        },
        h('span', { className: 'pt-thumb', 'aria-hidden': 'true' }),
      );

      return h(
        'div',
        { className: 'pt-root' },
        railOpen
          ? h(
              'aside',
              { className: 'pt-side', id: 'pt-rail', 'aria-label': L('活跃项目', 'Active projects') },
              h(ProjectsSection, { projects: activeProjects, selectedRoot, onSelect: selectProject }),
            )
          : null,
        h(
          'main',
          { className: 'pt-main' },
          h(
            'header',
            { className: 'pt-topbar' },
            h(
              'div',
              { className: 'pt-topbar-title' },
              h(
                'h2',
                { className: 'pt-project-title', title: blank ? '' : currentName },
                blank ? L('没有活跃项目', 'No active projects') : currentName,
              ),
              blank
                ? null
                : h(
                    'p',
                    { className: 'pt-project-path', title: boardRoot },
                    boardRoot || L('尚未发现仓库', 'No repository discovered yet'),
                  ),
            ),
            h('div', { className: 'pt-topbar-actions' + (railOpen ? '' : ' pt-topbar-actions-offset') }, switchButton),
          ),
          h(
            'div',
            { className: 'pt-content' },
            error ? h('div', { className: 'pt-error' }, error) : null,
            loading && !state
              ? h('div', { className: 'pt-loading' }, L('正在打开上帝视角…', "Opening God's Eye..."))
              : null,
            state && blank
              ? h(
                  'div',
                  { className: 'pt-blank' },
                  h('span', { className: 'pt-blank-glyph' }, h(BrandGlyph, { size: 26 })),
                  h(
                    'p',
                    { className: 'pt-blank-text' },
                    coordinationOn
                      ? L(
                          '最近还没有活动。有会话在这里工作或占用文件后，项目会出现在右侧。',
                          'No recent activity yet. A project appears in the rail once a session works here or claims a file.',
                        )
                      : L(
                          '协作已关闭，所以这里还空着。打开顶栏的开关，右侧就会出现最近活跃或占用文件的项目。',
                          'Coordination is off, so the view is empty. Turn on the switch above and recently active or claimed projects appear in the rail.',
                        ),
                  ),
                )
              : null,
            state && !blank
              ? h(
                  'div',
                  null,
                  h(
                    'div',
                    { className: 'pt-card' },
                    h(
                      'div',
                      { className: 'pt-card-head' },
                      h(
                        'span',
                        { className: 'pt-card-title' },
                        h(Icon, { name: 'users', size: 12 }),
                        h('span', null, L('会话', 'Sessions')),
                      ),
                      h('span', { className: 'pt-card-count' }, sessionSummary),
                    ),
                    h(
                      'div',
                      { className: 'pt-card-body' },
                      sessions.length === 0
                        ? h('div', { className: 'pt-empty' }, L('当前没有会话。', 'No sessions.'))
                        : h(
                            'div',
                            { className: 'pt-list' },
                            sessions.map((agent) => h(SessionRow, { key: agent.id, agent })),
                          ),
                    ),
                  ),
                  h(
                    'div',
                    { className: 'pt-card' },
                    h(
                      'div',
                      { className: 'pt-card-head' },
                      h(
                        'span',
                        { className: 'pt-card-title' },
                        h(Icon, { name: 'chart', size: 12 }),
                        h('span', null, L('占用甘特图', 'Claim Gantt')),
                      ),
                      h('span', { className: 'pt-card-count' }, intervals.length + ' ' + L('段', 'intervals')),
                      h('span', { className: 'pt-card-note' }, L('悬停看精确时间', 'Hover a bar for exact times')),
                    ),
                    h('div', { className: 'pt-card-body' }, h(GanttSection, { intervals })),
                  ),
                )
              : null,
          ),
        ),
        railToggle,
      );
    }

    function apply(ctx) {
      // The sidebar label is fixed at registration, so a language change has to
      // register it again; the panel body re-renders through useChinese().
      let unregisterEntry = null;
      const mountEntry = () => {
        if (unregisterEntry) {
          unregisterEntry();
          unregisterEntry = null;
        }
        unregisterEntry = ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 30,
            label: L('上帝视角', "God's Eye"),
          },
          SidebarIcon,
        );
      };
      const syncLanguage = () => {
        const active = String(ctx.locale.getSnapshot().active || '').toLowerCase();
        setChinese(active.indexOf('zh') === 0);
        if (unregisterEntry) mountEntry();
      };
      ctx.effect(() => ctx.locale.subscribe(syncLanguage), 'dsh-god-view: locale');
      syncLanguage();
      ctx.effect(() => ensureStyle(), 'dsh-god-view: styles');
      ctx.effect(
        () =>
          ctx.slots.inject('sidebar.panellist', () => {
            mountEntry();
            return () => {
              if (unregisterEntry) {
                unregisterEntry();
                unregisterEntry = null;
              }
            };
          }),
        'dsh-god-view: sidebar-entry',
      );
      ctx.effect(
        () =>
          ctx.slots.inject('main', () =>
            ctx.slots.register(
              {
                name: 'main',
                key: PANEL_ID,
              },
              Panel,
            ),
          ),
        'dsh-god-view: main-panel',
      );
    }

    exports.apply = apply;
    exports.inject = ['slots', 'locale'];
    return module.exports;
  },
});
