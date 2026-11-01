/**
 * Pi session adapter over the generic godview store.
 *
 * Pi gives one coding-agent session a cwd and a session id. This module maps
 * that session to one board agent, keeps its heartbeat alive, and exposes the
 * small operations the three team tools and the TUI panel need.
 */
import os from 'node:os';
import path from 'node:path';
import * as S from 'godview';

export const HEARTBEAT_MS = 15_000;
export const TTL_MS = 60_000;
export const AUTO_CLAIM_TTL_MS = 10 * 60_000;
export const PANEL_REFRESH_MS = 2_500;

export function piAgentId(sessionId) {
  return 'pi-' + S.hash(String(sessionId || 'unknown')).slice(0, 10);
}

export function oneLine(value, max = 180) {
  const text = String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - 1)) + '…';
}

export function ago(value) {
  const ms = Math.max(0, Date.now() - Number(value || 0));
  if (ms < 1_000) return 'now';
  if (ms < 60_000) return Math.floor(ms / 1_000) + 's';
  if (ms < 3_600_000) return Math.floor(ms / 60_000) + 'm';
  return Math.floor(ms / 3_600_000) + 'h';
}

function sessionName(ctx, sessionId) {
  try {
    const name =
      ctx && ctx.sessionManager && ctx.sessionManager.getSessionName ? ctx.sessionManager.getSessionName() : undefined;
    if (name) return String(name).slice(0, 80);
  } catch {}
  const raw = String(sessionId || 'pi')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .slice(0, 24)
    .replace(/^-+|-+$/g, '');
  return 'pi-' + (raw || 'session');
}

function statusRank(status) {
  return { active: 0, blocked: 1, idle: 2, done: 3 }[status] ?? 9;
}

export class PiBoard {
  constructor(ctx, options = {}) {
    this.ctx = ctx;
    this.options = options;
    this.sessionId = String(
      (ctx && ctx.sessionManager && ctx.sessionManager.getSessionId && ctx.sessionManager.getSessionId()) || 'unknown',
    );
    this.cwd = path.resolve((ctx && ctx.cwd) || process.cwd());
    this.root = S.resolveRepoRoot(this.cwd, options.root);
    this.id = piAgentId(this.sessionId);
    this.sessionTitle = sessionName(ctx, this.sessionId);
    this.registryDir = options.registryDir || path.join(os.homedir(), S.STORE_DIR);
    this.heartbeatMs = Number(options.heartbeatMs) > 0 ? Number(options.heartbeatMs) : HEARTBEAT_MS;
    this.ttlMs = Number(options.ttlMs) > 0 ? Number(options.ttlMs) : TTL_MS;
    this.autoClaimTtlMs = Number(options.autoClaimTtlMs) > 0 ? Number(options.autoClaimTtlMs) : AUTO_CLAIM_TTL_MS;
    this.started = false;
    this.presence = null;
    this.heartbeatTimer = null;
    this.panelTimer = null;
    this.panelOn = false;
    this.panelCtx = null;
  }

  start() {
    if (this.started) this.stop('restart');
    S.ensureStore(this.root, { create: true });
    S.registerProject(this.registryDir, {
      root: this.root,
      name: path.basename(this.root),
      lastSeenAt: Date.now(),
    });
    this.presence = S.createAgent(this.root, {
      id: this.id,
      name: this.sessionTitle,
      role: 'pi',
      status: 'active',
      focus: 'starting',
      sessionId: this.sessionId,
      sessionTitle: this.sessionTitle,
      cwd: this.cwd,
      ttlMs: this.ttlMs,
    });
    this.started = true;
    this.heartbeatTimer = setInterval(() => this.heartbeat(), this.heartbeatMs);
    if (this.heartbeatTimer.unref) this.heartbeatTimer.unref();
    this.heartbeat();
    return this;
  }

  stop(reason = 'session end') {
    if (!this.started) {
      this.stopPanel();
      return;
    }
    this.started = false;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.stopPanel();
    try {
      const claims = S.listClaims(this.root).filter((claim) => claim.agent === this.id);
      if (claims.length > 0) {
        S.releasePaths(
          this.root,
          this.id,
          claims.map((claim) => claim.path),
          { summary: reason },
        );
      }
      S.updateAgent(this.root, this.id, {
        status: 'done',
        focus: 'finished',
        lastAction: reason,
      });
    } catch {}
  }

  heartbeat() {
    if (!this.started) return;
    try {
      S.heartbeat(this.root, this.id);
      S.expireClaims(this.root);
      this.presence = S.getAgent(this.root, this.id) || this.presence;
    } catch {}
  }

  update(patch = {}) {
    if (!this.started) return this.presence;
    try {
      this.presence = S.updateAgent(this.root, this.id, patch);
    } catch {}
    return this.presence;
  }

  touch(patch = {}) {
    return this.update({ ...patch });
  }

  setStatus(status, extra = {}) {
    if (!['active', 'idle', 'blocked', 'done'].includes(status)) return this.presence;
    return this.update({ ...extra, status });
  }

