import { alerts, incidentTimeline, metricCards, services } from './data.js';

const filterOptions = [
  { label: 'All services', value: 'all' },
  { label: 'Healthy', value: 'healthy' },
  { label: 'Warning', value: 'warning' },
  { label: 'Critical', value: 'critical' }
];

const healthScoreByStatus = {
  healthy: 100,
  warning: 72,
  critical: 36
};

const state = {
  filter: 'all',
  acknowledgedAlerts: new Set()
};

function averageLatency(data) {
  return Math.round(data.reduce((sum, service) => sum + service.latencyMs, 0) / data.length);
}

function alertSummary(data) {
  return data.reduce(
    (summary, alert) => {
      summary[alert.severity] += 1;
      return summary;
    },
    { healthy: 0, warning: 0, critical: 0 }
  );
}

function statusBadge(status) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return `<span class="status-badge ${status}">${label}</span>`;
}

function getFilteredServices() {
  if (state.filter === 'all') {
    return services;
  }

  return services.filter((service) => service.status === state.filter);
}

function serviceHealthScore(filteredServices) {
  if (!filteredServices.length) {
    return 0;
  }

  const total = filteredServices.reduce((sum, service) => sum + healthScoreByStatus[service.status], 0);
  return Math.round(total / filteredServices.length);
}

function render() {
  const app = document.querySelector('#app');
  const filteredServices = getFilteredServices();
  const summary = alertSummary(alerts);
  const healthScore = serviceHealthScore(filteredServices);
  const latency = filteredServices.length ? averageLatency(filteredServices) : 0;

  app.innerHTML = `
    <div class="app-shell">
      <header class="hero">
        <div>
          <p class="eyebrow">Observability workspace</p>
          <h1>RayMonitor</h1>
          <p class="hero-copy">
            A focused control room for service health, active incidents, and recovery progress across the RayOps fleet.
          </p>
        </div>
        <div class="hero-panel">
          <div>
            <span>Fleet health score</span>
            <strong>${healthScore}/100</strong>
          </div>
          <div>
            <span>Filtered latency</span>
            <strong>${latency} ms</strong>
          </div>
          <div>
            <span>Acknowledged alerts</span>
            <strong>${state.acknowledgedAlerts.size}</strong>
          </div>
        </div>
      </header>

      <section class="metric-grid" aria-label="Summary metrics">
        ${metricCards
          .map(
            (card) => `
              <article class="metric-card">
                <span>${card.label}</span>
                <strong>${card.value}</strong>
                <p class="trend ${card.trend}">${card.delta}</p>
              </article>
            `
          )
          .join('')}
      </section>

      <main class="dashboard-grid">
        <section class="panel services-panel">
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">Service inventory</p>
              <h2>Live service health</h2>
            </div>
            <div class="filter-group" role="tablist" aria-label="Filter services by status">
              ${filterOptions
                .map(
                  (option) => `
                    <button class="filter-chip ${state.filter === option.value ? 'active' : ''}" data-filter="${option.value}">
                      ${option.label}
                    </button>
                  `
                )
                .join('')}
            </div>
          </div>

          <div class="service-table" role="table" aria-label="Service table">
            <div class="table-row table-head" role="row">
              <span>Service</span>
              <span>Owner</span>
              <span>Region</span>
              <span>Status</span>
              <span>Latency</span>
              <span>Error rate</span>
            </div>
            ${
              filteredServices.length
                ? filteredServices
                    .map(
                      (service) => `
                        <div class="table-row" role="row">
                          <strong>${service.name}</strong>
                          <span>${service.owner}</span>
                          <span>${service.region}</span>
                          ${statusBadge(service.status)}
                          <span>${service.latencyMs} ms</span>
                          <span>${service.errorRate.toFixed(2)}%</span>
                        </div>
                      `
                    )
                    .join('')
                : '<p class="empty-state">No services match the selected status.</p>'
            }
          </div>
        </section>

        <aside class="sidebar-stack">
          <section class="panel alert-panel">
            <div class="panel-heading">
              <div>
                <p class="panel-kicker">Incident queue</p>
                <h2>Active alerts</h2>
              </div>
              <div class="alert-summary">
                <span>${summary.critical} critical</span>
                <span>${summary.warning} warning</span>
              </div>
            </div>
            <div class="alert-list">
              ${alerts
                .map((alert) => {
                  const acknowledged = state.acknowledgedAlerts.has(alert.id);
                  return `
                    <article class="alert-card ${acknowledged ? 'acknowledged' : ''}">
                      <div class="alert-topline">
                        ${statusBadge(alert.severity)}
                        <span>${alert.startedAt}</span>
                      </div>
                      <h3>${alert.title}</h3>
                      <p>${alert.detail}</p>
                      <div class="alert-footer">
                        <span>${alert.service}</span>
                        <button data-alert-id="${alert.id}">
                          ${acknowledged ? 'Undo acknowledgement' : 'Acknowledge'}
                        </button>
                      </div>
                    </article>
                  `;
                })
                .join('')}
            </div>
          </section>

          <section class="panel timeline-panel">
            <div class="panel-heading">
              <div>
                <p class="panel-kicker">Runbook snapshot</p>
                <h2>Recovery timeline</h2>
              </div>
            </div>
            <ol class="timeline-list">
              ${incidentTimeline
                .map(
                  (event) => `
                    <li>
                      <span>${event.time}</span>
                      <div>
                        <strong>${event.title}</strong>
                        <p>${event.detail}</p>
                      </div>
                    </li>
                  `
                )
                .join('')}
            </ol>
          </section>
        </aside>
      </main>
    </div>
  `;

  app.querySelectorAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      state.filter = button.getAttribute('data-filter');
      render();
    });
  });

  app.querySelectorAll('[data-alert-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const alertId = button.getAttribute('data-alert-id');
      if (state.acknowledgedAlerts.has(alertId)) {
        state.acknowledgedAlerts.delete(alertId);
      } else {
        state.acknowledgedAlerts.add(alertId);
      }
      render();
    });
  });
}

render();

export { alertSummary, averageLatency, getFilteredServices, healthScoreByStatus, serviceHealthScore, state };
