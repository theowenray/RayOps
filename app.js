const uiState = {
  monitors: [],
  events: [],
  settings: {
    webhookUrlConfigured: false
  },
  statusMessage: '',
  statusType: 'info',
  loading: true,
  browserNotifyEnabled: false
};

const previousMonitorStatus = new Map();

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function summarizeMonitors(monitors) {
  return monitors.reduce(
    (summary, monitor) => {
      summary.total += 1;
      summary[monitor.status] = (summary[monitor.status] || 0) + 1;
      return summary;
    },
    { total: 0, up: 0, down: 0, unknown: 0 }
  );
}

function formatTarget(monitor) {
  if (monitor.type === 'port' || (monitor.type === undefined && monitor.port)) {
    return `${monitor.host}:${monitor.port}`;
  }
  return monitor.host;
}

function formatDateTime(isoDate) {
  if (!isoDate) {
    return 'Never';
  }
  return new Date(isoDate).toLocaleString();
}

function formatMonitorType(type) {
  return type === 'port' ? 'TCP port' : 'ICMP ping';
}

function formatOfflineWindow(ms) {
  return `${Math.round(ms / 1000)}s`;
}

function notifyStatusChanges(monitors) {
  if (!uiState.browserNotifyEnabled || typeof Notification === 'undefined') {
    return;
  }
  if (Notification.permission !== 'granted') {
    return;
  }

  for (const monitor of monitors) {
    const previous = previousMonitorStatus.get(monitor.id);
    if (!previous) {
      previousMonitorStatus.set(monitor.id, monitor.status);
      continue;
    }

    if (previous !== monitor.status && (monitor.status === 'down' || monitor.status === 'up')) {
      const title = monitor.status === 'down' ? 'Monitor offline' : 'Monitor recovered';
      const body = `${monitor.name} (${formatTarget(monitor)}) is now ${monitor.status.toUpperCase()}`;
      new Notification(title, { body });
    }

    previousMonitorStatus.set(monitor.id, monitor.status);
  }
}

function updateStatus(message, type = 'info') {
  uiState.statusMessage = message;
  uiState.statusType = type;
}

async function callApi(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  if (!response.ok) {
    let payload;
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    const errorText =
      payload?.error || (Array.isArray(payload?.errors) ? payload.errors.join(', ') : 'Request failed');
    throw new Error(errorText);
  }

  if (response.status === 204) {
    return null;
  }
  return response.json();
}

function monitorsMarkup(monitors) {
  if (!monitors.length) {
    return '<p class="empty">No monitors yet. Add your first host or port to start uptime checks.</p>';
  }

  return monitors
    .map((monitor) => {
      const statusClass = monitor.status || 'unknown';
      const latencyText = monitor.lastLatencyMs === null ? '--' : `${monitor.lastLatencyMs} ms`;
      const errorText = monitor.lastError ? `<p class="error-text">${escapeHtml(monitor.lastError)}</p>` : '';
      return `
        <article class="monitor-card">
          <div class="monitor-head">
            <div>
              <h3>${escapeHtml(monitor.name)}</h3>
              <p class="muted">${escapeHtml(formatTarget(monitor))} • ${formatMonitorType(monitor.type)}</p>
            </div>
            <span class="badge ${statusClass}">${statusClass.toUpperCase()}</span>
          </div>
          <dl class="meta-grid">
            <div>
              <dt>Latency</dt>
              <dd>${latencyText}</dd>
            </div>
            <div>
              <dt>Last checked</dt>
              <dd>${escapeHtml(formatDateTime(monitor.lastCheckedAt))}</dd>
            </div>
            <div>
              <dt>Interval</dt>
              <dd>${Math.round(monitor.intervalMs / 1000)}s</dd>
            </div>
            <div>
              <dt>Offline after</dt>
              <dd>${formatOfflineWindow(monitor.offlineAfterMs)}</dd>
            </div>
          </dl>
          ${errorText}
          <div class="monitor-actions">
            <button data-delete-monitor="${monitor.id}" class="ghost danger">Delete</button>
          </div>
        </article>
      `;
    })
    .join('');
}

function eventsMarkup(events) {
  if (!events.length) {
    return '<p class="empty">No events yet.</p>';
  }

  return events
    .slice(0, 40)
    .map((event) => {
      return `
        <li class="event-item">
          <div>
            <span class="event-kind ${escapeHtml(event.kind)}">${escapeHtml(event.kind)}</span>
            <strong>${escapeHtml(event.monitorName)}</strong>
            <p>${escapeHtml(event.detail || `${event.monitorType} ${formatTarget(event)}`)}</p>
          </div>
          <time>${escapeHtml(formatDateTime(event.createdAt))}</time>
        </li>
      `;
    })
    .join('');
}