  setSessionTitle(name) {
    const title = String(name || '')
      .trim()
      .slice(0, 200);
    if (!title) return this.presence;
    this.sessionTitle = title;
    return this.update({ sessionTitle: title });
  }

  setFocusFromPrompt(text) {
    if (!this.started || !text) return;
    const current = this.presence || S.getAgent(this.root, this.id);
    if (!current) return;
    if (current.focus && current.focus !== 'starting') return;
    const first = String(text)
      .replace(/\s+/g, ' ')
      .split(/[。！？!?]\s*|\.\s+/)[0];
    const focus = oneLine(first || text, 160);
    if (focus) this.update({ focus, lastAction: 'prompt' });
  }

  agentStart() {
    return this.setStatus('active', { lastAction: 'agent start' });
  }

  agentSettled() {
    const current = this.presence || S.getAgent(this.root, this.id);
    if (current && current.status === 'blocked') {
      this.releaseAutoClaims('blocked');
      return;
    }
    this.setStatus('idle', { lastAction: 'idle' });
    this.releaseAutoClaims('idle');
  }

  releaseAutoClaims(summary = 'idle') {
    try {
      const claims = S.listClaims(this.root).filter((claim) => claim.agent === this.id && claim.auto === true);
      if (claims.length === 0) return;
      S.releasePaths(
        this.root,
        this.id,
        claims.map((claim) => claim.path),
        { summary },
      );
    } catch {}
  }

  releaseAll(summary = 'finished') {
    try {
      const claims = S.listClaims(this.root).filter((claim) => claim.agent === this.id);
      if (claims.length === 0) return;
      S.releasePaths(
        this.root,
        this.id,
        claims.map((claim) => claim.path),
        { summary },
      );
    } catch {}
  }

  repoRel(raw) {
    const absolute = path.isAbsolute(String(raw)) ? path.resolve(String(raw)) : path.resolve(this.cwd, String(raw));
    return S.normalizeRepoPath(this.root, absolute);
  }

  claim(paths, options = {}) {
    const rels = (paths || []).map((value) => this.repoRel(value));
    const focus = (this.presence && this.presence.focus) || 'claim';
    const result = S.claimPaths(this.root, this.id, rels, {
      mode: options.mode === 'review' ? 'review' : 'edit',
      auto: options.auto === true,
      ttlMs: options.ttlMs,
      intent: options.intent || options.reason || focus,
      reason: options.reason,
      sessionId: this.sessionId,
      sessionTitle: this.sessionTitle,
    });
    this.presence = S.getAgent(this.root, this.id) || this.presence;
    return result;
  }

  release(paths, summary = 'released') {
    const rels = (paths || []).map((value) => this.repoRel(value));
    const result = S.releasePaths(this.root, this.id, rels, { summary });
    this.presence = S.getAgent(this.root, this.id) || this.presence;
    return result;
  }

  checkWrite(raw, toolName = 'write') {
    if (!this.started) return undefined;
    let rel;
    try {
      rel = this.repoRel(raw);
    } catch {
      return undefined;
    }
    if (!rel) return undefined;
    let claim;
    try {
      claim = S.getClaim(this.root, rel);
    } catch {
      return undefined;
    }
    if (claim && claim.agent !== this.id) return this.claimDenial(claim, rel);
    if (!claim) {
      const focus = (this.presence && this.presence.focus) || 'auto ' + toolName;
      const result = this.claim([rel], {
        auto: true,
        ttlMs: this.autoClaimTtlMs,
        reason: 'auto claim for ' + toolName,
        intent: focus,
      });
      if (result.conflicts.length > 0) return this.claimDenial(result.conflicts[0], rel);
    }
    return undefined;
  }

  claimDenial(claim, rel) {
    const until = claim.expiresAt ? new Date(claim.expiresAt).toISOString() : 'soon';
    return (
      'File lease conflict: ' +
      rel +
      ' is claimed by ' +
      (claim.agentName || claim.agent) +
      ' (' +
      claim.mode +
      (claim.auto ? ', auto' : '') +
      ') until ' +
      until +
      '. Do not edit it concurrently; wait for the lease to be released or expired, or coordinate through team_claim and team_status.'
    );
  }

  statusText(updated) {
    const agent = updated || this.presence || {};
    const peers = S.listAgents(this.root, { includeStale: false })
      .filter((item) => item.id !== this.id && item.status !== 'done')
      .sort((a, b) => statusRank(a.status) - statusRank(b.status));
    const claims = S.listClaims(this.root).filter((claim) => claim.agent !== this.id);
    const lines = [
      'You are ' +
        (agent.name || 'unknown') +
        ' (' +
        this.id +
        ') in ' +
        this.root +
        ' - ' +
        (agent.status || 'idle') +
        (agent.focus ? ': ' + agent.focus : '') +
        '.',
      'Active peers: ' +
        (peers.length
          ? peers.map((item) => item.name + ' [' + item.status + '] ' + (item.focus || 'no focus')).join('; ')
          : 'none') +
        '.',
    ];
    if (claims.length > 0) {
      lines.push(
        'Files claimed by others: ' + claims.map((claim) => claim.path + ' (' + claim.agentName + ')').join(', '),
      );
    }
    return lines.join('\n');
  }

