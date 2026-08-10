/**
 * Bounded, dependency-free local smoke load check. Start the API separately,
 * then run `npm run qa:load`; this is not a capacity certification.
 */
const baseUrl = (process.env.SLICE_LOAD_BASE_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
const concurrency = Number.parseInt(process.env.SLICE_LOAD_CONCURRENCY ?? '4', 10);
const requestsPerEndpoint = Number.parseInt(process.env.SLICE_LOAD_REQUESTS ?? '20', 10);

if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) {
  throw new Error('SLICE_LOAD_CONCURRENCY must be an integer from 1 to 32.');
}
if (
  !Number.isInteger(requestsPerEndpoint) ||
  requestsPerEndpoint < 1 ||
  requestsPerEndpoint > 500
) {
  throw new Error('SLICE_LOAD_REQUESTS must be an integer from 1 to 500.');
}

const paths = ['/health', '/api/v1/market/assets?limit=1'];

async function main() {
  const results = await Promise.all(paths.map((path) => runEndpoint(path)));
  const failures = results.reduce((total, result) => total + result.failures, 0);
  console.log(JSON.stringify({ baseUrl, concurrency, requestsPerEndpoint, results }, null, 2));
  if (failures > 0) process.exitCode = 1;
}

async function runEndpoint(path: string) {
  const latencies: number[] = [];
  let failures = 0;
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, requestsPerEndpoint) }, async () => {
    while (true) {
      const index = next++;
      if (index >= requestsPerEndpoint) return;
      const startedAt = performance.now();
      try {
        const response = await fetch(`${baseUrl}${path}`, {
          headers: { 'x-request-id': crypto.randomUUID() },
        });
        if (!response.ok) failures += 1;
      } catch {
        failures += 1;
      } finally {
        latencies.push(performance.now() - startedAt);
      }
    }
  });
  await Promise.all(workers);
  latencies.sort((left, right) => left - right);
  return {
    path,
    requests: requestsPerEndpoint,
    failures,
    latencyMs: {
      min: round(latencies[0] ?? 0),
      p50: round(percentile(latencies, 0.5)),
      p95: round(percentile(latencies, 0.95)),
      max: round(latencies.at(-1) ?? 0),
    },
  };
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) return 0;
  return values[Math.min(values.length - 1, Math.ceil(values.length * percentileValue) - 1)];
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

void main();
