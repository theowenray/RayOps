import test from 'node:test';
import assert from 'node:assert/strict';

global.document = {
  querySelector(selector) {
    if (selector === '#app') {
      return {
        innerHTML: '',
        querySelectorAll() {
          return [];
        }
      };
    }
    return null;
  }
};

const module = await import('../app.js');
const { alertSummary, averageLatency, serviceHealthScore, state } = module;
const { alerts, services } = await import('../data.js');

test('averageLatency computes the rounded latency for filtered services', () => {
  assert.equal(averageLatency(services.slice(0, 2)), 181);
});

test('alertSummary counts warning and critical alerts', () => {
  assert.deepEqual(alertSummary(alerts), {
    healthy: 0,
    warning: 2,
    critical: 1
  });
});

test('serviceHealthScore responds to the current filter set', () => {
  state.filter = 'critical';
  const criticalServices = services.filter((service) => service.status === 'critical');
  assert.equal(serviceHealthScore(criticalServices), 36);
  state.filter = 'all';
});