  rosterText(includeStale = false) {
    const agents = S.listAgents(this.root, { includeStale });
    const claims = S.listClaims(this.root);
    const lines = ['# Pi godview - ' + path.basename(this.root) + ' (' + this.root + ')'];
    lines.push(
      'Agents: ' +
        agents.length +
        ' total, ' +
        agents.filter((item) => !item.stale && item.status !== 'done').length +
        ' active-ish.',
    );
    for (const agent of agents) {
      const state = agent.stale ? 'stale' : agent.status;
      lines.push(
        '- ' +
          agent.name +
          ' [' +
          state +
          '] id=' +
          agent.id +
          ' - ' +
          oneLine(agent.focus || agent.lastAction || 'no focus', 220) +
          ' (seen ' +
          ago(agent.heartbeatAt) +
          ' ago' +
          (agent.branch ? ', branch ' + agent.branch : '') +
          ')',
      );
    }
    if (claims.length > 0) {
      lines.push('Claims:');
      for (const claim of claims) {
        lines.push(
          '- ' +
            claim.path +
            ' - ' +
            claim.agentName +
            ' (' +
            claim.mode +
            ', ' +
            Math.ceil((claim.remainingMs || 0) / 60_000) +
            'm left)',
        );
      }
    }
    const activeChanges = S.listChanges(this.root, { state: 'claimed', limit: 10 });
    if (activeChanges.length > 0) {
      lines.push('Active changes:');
      for (const change of activeChanges) {
        lines.push(
          '- [' +
            change.agentName +
            '] ' +
            oneLine(change.intent, 160) +
            ' - ' +
            change.paths.join(', ') +
            ' (session ' +
            String(change.sessionId || 'pi').slice(0, 8) +
            ')',
        );
      }
    }
    const recent = S.listChanges(this.root, { limit: 12 })
      .filter((change) => change.state !== 'claimed')
      .slice(0, 6);
    if (recent.length > 0) {
      lines.push('Recent changes:');
      for (const change of recent) {
        lines.push(
          '- [' +
            change.state +
            '] ' +
            change.agentName +
            ': ' +
            oneLine(change.intent, 140) +
            ' - ' +
            change.paths.join(', ') +
            (change.summary ? ' (' + change.summary + ')' : ''),
        );
      }
    }
    return lines.join('\n');
  }

  panelLines() {
    const snap = S.snapshot(this.root, { changeLimit: 12, create: false });
    const active = snap.agents.filter((agent) => !agent.stale && agent.status !== 'done');
    const claims = snap.claims;
    const changes = S.listChanges(this.root, { limit: 6 });
    const lines = [
      'godview · ' + path.basename(this.root) + ' · ' + active.length + ' active · ' + claims.length + ' claims',
    ];
    for (const agent of active.slice(0, 8)) {
      lines.push('● ' + oneLine(agent.name, 40) + ' [' + agent.status + '] ' + oneLine(agent.focus || 'no focus', 96));
    }
    if (active.length === 0 && claims.length === 0) lines.push('no active peers');
    for (const claim of claims.slice(0, 6)) {
      lines.push('◆ ' + oneLine(claim.path, 60) + ' → ' + oneLine(claim.agentName, 24));
    }
    for (const change of changes.slice(0, 3)) {
      lines.push('· [' + change.state + '] ' + oneLine(change.agentName, 24) + ': ' + oneLine(change.intent, 72));
    }
    return lines;
  }

  summaryLine() {
    try {
      const snap = S.snapshot(this.root, { create: false });
      const active = snap.agents.filter((agent) => !agent.stale && agent.status !== 'done').length;
      return 'GV ' + active + 'a/' + snap.claims.length + 'c';
    } catch {
      return 'GV';
    }
  }

  startPanel(ctx) {
    if (this.panelOn) return true;
    if (!ctx || !ctx.hasUI) {
      try {
        ctx.ui.notify('godview panel needs a TUI or RPC session', 'warning');
      } catch {}
      return false;
    }
    this.panelOn = true;
    this.panelCtx = ctx;
    const refresh = () => {
      if (!this.panelOn) return;
      try {
        ctx.ui.setWidget('godview', this.panelLines(), { placement: 'aboveEditor' });
        if (ctx.ui.setStatus) ctx.ui.setStatus('godview', this.summaryLine());
      } catch {}
    };
    refresh();
    this.panelTimer = setInterval(refresh, PANEL_REFRESH_MS);
    if (this.panelTimer.unref) this.panelTimer.unref();
    return true;
  }

  stopPanel() {
    this.panelOn = false;
    if (this.panelTimer) clearInterval(this.panelTimer);
    this.panelTimer = null;
    const ctx = this.panelCtx;
    this.panelCtx = null;
    try {
      ctx.ui.setWidget('godview', undefined);
      if (ctx.ui.setStatus) ctx.ui.setStatus('godview', undefined);
    } catch {}
  }

  togglePanel(ctx) {
    if (this.panelOn) {
      this.stopPanel();
      return false;
    }
    return this.startPanel(ctx);
  }
}