function render() {
  const app = document.querySelector('#app');
  const summary = summarizeMonitors(uiState.monitors);
  const statusClass = uiState.statusType || 'info';

  app.innerHTML = `
    <div class="shell">
      <header class="top">
        <div>
          <p class="kicker">Uptime monitoring</p>
          <h1>RayMonitor</h1>
          <p class="subtle">Monitor machines and home ports from Lightsail with offline threshold alerts.</p>
        </div>
        <div class="summary">
          <div><span>Total</span><strong>${summary.total}</strong></div>
          <div><span>Up</span><strong>${summary.up}</strong></div>
          <div><span>Down</span><strong>${summary.down}</strong></div>
          <div><span>Unknown</span><strong>${summary.unknown}</strong></div>
        </div>
      </header>

      <section class="panel">
        <h2>Add monitor</h2>
        <form id="monitor-form" class="form-grid">
          <label>Name<input required name="name" placeholder="Home NAS SSH" /></label>
          <label>Host / IP<input required name="host" placeholder="203.0.113.10" /></label>
          <label>
            Check type
            <select name="type" id="type-select">
              <option value="icmp">Machine ping (ICMP)</option>
              <option value="port">TCP port check</option>
            </select>
          </label>
          <label id="port-label" class="hidden">Port<input name="port" type="number" min="1" max="65535" placeholder="22" /></label>
          <label>Interval (seconds)<input name="intervalSeconds" type="number" min="3" value="15" /></label>
          <label>Timeout (ms)<input name="timeoutMs" type="number" min="500" value="4000" /></label>
          <label>Offline after (seconds)<input name="offlineAfterSeconds" type="number" min="3" value="30" /></label>
          <button type="submit">Create monitor</button>
        </form>
      </section>

      <section class="panel settings">
        <h2>Notifications</h2>
        <form id="webhook-form" class="settings-row">
          <input
            type="url"
            name="webhookUrl"
            value="${uiState.settings.webhookUrl ? escapeHtml(uiState.settings.webhookUrl) : ''}"
            placeholder="https://hooks.slack.com/services/..."
            aria-label="Webhook URL"
          />
          <button type="submit">Save webhook</button>
        </form>
        <div class="settings-row">
          <button id="browser-notify-button" class="ghost">${
            uiState.browserNotifyEnabled ? 'Browser alerts enabled' : 'Enable browser alerts'
          }</button>
          <span class="muted">${
            uiState.settings.webhookUrlConfigured
              ? 'Webhook configured for offline/recovered events'
              : 'No webhook configured'
          }</span>
        </div>
      </section>

      ${
        uiState.statusMessage
          ? `<p class="notice ${statusClass}" role="status">${escapeHtml(uiState.statusMessage)}</p>`
          : ''
      }

      <main class="layout">
        <section class="panel">
          <h2>Monitors</h2>
          <div class="monitor-list">${uiState.loading ? '<p class="empty">Loading monitors...</p>' : monitorsMarkup(uiState.monitors)}</div>
        </section>
        <aside class="panel">
          <h2>Event feed</h2>
          <ul class="events">${eventsMarkup(uiState.events)}</ul>
        </aside>
      </main>
    </div>
  `;

  const typeSelect = document.querySelector('#type-select');
  const portLabel = document.querySelector('#port-label');
  typeSelect.addEventListener('change', () => {
    portLabel.classList.toggle('hidden', typeSelect.value !== 'port');
  });
  portLabel.classList.toggle('hidden', typeSelect.value !== 'port');

  document.querySelector('#monitor-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = {
      name: formData.get('name'),
      host: formData.get('host'),
      type: formData.get('type'),
      port: formData.get('port'),
      intervalMs: Number(formData.get('intervalSeconds')) * 1000,
      timeoutMs: Number(formData.get('timeoutMs')),
      offlineAfterMs: Number(formData.get('offlineAfterSeconds')) * 1000
    };

    try {
      await callApi('/api/monitors', { method: 'POST', body: JSON.stringify(payload) });
      event.currentTarget.reset();
      updateStatus('Monitor created.', 'success');
      render();
      await syncState();
    } catch (error) {
      updateStatus(error.message || 'Could not create monitor.', 'error');
      render();
    }
  });

  document.querySelector('#webhook-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    try {
      await callApi('/api/settings/webhook', {
        method: 'POST',
        body: JSON.stringify({ webhookUrl: formData.get('webhookUrl') })
      });
      updateStatus('Webhook settings saved.', 'success');
      render();
      await syncState();
    } catch (error) {
      updateStatus(error.message || 'Could not save webhook.', 'error');
      render();
    }
  });

  document.querySelector('#browser-notify-button').addEventListener('click', async () => {
    if (typeof Notification === 'undefined') {
      updateStatus('Browser notifications are not supported here.', 'error');
      render();
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      uiState.browserNotifyEnabled = true;
      updateStatus('Browser notifications enabled.', 'success');
    } else {
      uiState.browserNotifyEnabled = false;
      updateStatus('Browser notification permission denied.', 'error');
    }
    render();
  });

  app.querySelectorAll('[data-delete-monitor]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.getAttribute('data-delete-monitor');
      try {
        await callApi(`/api/monitors/${id}`, { method: 'DELETE' });
        updateStatus('Monitor deleted.', 'success');
        render();
        await syncState();
      } catch (error) {
        updateStatus(error.message || 'Unable to delete monitor.', 'error');
        render();
      }
    });
  });
}

function applyStateFromServer(nextState) {
  uiState.monitors = Array.isArray(nextState.monitors) ? nextState.monitors : [];
  uiState.events = Array.isArray(nextState.events) ? nextState.events : [];
  uiState.settings = nextState.settings || uiState.settings;
  uiState.loading = false;
  notifyStatusChanges(uiState.monitors);
}

async function syncState() {
  const payload = await callApi('/api/state');
  applyStateFromServer(payload);
}

function connectEventStream() {
  const stream = new EventSource('/api/stream');
  stream.addEventListener('state', (event) => {
    try {
      const payload = JSON.parse(event.data);
      applyStateFromServer(payload);
      render();
    } catch {
      updateStatus('Unable to parse stream update.', 'error');
      render();
    }
  });
  stream.addEventListener('error', () => {
    updateStatus('Live stream disconnected, attempting reconnect...', 'error');
    render();
  });
  return stream;
}

async function bootstrap() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const mountPoint = document.querySelector('#app');
  if (!mountPoint) {
    return;
  }

  render();
  try {
    await syncState();
    uiState.stream = connectEventStream();
    render();
  } catch (error) {
    uiState.loading = false;
    updateStatus(error.message || 'Failed to load dashboard data.', 'error');
    render();
  }
}

bootstrap();

export { formatTarget, summarizeMonitors };
