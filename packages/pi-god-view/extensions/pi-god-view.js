/**
 * pi-god-view: a native TUI adapter for the godview parallel-agent board.
 *
 * It keeps the generic godview store as the source of truth and only adapts
 * Pi's session lifecycle, tools, tool-call guard, and TUI widget.
 */
import { installGuard } from '../lib/guard.js';
import { PiBoard } from '../lib/session.js';
import { createTools } from '../lib/tools.js';

export default function piGodView(pi) {
  let board = null;

  const getBoard = (ctx) => {
    if (board) return board;
    if (!ctx) return null;
    board = new PiBoard(ctx);
    board.start();
    return board;
  };

  for (const tool of createTools(getBoard)) pi.registerTool(tool);
  installGuard(pi, () => board);

  pi.on('session_start', (_event, ctx) => {
    if (board) board.stop('restart');
    board = new PiBoard(ctx);
    board.start();
  });

  pi.on('session_shutdown', () => {
    if (board) board.stop('session shutdown');
    board = null;
  });

  pi.on('session_info_changed', (event) => {
    if (!board) return;
    board.setSessionTitle(event && (event.name || event.title));
  });

  pi.on('input', (event) => {
    if (!board || !event || event.source === 'extension') return undefined;
    board.touch({ lastAction: 'prompt' });
    board.setFocusFromPrompt(event.text);
    return undefined;
  });

  pi.on('before_agent_start', (event) => {
    if (!board) return undefined;
    board.touch({ lastAction: 'prompt' });
    if (event && event.messageType === 'user') board.setFocusFromPrompt(event.prompt);
    return undefined;
  });

  pi.on('agent_start', () => {
    if (board) board.agentStart();
  });

  pi.on('agent_settled', () => {
    if (board) board.agentSettled();
  });

  pi.registerCommand('godview', {
    description: 'Toggle the godview TUI panel (on, off, or status)',
    handler: async (args, ctx) => {
      const current = board || getBoard(ctx);
      if (!current) {
        try {
          ctx.ui.notify('godview is not active in this session', 'warning');
        } catch {}
        return;
      }
      const mode = String(args || '')
        .trim()
        .toLowerCase();
      if (mode === 'status') {
        const status = current.presence ? current.presence.status : 'unknown';
        const focus = current.presence && current.presence.focus ? ': ' + current.presence.focus : '';
        ctx.ui.notify('godview ' + status + ' - ' + current.summaryLine() + focus, 'info');
        return;
      }
      if (mode === 'off') {
        current.stopPanel();
        ctx.ui.notify('godview panel off', 'info');
        return;
      }
      if (mode === 'on') {
        if (!current.startPanel(ctx)) {
          ctx.ui.notify('godview panel needs a TUI or RPC session', 'warning');
        }
        return;
      }
      if (current.panelOn) {
        current.stopPanel();
        ctx.ui.notify('godview panel off', 'info');
        return;
      }
      if (!current.startPanel(ctx)) {
        ctx.ui.notify('godview panel needs a TUI or RPC session', 'warning');
      }
    },
  });
}
