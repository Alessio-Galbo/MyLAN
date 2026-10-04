/**
 * Client di signaling per lo scambio di buste di handshake < 4KB.
 */
const PRIMARY_RELAY = "https://ntfy.sh";

export async function postEnvelope(topic, sealed, relay = PRIMARY_RELAY) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${relay}/${topic}`, {
        method: "POST",
        body: sealed,
        headers: { "Content-Type": "text/plain" }
      });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      return res.ok;
    } catch {
      // Ignora errore momentaneo di rete
    }
  }
  return false;
}

export async function pollEnvelope(topic, timeoutMs = 180000, relay = PRIMARY_RELAY, since = "all", matcher = null) {
  const deadline = Date.now() + timeoutMs;
  const sinceQuery = since ? `&since=${since}` : "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${relay}/${topic}/json?poll=1${sinceQuery}`);
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      if (res.ok) {
        const text = await res.text();
        const lines = text.trim().split("\n");
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim();
          if (!line) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.message) {
              if (!matcher || (await matcher(parsed.message))) return parsed.message;
            }
          } catch {}
        }
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 2500));
  }
  return null;
}
