import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import net from 'node:net';

const DEFAULT_INTERVAL_MS = 15_000;
const DEFAULT_TIMEOUT_MS = 4_000;
const DEFAULT_OFFLINE_AFTER_MS = 30_000;
const MAX_HISTORY = 120;

const monitorStore = [];
const pollers = new Map();
const listeners = new Set();

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function toInt(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return parsed;
}

function nowIso() {
  return new Date().toISOString();
}

function emit(event) {
  for (const listener of listeners) {
    Promise.resolve(listener(event)).catch(() => {});
  }
}

function checkTcpPort(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let settled = false;
    const socket = new net.Socket();

    function done(result) {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(result);
    }

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      const latencyMs = Date.now() - startedAt;
      done({ ok: true, latencyMs });
    });

    socket.once('timeout', () => {
      done({ ok: false, reason: `timeout after ${timeoutMs}ms` });
    });

    socket.once('error', (error) => {
      done({ ok: false, reason: error.message || 'socket error' });
    });

    socket.connect(port, host);
  });
}

function checkIcmpHost(host, timeoutMs) {
  return new Promise((resolve) => {
    const timeoutSeconds = Math.max(1, Math.round(timeoutMs / 1000));
    const args = ['-c', '1', '-W', String(timeoutSeconds), host];
    const startedAt = Date.now();
    const child = spawn('ping', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      resolve({ ok: false, reason: error.message || 'unable to start ping' });
    });

    child.on('close', (code) => {
      if (code === 0) {
        const latencyMatch = stdout.match(/time=([0-9.]+)\s*ms/i);
        const latencyMs = latencyMatch ? Math.round(Number(latencyMatch[1])) : Date.now() - startedAt;
        resolve({ ok: true, latencyMs });
        return;
      }

      const reason = stderr.trim() || 'host unreachable';
      resolve({ ok: false, reason });
    });
  });
}

function monitorStatus(monitor) {
  if (!monitor.lastCheckedAt) {
    return 'unknown';
  }

  if (monitor.isOffline) {
    return 'down';
  }

  return 'up';
}

function snapshotMonitor(monitor) {
  return {
    id: monitor.id,
    name: monitor.name,
    type: monitor.type,
    host: monitor.host,
    port: monitor.port,
    intervalMs: monitor.intervalMs,
    timeoutMs: monitor.timeoutMs,
    offlineAfterMs: monitor.offlineAfterMs,
    createdAt: monitor.createdAt,
    lastCheckedAt: monitor.lastCheckedAt,
    lastStatus: monitor.lastStatus,
    lastError: monitor.lastError,
    lastLatencyMs: monitor.lastLatencyMs,
    downSince: monitor.downSince,
    status: monitorStatus(monitor),
    history: monitor.history
  };
}

function createEvent(monitor, kind, detail = '') {
  return {
    id: randomUUID(),
    kind,
    monitorId: monitor.id,
    monitorName: monitor.name,
    monitorType: monitor.type,
    host: monitor.host,
    port: monitor.port,
    detail,
    createdAt: nowIso()
  };
}

async function runCheck(monitor) {
  if (monitor.inFlight) {
    return;
  }
  monitor.inFlight = true;

  try {
  const result =
    monitor.type === 'port'
      ? await checkTcpPort(monitor.host, monitor.port, monitor.timeoutMs)
      : await checkIcmpHost(monitor.host, monitor.timeoutMs);

  monitor.lastCheckedAt = nowIso();
  monitor.lastStatus = result.ok ? 'up' : 'down';
  monitor.lastError = result.ok ? '' : result.reason;
  monitor.lastLatencyMs = result.ok ? result.latencyMs : null;

  monitor.history.push({
    checkedAt: monitor.lastCheckedAt,
    status: monitor.lastStatus,
    latencyMs: monitor.lastLatencyMs,
    reason: monitor.lastError
  });
  if (monitor.history.length > MAX_HISTORY) {
    monitor.history.splice(0, monitor.history.length - MAX_HISTORY);
  }

  if (result.ok) {
    const wasOffline = monitor.isOffline;
    monitor.isOffline = false;
    monitor.firstFailureAt = null;
    monitor.downSince = null;
    if (wasOffline) {
      emit(createEvent(monitor, 'recovered', `Recovered with ${result.latencyMs}ms latency`));
    }
    return;
  }

  if (!monitor.firstFailureAt) {
    monitor.firstFailureAt = Date.now();
  }

  const failureDuration = Date.now() - monitor.firstFailureAt;
  if (!monitor.isOffline && failureDuration >= monitor.offlineAfterMs) {
    monitor.isOffline = true;
    monitor.downSince = nowIso();
    emit(createEvent(monitor, 'offline', monitor.lastError || 'Monitor appears offline'));
  }
  } finally {
    monitor.inFlight = false;
  }
}

