/**
 * Pi tool-call guard.
 *
 * Pi's tool_call event runs before write/edit changes the file. It can return
 * { block: true, reason } to stop the call. Auto claims are created here, the
 * same way the DSH adapter guards its write/edit tools.
 */

export function installGuard(pi, getBoard) {
  pi.on('tool_call', async (event) => {
    if (!event || (event.toolName !== 'write' && event.toolName !== 'edit')) return undefined;
    const raw = event.input && event.input.path;
    if (typeof raw !== 'string' || raw.length === 0) return undefined;
    const board = getBoard();
    if (!board || !board.started) return undefined;
    const denial = board.checkWrite(raw, event.toolName);
    if (denial) return { block: true, reason: denial };
    return undefined;
  });
}
