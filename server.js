import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import {
  createMonitor,
  deleteMonitor,
  getMonitor,
  listMonitors,
  restoreMonitors,
  subscribe
} from './lib/monitors.js';
import { createNotificationCenter } from './lib/notifications.js';

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number.parseInt(process.env.PORT || '4173', 10);
const STATIC_ROOT = process.cwd();
const DATA_DIR = join(STATIC_ROOT, '.raymonitor');
const DATA_FILE = join(DATA_DIR, 'state.json');

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const notificationCenter = createNotificationCenter({
  webhookUrl: process.env.ALERT_WEBHOOK_URL || ''
});

const sseClients = new Set();

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

let persistTimer = null;
function schedulePersist() {
  if (persistTimer) {
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(() => {
    persistState().catch(() => {});
  }, 500);
}

async function loadPersistedState() {
  try {
    const raw = await readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.monitors)) {
      restoreMonitors(parsed.monitors);
    }
    if (typeof parsed.webhookUrl === 'string') {
      notificationCenter.setWebhookUrl(parsed.webhookUrl);
    }
  } catch {
    // First run or invalid file, ignore and continue.
  }
}

async function persistState() {
  mkdirSync(DATA_DIR, { recursive: true });
  const payload = {
    monitors: listMonitors().map((monitor) => ({
      id: monitor.id,
      name: monitor.name,
      type: monitor.type,
      host: monitor.host,
      port: monitor.port,
      intervalMs: monitor.intervalMs,
      timeoutMs: monitor.timeoutMs,
      offlineAfterMs: monitor.offlineAfterMs
    })),
    webhookUrl: notificationCenter.getWebhookUrl()
  };
  await writeFile(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 1024 * 1024) {
        reject(new Error('Request body too large'));
      }
    });
    request.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON payload'));
      }
    });
    request.on('error', reject);
  });
}

function broadcast(type, payload) {
  const message = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    client.write(message);
  }
}

async function serveFile(requestPath, response) {
  const safePath = normalize(requestPath).replace(/^(\.\.[/\\])+/, '');
  const relativePath = safePath === '/' ? '/index.html' : safePath;
  const absolutePath = join(STATIC_ROOT, relativePath);
  const extension = extname(absolutePath);
  if (!existsSync(absolutePath)) {
    sendJson(response, 404, { error: 'Not found' });
    return;
  }

  response.writeHead(200, {
    'Content-Type': contentTypes[extension] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  createReadStream(absolutePath).pipe(response);
}

function appStatePayload() {
  return {
    monitors: listMonitors(),
    events: notificationCenter.listEvents(100),
    settings: {
      webhookUrlConfigured: Boolean(notificationCenter.getWebhookUrl()),
      webhookUrl: notificationCenter.getWebhookUrl()
    }
  };
}

subscribe(async (event) => {
  await notificationCenter.onMonitorEvent(event);
  schedulePersist();
  broadcast('state', appStatePayload());
});

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const { pathname } = requestUrl;

  if (request.method === 'GET' && pathname === '/api/state') {
    sendJson(response, 200, appStatePayload());
    return;
  }

  if (request.method === 'POST' && pathname === '/api/monitors') {
    try {
      const payload = await readBody(request);
      const created = createMonitor(payload);
      if (!created.ok) {
        sendJson(response, 422, { errors: created.errors });
        return;
      }
      schedulePersist();
      sendJson(response, 201, { monitor: created.monitor });
    } catch (error) {
      sendJson(response, 400, { error: error.message || 'Invalid request' });
    }
    return;
  }

  if (request.method === 'DELETE' && pathname.startsWith('/api/monitors/')) {
    const id = pathname.split('/').at(-1);
    const monitor = getMonitor(id);
    if (!monitor) {
      sendJson(response, 404, { error: 'Monitor not found' });
      return;
    }
    deleteMonitor(id);
    schedulePersist();
    sendJson(response, 204, {});
    return;
  }

  if (request.method === 'POST' && pathname === '/api/settings/webhook') {
    try {
      const body = await readBody(request);
      const webhook = notificationCenter.setWebhookUrl(body.webhookUrl);
      schedulePersist();
      broadcast('state', appStatePayload());
      sendJson(response, 200, { webhookUrlConfigured: Boolean(webhook) });
    } catch (error) {
      sendJson(response, 400, { error: error.message || 'Could not update webhook' });
    }
    return;
  }

  if (request.method === 'GET' && pathname === '/api/stream') {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    });
    response.write(`event: state\ndata: ${JSON.stringify(appStatePayload())}\n\n`);
    sseClients.add(response);

    request.on('close', () => {
      sseClients.delete(response);
    });
    return;
  }

  if (request.method === 'GET' && pathname === '/healthz') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  if (request.method === 'GET' && pathname === '/README.md') {
    const markdown = await readFile(join(STATIC_ROOT, 'README.md'), 'utf8');
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(markdown);
    return;
  }

  if (request.method === 'GET') {
    await serveFile(pathname, response);
    return;
  }

  sendJson(response, 405, { error: 'Method not allowed' });
});
loadPersistedState()
  .then(() => {
    server.listen(PORT, HOST, () => {
      console.log(`RayMonitor uptime app running at http://${HOST}:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Unable to initialize persisted state:', error);
    process.exit(1);
  });
