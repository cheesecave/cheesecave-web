// Run code as if the browser were in a given time zone (Node re-reads TZ when process.env.TZ is assigned).
export function inZone(zone, fn) {
  const before = process.env.TZ;
  process.env.TZ = zone;
  try {
    return fn();
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
}

export async function inZoneAsync(zone, fn) {
  const before = process.env.TZ;
  process.env.TZ = zone;
  try {
    return await fn();
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
}
