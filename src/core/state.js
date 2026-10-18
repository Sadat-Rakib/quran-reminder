'use strict';

const fs = require('fs');
const paths = require('./paths');
const fsutil = require('./fsutil');

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RECENT = 300;

function emptyState() {
  return { version: 1, lastShown: null, recent: [], sessions: {} };
}

function sessionKey(sessionId) {
  if (!sessionId) return null;
  return String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
}

function localDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function readState(file = paths.stateFile()) {
  const result = fsutil.readJson(file);
  if (!result.ok || !result.data || typeof result.data !== 'object') return emptyState();
  const state = emptyState();
  if (result.data.lastShown && typeof result.data.lastShown.ref === 'string') {
    state.lastShown = result.data.lastShown;
  }
  if (Array.isArray(result.data.recent)) {
    state.recent = result.data.recent.filter((item) => item && typeof item.ref === 'string');
  }
  if (result.data.sessions && typeof result.data.sessions === 'object') {
    state.sessions = result.data.sessions;
  }
  return state;
}

function prune(state, now = new Date(), avoidDays = 3) {
  const cutoff = now.getTime() - Math.max(avoidDays, 7) * 24 * 60 * 60 * 1000;
  const sessionCutoff = now.getTime() - SESSION_TTL_MS;

  state.recent = state.recent
    .filter((item) => {
      const at = Date.parse(item.at);
      return Number.isFinite(at) && at >= cutoff;
    })
    .slice(-MAX_RECENT);

  for (const [key, value] of Object.entries(state.sessions)) {
    const at = value && Date.parse(value.lastAt);
    if (!Number.isFinite(at) || at < sessionCutoff) delete state.sessions[key];
  }
  return state;
}

function writeState(state, file = paths.stateFile()) {
  try {
    fsutil.writeJson(file, prune(state));
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Refs we would rather not show again soon: the current session's history
 * plus anything shown within `avoidDays`.
 */
function avoidRefs(state, sessionId, now = new Date(), avoidDays = 3) {
  const refs = new Set();
  const cutoff = now.getTime() - avoidDays * 24 * 60 * 60 * 1000;
  for (const item of state.recent) {
    const at = Date.parse(item.at);
    if (Number.isFinite(at) && at >= cutoff) refs.add(item.ref);
  }
  const key = sessionKey(sessionId);
  if (key && state.sessions[key] && Array.isArray(state.sessions[key].refs)) {
    for (const ref of state.sessions[key].refs) refs.add(ref);
  }
  return [...refs];
}

function record(state, { ref, sessionId, now = new Date() }) {
  state.lastShown = { ref, at: now.toISOString() };
  state.recent.push({ ref, at: now.toISOString() });
  const key = sessionKey(sessionId);
  if (key) {
    const session = state.sessions[key] || { refs: [], lastAt: null };
    if (!session.refs.includes(ref)) session.refs.push(ref);
    session.lastAt = now.toISOString();
    state.sessions[key] = session;
  }
  return state;
}

/**
 * Decide whether a reminder should be shown now.
 * @returns {{ show: boolean, reason: string }}
 */
function shouldShow(config, state, { sessionId, now = new Date() } = {}) {
  if (!config.enabled) return { show: false, reason: 'disabled' };

  const frequency = config.frequency || 'session';
  if (frequency === 'always') return { show: true, reason: 'always' };

  const key = sessionKey(sessionId);

  if (frequency === 'session') {
    if (!key) return { show: true, reason: 'no-session-id' };
    const session = state.sessions[key];
    if (session && session.lastAt) return { show: false, reason: 'already-shown-this-session' };
    return { show: true, reason: 'new-session' };
  }

  if (!state.lastShown || !state.lastShown.at) return { show: true, reason: 'never-shown' };
  const last = new Date(state.lastShown.at);
  if (Number.isNaN(last.getTime())) return { show: true, reason: 'invalid-timestamp' };

  if (frequency === 'daily') {
    if (localDate(last) === localDate(now)) return { show: false, reason: 'already-shown-today' };
    return { show: true, reason: 'new-day' };
  }

  if (frequency === 'hourly') {
    const sameHour =
      localDate(last) === localDate(now) && last.getHours() === now.getHours();
    if (sameHour) return { show: false, reason: 'already-shown-this-hour' };
    return { show: true, reason: 'new-hour' };
  }

  return { show: true, reason: 'unknown-frequency' };
}

module.exports = {
  emptyState,
  readState,
  writeState,
  prune,
  avoidRefs,
  record,
  shouldShow,
  sessionKey,
  localDate,
};
