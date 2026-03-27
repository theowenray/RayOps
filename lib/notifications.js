const MAX_EVENTS = 400;

function keepLatest(list, max) {
  if (list.length > max) {
    list.splice(max);
  }
}

async function sendWebhook(event, webhookUrl, events) {
  if (!webhookUrl) {
    return;
  }

  const payload = {
    text: `[${event.kind.toUpperCase()}] ${event.monitorName} (${event.host}${
      event.port ? `:${event.port}` : ''
    }) - ${event.detail}`,
    monitorId: event.monitorId,
    kind: event.kind,
    createdAt: event.createdAt
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`Webhook returned HTTP ${response.status}`);
    }
  } catch (error) {
    events.unshift({
      id: `${event.id}-webhook-error`,
      kind: 'notification_error',
      monitorId: event.monitorId,
      monitorName: event.monitorName,
      monitorType: event.monitorType,
      host: event.host,
      port: event.port,
      detail: error.message || 'Webhook send failed',
      createdAt: new Date().toISOString()
    });
    keepLatest(events, MAX_EVENTS);
  }
}

export function createNotificationCenter({ webhookUrl = '' } = {}) {
  const events = [];
  let currentWebhook = webhookUrl;

  async function onMonitorEvent(event) {
    events.unshift(event);
    keepLatest(events, MAX_EVENTS);

    if (event.kind === 'offline' || event.kind === 'recovered') {
      await sendWebhook(event, currentWebhook, events);
    }
  }

  return {
    onMonitorEvent,
    listEvents(limit = 80) {
      return events.slice(0, Math.max(1, limit));
    },
    getWebhookUrl() {
      return currentWebhook;
    },
    setWebhookUrl(nextWebhook) {
      currentWebhook = typeof nextWebhook === 'string' ? nextWebhook.trim() : '';
      return currentWebhook;
    }
  };
}
