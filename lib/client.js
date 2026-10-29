/**
 * dsh-parallel browser plugin (protocol v3).
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
  id: 'dsh-parallel',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    const React = require('react');
    const h = React.createElement;
    const PANEL_ID = 'dsh-parallel';
    const API = '/plugins/dsh-parallel/api';
    const STYLE_ID = 'dsh-parallel-style';

    const ZH = (() => {
      try {
        const lang = (document.documentElement.lang || navigator.language || '').toLowerCase();
        return lang.indexOf('zh') === 0;
      } catch (_error) {
        return false;
      }
    })();

    function L(zh, en) {
      return ZH ? zh : en;
    }

    const STATUS_LABEL = {
      active: L('进行中', 'active'),
      idle: L('空闲', 'idle'),
      blocked: L('受阻', 'blocked'),
      done: L('完成', 'done'),
    };

    const STATE_LABEL = {
      claimed: L('占用中', 'claimed'),
      done: L('已完成', 'done'),
      expired: L('已过期', 'expired'),
    };

    const CSS = [
      '.pt-root{--pt-fs-10:10px;--pt-fs-11:11px;--pt-fs-12:12px;--pt-fs-13:13px;--pt-fs-15:15px;--pt-fs-20:20px;--pt-gap-1:4px;--pt-gap-2:8px;--pt-gap-3:12px;--pt-gap-4:16px;--pt-gap-5:20px;--pt-radius-sm:6px;--pt-radius-md:10px;box-sizing:border-box;min-height:100%;height:100%;overflow:auto;display:flex;flex-direction:column;padding:24px 32px 24px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#111);font-family:var(--dsw-font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:var(--pt-fs-13);line-height:1.45}',
      '.pt-root *{box-sizing:border-box}',
      '.pt-wrap{width:100%;max-width:980px;margin:0 auto;flex:1;min-height:0;display:flex;flex-direction:column}',
      '.pt-head{display:flex;align-items:center;gap:var(--pt-gap-2);flex-wrap:wrap;margin-bottom:8px}',
      '.pt-title{font-size:var(--pt-fs-20);font-weight:650;letter-spacing:-.2px;line-height:1.2;margin:0}',
      '.pt-glyph{color:var(--dsw-alias-brand-primary,#4d6bfe);display:inline-flex;align-items:center}',
      '.pt-icon{flex:none;display:inline-block;vertical-align:-2px}',
      '.pt-live{display:inline-flex;align-items:center;gap:6px;font-size:var(--pt-fs-11);color:var(--dsw-alias-label-tertiary,#8a8f98)}',
      '.pt-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-success-primary,#22c55e)}',
      '.pt-actions{display:flex;gap:8px;margin-left:auto;align-items:center}',
      '.pt-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#111);border-radius:8px;padding:0 10px;font:inherit;font-size:var(--pt-fs-12);font-weight:500;cursor:pointer;white-space:nowrap}',
      '.pt-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}',
      '.pt-btn:focus-visible,.pt-project:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:2px}',
      '.pt-repo{font-size:12px;color:var(--dsw-alias-label-tertiary,#8a8f98);word-break:break-all;margin:2px 0 16px;display:flex;gap:8px;flex-wrap:wrap}',
      '.pt-repo code{font-family:var(--dsw-font-markdown-code-font-family,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;background:var(--dsw-alias-markdown-inline-code,rgba(127,127,127,.12));padding:1px 6px;border-radius:5px;color:var(--dsw-alias-label-secondary,#555)}',
      '.pt-summary{display:flex;gap:14px;flex-wrap:wrap;font-size:12.5px;color:var(--dsw-alias-label-secondary,#555);border-top:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-bottom:1px solid var(--dsw-alias-border-l2,#e5e7eb);padding:9px 0;margin-bottom:18px}',
      '.pt-summary b{color:var(--dsw-alias-label-primary,#111);font-weight:650}',
      '.pt-section{margin-bottom:18px}',
      '.pt-section-head{display:flex;align-items:center;gap:var(--pt-gap-2);margin-bottom:8px}',
      '.pt-section-title{display:inline-flex;align-items:center;gap:5px;font-size:var(--pt-fs-11);font-weight:650;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary,#8a8f98)}',
      '.pt-count{font-size:var(--pt-fs-10);color:var(--dsw-alias-label-tertiary,#8a8f98)}',
      '.pt-list{display:flex;flex-direction:column;gap:6px}',
      '.pt-row{display:flex;align-items:flex-start;gap:9px;min-width:0;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:var(--pt-radius-md);padding:10px 12px;background:var(--dsw-alias-bg-base,#fff)}',
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
      '.pt-meta{font-size:var(--pt-fs-10);color:var(--dsw-alias-label-tertiary,#8a8f98);display:flex;gap:6px;align-items:center;min-width:0;white-space:nowrap;overflow:hidden}',
      '.pt-badge{font-size:10.5px;background:var(--dsw-alias-state-warn-tertiary,rgba(245,158,11,.16));color:var(--dsw-alias-state-warn-primary,#b45309);border-radius:999px;padding:1px 7px;flex:none}',
      '.pt-change{border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:10px;padding:9px 12px;background:var(--dsw-alias-bg-base,#fff);display:flex;gap:9px;align-items:flex-start;flex-wrap:wrap}',
      '.pt-change.done{opacity:.68;background:var(--dsw-alias-bg-layer-1,#fafafa)}',
      '.pt-change-state{font-size:10.5px;font-weight:600;border-radius:5px;padding:1px 7px;flex:none;background:var(--dsw-alias-bg-layer-2,#f1f2f4);color:var(--dsw-alias-label-secondary,#555)}',
      '.pt-change-state.claimed{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#f59e0b) 14%,transparent);color:var(--dsw-alias-state-warn-primary,#b45309)}',
      '.pt-change-state.done{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#22c55e) 14%,transparent);color:var(--dsw-alias-state-success-primary,#15803d)}',
      '.pt-change-state.expired{background:color-mix(in srgb,var(--dsw-alias-label-error,#dc2626) 12%,transparent);color:var(--dsw-alias-label-error,#dc2626)}',
      '.pt-change-main{flex:1 1 360px;min-width:0;display:flex;flex-direction:column;gap:3px}',
      '.pt-change-intent{font-size:13px;color:var(--dsw-alias-label-primary,#111);word-break:break-word}',
      '.pt-change-meta{font-size:11px;color:var(--dsw-alias-label-tertiary,#8a8f98);display:flex;gap:8px;flex-wrap:wrap}',
      '.pt-path{font-family:var(--dsw-font-markdown-code-font-family,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;word-break:break-all;flex:1 1 240px;min-width:0}',
      '.pt-empty{border:1px dashed var(--dsw-alias-border-l3,#d1d5db);border-radius:10px;padding:18px 14px;text-align:center;color:var(--dsw-alias-label-tertiary,#8a8f98);font-size:12.5px}',
      '.pt-error{border:1px solid color-mix(in srgb,var(--dsw-alias-label-error,#dc2626) 35%,transparent);background:color-mix(in srgb,var(--dsw-alias-label-error,#dc2626) 7%,transparent);color:var(--dsw-alias-label-error,#b91c1c);border-radius:9px;padding:10px 12px;font-size:12.5px;margin-bottom:14px;word-break:break-word}',
      '.pt-loading{color:var(--dsw-alias-label-tertiary,#8a8f98);font-size:12.5px;padding:24px 0}',
      '.pt-section-note{font-size:var(--pt-fs-10);color:var(--dsw-alias-label-tertiary,#8a8f98);margin:-2px 0 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.pt-body{flex:1;min-height:0;display:flex;flex-direction:column}',
      '.pt-layout{flex:1;min-height:0;display:grid;grid-template-columns:220px minmax(0,1fr);gap:18px;align-items:stretch}',
      '.pt-side{position:sticky;top:0;display:flex;flex-direction:column;min-width:0;min-height:0;height:auto;max-height:none;align-self:stretch;border-right:1px solid var(--dsw-alias-border-l2,#e5e7eb);padding-right:14px}',
      '.pt-side-head{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:2px}',
      '.pt-side-title{display:inline-flex;align-items:center;gap:5px;font-size:var(--pt-fs-10);font-weight:650;letter-spacing:.04em;color:var(--dsw-alias-label-secondary,#555);text-transform:uppercase}',
      '.pt-side-count{font-size:var(--pt-fs-10);color:var(--dsw-alias-label-tertiary,#8a8f98)}',
      '.pt-projects{display:flex;flex-direction:column;gap:1px;flex:1;min-height:0;overflow:auto;padding-right:2px;scrollbar-gutter:stable;scrollbar-color:var(--dsw-alias-border-l3,#d1d5db) transparent}',
      '.pt-project-group{display:flex;align-items:baseline;justify-content:space-between;gap:6px;padding:7px 7px 2px;font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary,#8a8f98)}',
      '.pt-project{display:flex;align-items:center;gap:7px;width:100%;min-height:40px;text-align:left;font:inherit;line-height:1.2;cursor:pointer;border:1px solid transparent;border-radius:8px;padding:6px 8px;background:transparent;color:inherit;transition:background .15s ease,border-color .15s ease,box-shadow .15s ease}',
      '.pt-project:hover{background:var(--dsw-alias-bg-layer-2,#f1f2f4)}',
      '.pt-project.selected{background:var(--dsw-alias-bg-layer-2,#eef0f3);border-color:var(--dsw-alias-border-l3,#d1d5db)}',
      '.pt-project-dot{width:7px;height:7px;border-radius:50%;flex:none;background:var(--dsw-alias-label-dimmed,#9ca3af)}',
      '.pt-project-dot.active{background:var(--dsw-alias-state-success-primary,#22c55e);animation:pt-dot-pulse 2.4s ease-out infinite}',
      '.pt-project-dot.claimed{background:var(--dsw-alias-state-warn-primary,#f59e0b)}',
      '.pt-project-body{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}',
      '.pt-project-line{display:flex;align-items:center;gap:6px;min-width:0;line-height:16px}',
      '.pt-project-name{font-weight:600;font-size:var(--pt-fs-12);line-height:16px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.pt-project-meta{font-size:var(--pt-fs-10);line-height:12px;color:var(--dsw-alias-label-tertiary,#8a8f98);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.pt-project-seen{font-size:var(--pt-fs-10);line-height:16px;color:var(--dsw-alias-label-tertiary,#8a8f98);flex:none}',
      '.pt-main{min-width:0}',
      '.pt-side-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid var(--dsw-alias-border-l2,#e5e7eb);margin-top:8px;padding-top:10px;font-size:var(--pt-fs-10);color:var(--dsw-alias-label-secondary,#555);white-space:nowrap;overflow:hidden}',
      '.pt-stat{display:inline-flex;align-items:center;gap:3px;min-width:0}',
      '.pt-stat span:last-child{overflow:hidden;text-overflow:ellipsis}',
      '.pt-stat .pt-icon{color:var(--dsw-alias-label-tertiary,#8a8f98)}',
      '.pt-stat b{color:var(--dsw-alias-label-primary,#111);font-weight:650}',
      '.pt-side-foot > .pt-stat:last-child{text-align:right}',
      '.pt-current{display:flex;align-items:baseline;gap:8px;flex-wrap:nowrap;min-width:0;margin:0 0 16px;padding-bottom:10px;border-bottom:1px solid var(--dsw-alias-border-l2,#e5e7eb)}',
      '.pt-current-label{display:inline-flex;align-items:center;gap:4px;font-size:var(--pt-fs-10);text-transform:uppercase;letter-spacing:.04em;color:var(--dsw-alias-label-tertiary,#8a8f98);flex:none}',
      '.pt-current-name{font-size:var(--pt-fs-15);font-weight:650;color:var(--dsw-alias-label-primary,#111);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:45%}',
      '.pt-current-path{font-family:var(--dsw-font-markdown-code-font-family,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:var(--pt-fs-10);color:var(--dsw-alias-label-tertiary,#8a8f98);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '@media(max-width:760px){.pt-layout{grid-template-columns:1fr}.pt-side{position:static;display:block;height:auto;max-height:none;align-self:auto;border-right:0;padding-right:0;border-bottom:1px solid var(--dsw-alias-border-l2,#e5e7eb);padding-bottom:8px}.pt-projects{display:flex;flex-direction:row;max-height:150px;overflow-x:auto;gap:4px;flex:none}.pt-project{min-width:170px;flex:none}.pt-project.selected{box-shadow:none}}',
      '.pt-gantt{border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:10px;padding:10px 12px;background:var(--dsw-alias-bg-base,#fff)}',
      '.pt-gantt-legend{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px;font-size:11px;color:var(--dsw-alias-label-secondary,#555)}',
      '.pt-gantt-legend-item{display:inline-flex;align-items:center;gap:5px}',
      '.pt-gantt-legend-dot{width:8px;height:8px;border-radius:2px}',
      '.pt-gantt-head{display:grid;grid-template-columns:210px 1fr;gap:0 10px;align-items:end}',
      '.pt-gantt-axis{position:relative;height:17px}',
      '.pt-gantt-tick{position:absolute;transform:translateX(-50%);font-family:var(--dsw-font-markdown-code-font-family,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:9.5px;color:var(--dsw-alias-label-tertiary,#8a8f98);white-space:nowrap}',
      '.pt-gantt-row{display:grid;grid-template-columns:210px 1fr;gap:0 10px;align-items:center;min-height:30px;border-top:1px solid var(--dsw-alias-border-l1,#eef0f2)}',
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
      '.pt-details{margin-top:10px;font-size:12px;color:var(--dsw-alias-label-secondary,#555)}',
      '.pt-details summary{cursor:pointer;font-size:11.5px;color:var(--dsw-alias-label-tertiary,#8a8f98)}',
      '.pt-timeline{position:relative;padding-left:18px}',
      '.pt-timeline:before{content:"";position:absolute;left:5px;top:3px;bottom:3px;border-left:1px solid var(--dsw-alias-border-l2,#e5e7eb)}',
      '.pt-tl{position:relative;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;padding:5px 0;font-size:12px}',
      '.pt-tl:before{content:"";position:absolute;left:-16px;top:10px;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-dimmed,#9ca3af)}',
      '.pt-tl:has(.pt-tl-action.claim):before{background:var(--dsw-alias-state-warn-primary,#f59e0b)}',
      '.pt-tl:has(.pt-tl-action.release):before{background:var(--dsw-alias-state-success-primary,#22c55e)}',
      '.pt-tl:has(.pt-tl-action.expire):before{background:var(--dsw-alias-label-error,#dc2626)}',
      '.pt-tl-time{font-family:var(--dsw-font-markdown-code-font-family,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:10.5px;color:var(--dsw-alias-label-tertiary,#8a8f98);flex:none;min-width:112px}',
      '.pt-tl-action{font-size:10px;font-weight:600;border-radius:4px;padding:0 5px;flex:none;background:var(--dsw-alias-bg-layer-2,#f1f2f4);color:var(--dsw-alias-label-secondary,#555)}',
      '.pt-tl-action.claim{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#f59e0b) 14%,transparent);color:var(--dsw-alias-state-warn-primary,#b45309)}',
      '.pt-tl-action.release{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#22c55e) 14%,transparent);color:var(--dsw-alias-state-success-primary,#15803d)}',
      '.pt-tl-action.expire{background:color-mix(in srgb,var(--dsw-alias-label-error,#dc2626) 12%,transparent);color:var(--dsw-alias-label-error,#dc2626)}',
      '.pt-tl-actor{font-weight:600;color:var(--dsw-alias-label-secondary,#444);flex:none}',
      '.pt-tl-path{font-family:var(--dsw-font-markdown-code-font-family,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11px;color:var(--dsw-alias-label-primary,#111);word-break:break-all}',
      '.pt-tl-note{color:var(--dsw-alias-label-tertiary,#8a8f98);flex:1 1 220px;word-break:break-word}',
      '.pt-tl-session{font-size:10.5px;color:var(--dsw-alias-label-tertiary,#8a8f98);flex:none}',
      '.pt-readonly{font-size:11.5px;color:var(--dsw-alias-label-tertiary,#8a8f98);border-top:1px solid var(--dsw-alias-border-l1,#eef0f2);padding-top:12px;margin-top:8px}',
      '@keyframes pt-dot-pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--dsw-alias-state-success-primary,#22c55e) 45%,transparent)}70%{box-shadow:0 0 0 5px transparent}100%{box-shadow:0 0 0 0 transparent}}',
      '@media(prefers-reduced-motion:reduce){.pt-project-dot.active{animation:none}}',
      '@media(max-width:640px){.pt-root{padding:18px 16px 48px}.pt-focus{flex-basis:100%}}',
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

    function TeamGlyph(props) {
      const size = props && props.size ? props.size : 20;
      return h(
        'svg',
        {
          className: 'pt-glyph',
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        h('circle', { cx: 9, cy: 8, r: 3 }),
        h('path', { d: 'M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6' }),
        h('circle', { cx: 17.5, cy: 9, r: 2.2 }),
        h('path', { d: 'M15.7 14.7c2.3.2 4 1.7 4.6 4.1' }),
      );
    }

    function SidebarIcon(props) {
      return h(TeamGlyph, { size: props && props.size ? props.size : 18 });
    }

    function Icon(props) {
      const size = props.size || 14;
      let content = null;
      if (props.name === 'refresh') {
        content = [h('path', { key: 'a', d: 'M20 11a8 8 0 1 0-2.34 5.66' }), h('path', { key: 'b', d: 'M20 4v7h-7' })];
      } else if (props.name === 'grid') {
        content = [
          h('rect', { key: 'a', x: 3, y: 3, width: 7, height: 7, rx: 1.4 }),
          h('rect', { key: 'b', x: 14, y: 3, width: 7, height: 7, rx: 1.4 }),
          h('rect', { key: 'c', x: 3, y: 14, width: 7, height: 7, rx: 1.4 }),
          h('rect', { key: 'd', x: 14, y: 14, width: 7, height: 7, rx: 1.4 }),
        ];
      } else if (props.name === 'users') {
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
      } else if (props.name === 'folder') {
        content = h('path', { d: 'M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z' });
      } else if (props.name === 'file') {
        content = [
          h('path', { key: 'a', d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z' }),
          h('path', { key: 'b', d: 'M14 2v6h6' }),
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
      const requestId = React.useRef(0);
      const selectedRef = React.useRef('');

      const load = React.useCallback(async (quiet, wantedRoot) => {
        const id = ++requestId.current;
        if (!quiet) setLoading(true);
        try {
          const board = await request('/projects');
          if (id !== requestId.current) return;
          const projects = Array.isArray(board.projects) ? board.projects : [];
          let root = wantedRoot || selectedRef.current || board.currentRoot || (projects[0] && projects[0].root);
          if (!root) throw new Error(L('还没有项目看板', 'No project board yet'));
          selectedRef.current = root;
          const value = await request('/state?root=' + encodeURIComponent(root));
          if (id !== requestId.current) return;
          setState(Object.assign({}, value, { projects, selectedRoot: root }));
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

      return {
        state,
        error,
        loading,
        reload: () => load(false, selectedRef.current),
        selectProject: (root) => {
          selectedRef.current = root;
          load(false, root);
        },
      };
    }

    function projectStatus(project) {
      return project.status || (project.active > 0 ? 'active' : project.claims > 0 ? 'claimed' : 'idle');
    }

    function ProjectRow(props) {
      const project = props.project;
      const selected = props.selected;
      const status = projectStatus(project);
      const seen = project.lastActivityAt || project.lastSeenAt;
      const title = [project.root, project.lastSummary, status].filter(Boolean).join('\n');
      return h(
        'button',
        {
          className: 'pt-project' + (selected ? ' selected' : ''),
          onClick: () => props.onSelect(project.root),
          title,
          'aria-current': selected ? 'page' : undefined,
        },
        h('span', { className: 'pt-project-dot ' + status }),
        h(
          'span',
          { className: 'pt-project-body' },
          h(
            'span',
            { className: 'pt-project-line' },
            h('span', { className: 'pt-project-name' }, project.name),
            h('span', { className: 'pt-project-seen' }, seen ? ago(seen) : ''),
          ),
          h(
            'span',
            { className: 'pt-project-meta' },
            project.active +
              L(' 活跃 · ', ' active · ') +
              project.claims +
              L(' 占用 · ', ' claims · ') +
              project.changes +
              L(' 进行中', ' active'),
          ),
        ),
      );
    }

    function ProjectsSection(props) {
      if (props.projects.length === 0)
        return h('div', { className: 'pt-empty' }, L('还没有项目看板', 'No project boards yet'));
      const groups = [
        {
          key: 'active',
          label: L('活跃', 'Active'),
          items: props.projects.filter((project) => projectStatus(project) !== 'idle'),
        },
        {
          key: 'idle',
          label: L('空闲', 'Idle'),
          items: props.projects.filter((project) => projectStatus(project) === 'idle'),
        },
      ].filter((group) => group.items.length > 0);
      return h(
        'div',
        { className: 'pt-projects' },
        groups.map((group) =>
          h(
            React.Fragment,
            { key: group.key },
            h(
              'div',
              { className: 'pt-project-group' },
              h('span', null, group.label),
              h('span', null, String(group.items.length)),
            ),
            group.items.map((project) =>
              h(ProjectRow, {
                key: project.root,
                project,
                selected: project.root === props.selectedRoot,
                onSelect: props.onSelect,
              }),
            ),
          ),
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
            h('span', null, STATUS_LABEL[agent.stale ? 'idle' : agent.status] || agent.status),
            h('span', null, '·'),
            h('span', null, ago(agent.heartbeatAt)),
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
                  style: { left: (index / 4) * 100 + '%' },
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

    function TimelineSection(props) {
      const events = props.events;
      if (events.length === 0)
        return h('div', { className: 'pt-empty' }, L('还没有占用/释放记录', 'No claim/release events yet'));
      return h(
        'div',
        { className: 'pt-timeline' },
        events.slice(-60).map((event, index) => {
          const change = event.change;
          const active = change.state === 'claimed' && event.type === 'claim';
          const action =
            event.type === 'claim'
              ? L('占用', 'claimed')
              : event.type === 'release'
                ? L('释放', 'released')
                : L('过期', 'expired');
          const path = event.path || (event.paths || []).join(', ');
          const note = event.type === 'claim' ? event.intent || change.intent : event.summary || change.summary || '';
          return h(
            'div',
            { className: 'pt-tl', key: change.id + '-' + event.type + '-' + event.at + '-' + index },
            h('span', { className: 'pt-tl-time' }, stamp(event.at || change.updatedAt)),
            h('span', { className: 'pt-tl-action ' + event.type }, action),
            h('span', { className: 'pt-tl-actor' }, event.agentName || change.agentName),
            h('span', { className: 'pt-tl-path' }, path),
            h('span', { className: 'pt-tl-note' }, note),
            h(
              'span',
              { className: 'pt-tl-session' },
              change.sessionTitle || 'session ' + shortSession(change.sessionId),
            ),
            active ? h('span', { className: 'pt-badge' }, L('占用中', 'held')) : null,
          );
        }),
      );
    }

    function Panel() {
      const { state, error, loading, reload, selectProject } = useTeamState();
      const projects = state && state.projects ? state.projects : [];
      const selectedRoot = state && state.selectedRoot ? state.selectedRoot : '';
      const active = (state && state.agents ? state.agents : []).filter(
        (agent) => !agent.stale && agent.status !== 'done',
      );
      const claims = state && state.claims ? state.claims : [];
      const changes = state && state.changes ? state.changes : [];
      const intervals = buildIntervals(changes);
      const timeline = changes.flatMap((change) =>
        (change.timeline || []).map((event) => Object.assign({}, event, { change })),
      );
      timeline.sort((a, b) => (a.at || 0) - (b.at || 0));
      const stats = state && state.stats ? state.stats : { active: 0, claims: 0 };
      const currentProject = projects.find((project) => project.root === selectedRoot);
      const currentName = currentProject
        ? currentProject.name
        : state && state.root
          ? state.root.split('/').filter(Boolean).pop()
          : '';

      return h(
        'div',
        { className: 'pt-root' },
        h(
          'div',
          { className: 'pt-wrap' },
          h(
            'div',
            { className: 'pt-head' },
            h(TeamGlyph, { size: 24 }),
            h('h1', { className: 'pt-title' }, L('Agent 协作台', 'Agent Team')),
            h(
              'span',
              { className: 'pt-live' },
              h('span', { className: 'pt-dot' }),
              state ? L('实时', 'live') : L('连接中', 'connecting'),
            ),
            h(
              'div',
              { className: 'pt-actions' },
              h(
                'button',
                { className: 'pt-btn', onClick: reload },
                h(Icon, { name: 'refresh', size: 13 }),
                h('span', null, L('刷新', 'Refresh')),
              ),
            ),
          ),
          error ? h('div', { className: 'pt-error' }, error) : null,
          loading && !state
            ? h('div', { className: 'pt-loading' }, L('正在读取协作看板…', 'Reading the board...'))
            : null,
          state
            ? h(
                'div',
                { className: 'pt-body' },
                h(
                  'div',
                  { className: 'pt-layout' },
                  h(
                    'aside',
                    { className: 'pt-side' },
                    h(
                      'div',
                      { className: 'pt-side-head' },
                      h(
                        'span',
                        { className: 'pt-side-title' },
                        h(Icon, { name: 'grid', size: 12 }),
                        h('span', null, L('最近活跃项目', 'Recent projects')),
                      ),
                      h('span', { className: 'pt-side-count' }, projects.length + ' ' + L('个', 'projects')),
                    ),
                    h(ProjectsSection, { projects, selectedRoot, onSelect: selectProject }),
                    h(
                      'div',
                      { className: 'pt-side-foot' },
                      h(
                        'span',
                        { className: 'pt-stat' },
                        h(Icon, { name: 'users', size: 12 }),
                        h('b', null, String(stats.active)),
                        h('span', null, L(' 个活跃会话', ' active')),
                      ),
                      h(
                        'span',
                        { className: 'pt-stat' },
                        h(Icon, { name: 'file', size: 12 }),
                        h('b', null, String(claims.length)),
                        h('span', null, L(' 个文件占用', ' files')),
                      ),
                    ),
                  ),
                  h(
                    'div',
                    { className: 'pt-main' },
                    h(
                      'div',
                      { className: 'pt-current' },
                      h(
                        'span',
                        { className: 'pt-current-label' },
                        h(Icon, { name: 'folder', size: 12 }),
                        h('span', null, L('项目', 'Project')),
                      ),
                      h('span', { className: 'pt-current-name', title: currentName }, currentName),
                      h('span', { className: 'pt-current-path', title: state.root || '' }, state.root || ''),
                    ),
                    h(
                      'div',
                      { className: 'pt-section' },
                      h(
                        'div',
                        { className: 'pt-section-head' },
                        h(
                          'span',
                          { className: 'pt-section-title' },
                          h(Icon, { name: 'users', size: 12 }),
                          h('span', null, L('会话', 'Sessions')),
                        ),
                        h('span', { className: 'pt-count' }, active.length + ' ' + L('活跃', 'active')),
                      ),
                      active.length === 0
                        ? h('div', { className: 'pt-empty' }, L('当前没有活跃会话。', 'No active sessions.'))
                        : h(
                            'div',
                            { className: 'pt-list' },
                            active.map((agent) => h(SessionRow, { key: agent.id, agent })),
                          ),
                    ),
                    h(
                      'div',
                      { className: 'pt-section' },
                      h(
                        'div',
                        { className: 'pt-section-head' },
                        h(
                          'span',
                          { className: 'pt-section-title' },
                          h(Icon, { name: 'chart', size: 12 }),
                          h('span', null, L('占用甘特图', 'Claim Gantt')),
                        ),
                        h('span', { className: 'pt-count' }, intervals.length + ' ' + L('段', 'intervals')),
                      ),
                      h(
                        'div',
                        { className: 'pt-section-note' },
                        L(
                          '条从 claim 到 release；悬停或展开明细看精确时间。',
                          'Bars run from claim to release; hover or open details for exact times.',
                        ),
                      ),
                      h(GanttSection, { intervals }),
                      h(
                        'details',
                        { className: 'pt-details' },
                        h('summary', null, L('事件明细（精确时间）', 'Event details (exact times)')),
                        h(TimelineSection, { events: timeline }),
                      ),
                    ),
                    h(
                      'div',
                      { className: 'pt-readonly' },
                      L(
                        '只读看板：claim、reply、release 由 agent 自己完成。',
                        'Read-only: agents own claim, reply, and release.',
                      ),
                    ),
                  ),
                ),
              )
            : null,
        ),
      );
    }

    function apply(ctx) {
      ctx.effect(() => ensureStyle(), 'dsh-parallel: styles');
      ctx.effect(
        () =>
          ctx.slots.inject('sidebar.panellist', () =>
            ctx.slots.register(
              {
                name: 'sidebar.panellist',
                id: PANEL_ID,
                order: 30,
                label: L('协作台', 'Agents'),
              },
              SidebarIcon,
            ),
          ),
        'dsh-parallel: sidebar-entry',
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
        'dsh-parallel: main-panel',
      );
    }

    exports.apply = apply;
    exports.inject = ['slots'];
    return module.exports;
  },
});
