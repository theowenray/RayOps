export const metricCards = [
  { label: 'Services monitored', value: '24', delta: '+3 this week', trend: 'up' },
  { label: 'Critical alerts', value: '2', delta: '-1 vs yesterday', trend: 'down' },
  { label: 'Avg. response time', value: '182 ms', delta: '-14 ms', trend: 'down' },
  { label: 'SLA compliance', value: '99.94%', delta: '+0.08%', trend: 'up' }
];

export const services = [
  {
    name: 'API Gateway',
    owner: 'Platform',
    region: 'us-east-1',
    status: 'healthy',
    uptime: '99.99%',
    latencyMs: 118,
    errorRate: 0.03
  },
  {
    name: 'Scheduler',
    owner: 'Core Infra',
    region: 'us-west-2',
    status: 'warning',
    uptime: '99.72%',
    latencyMs: 244,
    errorRate: 0.62
  },
  {
    name: 'Worker Pool',
    owner: 'Realtime',
    region: 'eu-central-1',
    status: 'critical',
    uptime: '98.91%',
    latencyMs: 390,
    errorRate: 1.42
  },
  {
    name: 'Edge Sync',
    owner: 'Data Ops',
    region: 'ap-southeast-1',
    status: 'healthy',
    uptime: '99.96%',
    latencyMs: 167,
    errorRate: 0.05
  },
  {
    name: 'Auth Service',
    owner: 'Security',
    region: 'us-east-2',
    status: 'warning',
    uptime: '99.81%',
    latencyMs: 221,
    errorRate: 0.35
  }
];

export const alerts = [
  {
    id: 'ALT-209',
    title: 'Worker saturation above 90%',
    service: 'Worker Pool',
    severity: 'critical',
    startedAt: '5 min ago',
    detail: 'Queue depth is rising faster than autoscaling can drain it.'
  },
  {
    id: 'ALT-198',
    title: 'Scheduler retries trending upward',
    service: 'Scheduler',
    severity: 'warning',
    startedAt: '19 min ago',
    detail: 'Retry budget used 67% in the last 15-minute window.'
  },
  {
    id: 'ALT-194',
    title: 'Auth latency spike detected',
    service: 'Auth Service',
    severity: 'warning',
    startedAt: '42 min ago',
    detail: 'P95 response time exceeded 250 ms for 3 consecutive checks.'
  }
];

export const incidentTimeline = [
  {
    time: '08:35 UTC',
    title: 'Traffic spike begins',
    detail: 'Inbound requests rose 28% after a customer launch event.'
  },
  {
    time: '08:41 UTC',
    title: 'Autoscaling lag detected',
    detail: 'Worker Pool scaled slower than the request burst in eu-central-1.'
  },
  {
    time: '08:48 UTC',
    title: 'Mitigation launched',
    detail: 'Burst capacity policy enabled and stale jobs rebalanced.'
  },
  {
    time: '08:56 UTC',
    title: 'Recovery in progress',
    detail: 'Queue depth dropped 34%; on-call continues to monitor.'
  }
];
