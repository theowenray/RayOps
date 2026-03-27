import test from 'node:test';
import assert from 'node:assert/strict';

const noop = () => {};

global.EventSource = class EventSourceMock {
  addEventListener() {}
  close() {}
};

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

    return {
      addEventListener: noop,
      classList: { toggle: noop },
      value: '',
      reset: noop
    };
  }
};

global.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ monitors: [], events: [], settings: { webhookUrlConfigured: false, webhookUrl: '' } })
});

const module = await import('../app.js');
const { formatTarget, summarizeMonitors } = module;

test('formatTarget shows host for ICMP monitor', () => {
  assert.equal(formatTarget({ type: 'icmp', host: '192.168.1.10' }), '192.168.1.10');
});

test('formatTarget shows host:port for TCP monitor', () => {
  assert.equal(formatTarget({ type: 'port', host: '192.168.1.10', port: 22 }), '192.168.1.10:22');
});

test('summarizeMonitors counts monitor statuses', () => {
  assert.deepEqual(
    summarizeMonitors([
      { status: 'up' },
      { status: 'up' },
      { status: 'down' },
      { status: 'unknown' }
    ]),
    { total: 4, up: 2, down: 1, unknown: 1 }
  );
});
