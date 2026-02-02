const requests = new Map<string, number[]>();

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 15;

export function rateLimit(ip: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const timestamps = requests.get(ip) ?? [];

  // Remove timestamps outside the window
  const recent = timestamps.filter((t) => now - t < WINDOW_MS);

  if (recent.length >= MAX_REQUESTS) {
    const oldest = recent[0];
    const retryAfterSeconds = Math.ceil((oldest + WINDOW_MS - now) / 1000);
    requests.set(ip, recent);
    return { allowed: false, retryAfterSeconds };
  }

  recent.push(now);
  requests.set(ip, recent);

  // Periodically clean up old IPs (every 100th call)
  if (Math.random() < 0.01) {
    for (const [key, ts] of requests.entries()) {
      if (ts.every((t) => now - t >= WINDOW_MS)) {
        requests.delete(key);
      }
    }
  }

  return { allowed: true };
}
