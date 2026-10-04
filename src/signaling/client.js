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

// Lettura in streaming (GET <topic>/json, connessione aperta): la risposta dell'host arriva appena pubblicata. Prima si
// interrogava ogni 2,5 s (poll=1): in media +1,25 s e fino a +2,5 s su ogni collegamento e riconnessione.
export async function pollEnvelope(topic, timeoutMs = 180000, relay = PRIMARY_RELAY, since = "all", matcher = null) {
  const deadline = Date.now() + timeoutMs;
  const sinceQuery = since ? `?since=${since}` : "";
  while (Date.now() < deadline) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.max(0, deadline - Date.now()));
    let pause = 1000;
    try {
      const res = await fetch(`${relay}/${topic}/json${sinceQuery}`, { signal: ctrl.signal });
      if (res.status === 429) pause = 5000;
      else if (res.ok && res.body) {
        const found = await readStream(res.body.getReader(), matcher);
        if (found) return found;
      }
    } catch {
      // Rete momentaneamente assente o tempo scaduto
    } finally {
      clearTimeout(timer);
      ctrl.abort();
    }
    if (Date.now() < deadline) await new Promise((r) => setTimeout(r, pause));
  }
  return null;
}

// Righe JSON di ntfy (una per evento); anche l'ultima senza "a capo" finale quando il server chiude la connessione.
async function readStream(reader, matcher) {
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    buf += done ? "\n" : dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      let msg = null;
      try { msg = JSON.parse(line).message; } catch {}
      if (msg && (!matcher || (await matcher(msg)))) return msg;
    }
    if (done) return null;
  }
}
