# RayMonitor

RayMonitor is the first working cut of the RayOps monitoring app. It ships as a dependency-free dashboard so the team can iterate on the product direction immediately, even in restricted environments.

## Features

- Fleet health hero with aggregate score, filtered latency, and acknowledged alert counts.
- Service status grid with health filters for healthy, warning, and critical systems.
- Active alert queue with acknowledgement toggles.
- Recovery timeline for incident coordination.
- Responsive glassmorphism-inspired layout for desktop and mobile.

## Getting started

```bash
npm test
npm run build
python3 -m http.server 4173
```

Then open `http://localhost:4173`.