function ensurePolling(monitor) {
  const existing = pollers.get(monitor.id);
  if (existing) {
    clearInterval(existing);
  }

  const timer = setInterval(() => {
    runCheck(monitor).catch((error) => {
      monitor.lastCheckedAt = nowIso();
      monitor.lastStatus = 'down';
      monitor.lastError = error.message || 'monitor check failed';
      monitor.lastLatencyMs = null;
    });
  }, monitor.intervalMs);

  pollers.set(monitor.id, timer);
  runCheck(monitor).catch(() => {});
}

function validatePayload(payload) {
  const errors = [];
  if (!isNonEmptyString(payload?.name)) {
    errors.push('name is required');
  }
  if (!isNonEmptyString(payload?.host)) {
    errors.push('host is required');
  }
  if (payload?.type !== 'icmp' && payload?.type !== 'port') {
    errors.push('type must be icmp or port');
  }
  if (payload?.type === 'port') {
    const port = toInt(payload.port, 0);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      errors.push('port must be between 1 and 65535');
    }
  }

  return errors;
}

function addMonitor(payload, options = {}) {
  const { emitEvent = true, startPolling = true } = options;
  const monitor = {
    id: isNonEmptyString(payload.id) ? payload.id.trim() : randomUUID(),
    name: payload.name.trim(),
    type: payload.type,
    host: payload.host.trim(),
    port: payload.type === 'port' ? toInt(payload.port, 0) : null,
    intervalMs: Math.max(3_000, toInt(payload.intervalMs, DEFAULT_INTERVAL_MS)),
    timeoutMs: Math.max(500, toInt(payload.timeoutMs, DEFAULT_TIMEOUT_MS)),
    offlineAfterMs: Math.max(3_000, toInt(payload.offlineAfterMs, DEFAULT_OFFLINE_AFTER_MS)),
    createdAt: nowIso(),
    lastCheckedAt: null,
    lastStatus: 'unknown',
    lastError: '',
    lastLatencyMs: null,
    isOffline: false,
    firstFailureAt: null,
    downSince: null,
    history: [],
    inFlight: false
  };

  monitorStore.unshift(monitor);
  if (startPolling) {
    ensurePolling(monitor);
  }
  if (emitEvent) {
    emit(createEvent(monitor, 'created', 'Monitor created'));
  }

  return monitor;
}

export function listMonitors() {
  return monitorStore.map(snapshotMonitor);
}

export function getMonitor(id) {
  const monitor = monitorStore.find((entry) => entry.id === id);
  return monitor ? snapshotMonitor(monitor) : null;
}

export function createMonitor(payload) {
  const errors = validatePayload(payload);
  if (errors.length) {
    return { ok: false, errors };
  }

  const monitor = addMonitor(payload, { emitEvent: true, startPolling: true });
  return { ok: true, monitor: snapshotMonitor(monitor) };
}

export function restoreMonitors(payloads = []) {
  for (const payload of payloads) {
    const validationErrors = validatePayload(payload);
    if (validationErrors.length) {
      continue;
    }
    addMonitor(payload, { emitEvent: false, startPolling: true });
  }
}

export function deleteMonitor(id) {
  const index = monitorStore.findIndex((entry) => entry.id === id);
  if (index < 0) {
    return false;
  }

  const [monitor] = monitorStore.splice(index, 1);
  const timer = pollers.get(id);
  if (timer) {
    clearInterval(timer);
    pollers.delete(id);
  }
  emit(createEvent(monitor, 'deleted', 'Monitor deleted'));
  return true;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function stopAllPolling() {
  for (const timer of pollers.values()) {
    clearInterval(timer);
  }
  pollers.clear();
}

export function resetMonitors() {
  stopAllPolling();
  monitorStore.splice(0, monitorStore.length);
  listeners.clear();
}
