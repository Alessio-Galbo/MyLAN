# Registro Utilità e Script — MyLAN /Tools

Questo registro documenta gli script Python di supporto e manutenzione per il repository MyLAN.

---

## 1. `generate_icons.py`
- **Scopo:** Genera le icone PNG ufficiali (192x192 e 512x512) conformi alle specifiche W3C PWA per abilitare l'installazione standalone borderless dell'applicazione su desktop e mobile.
- **Output:** Salva i file `src/icons/icon-192.png` e `src/icons/icon-512.png`.
- **Esecuzione:** `python Tools/generate_icons.py`

---

## 2. `test_runtime_cache.mjs`
- **Scopo:** Prova la cache di runtime delle app (`src/loader/sw-runtime-store.js`, `sw-runtime-quota.js`, `runtime-rules.js`) in una VM di Node con CacheStorage e quota finte: senza `max_entries` 3000 voci restano tutte, `version_param` tiene una sola versione, `max_entries` dato resta un tetto, oltre l'80% della quota escono le voci piu' vecchie (prima le altre app) fino al 70% senza toccare pagine e regole, al massimo una stima al minuto, `parseRuntimeCache` senza tetto predefinito, `mylan:runtime-cache-drop` cancella solo i percorsi indicati coperti da una regola.
- **Esecuzione:** `node Tools/test_runtime_cache.mjs`

---

## 3. `stamp.mjs` (+ `stamp-rules.mjs`)
- **Scopo:** Rende atomico l'aggiornamento di MyLAN dopo una pubblicazione su GitHub Pages (file in cache 10 minuti nel browser). Calcola la versione come hash dei file pubblicati (stampi esclusi, fine riga normalizzati) e scrive `?v=<versione>` su tutti gli import relativi, sui fogli di stile e sullo script di `index.html`, sul `fetch` dei testi (`src/core/i18n.js`), sulla versione di riserva di `src/boot.js` e in `version.json`. Il Service Worker ha una versione sua (`sw.js` + i suoi `importScripts`): si reinstalla solo se cambia il suo codice. Nessun numero da aumentare a mano.
- **Esecuzione:** `node Tools/stamp.mjs` prima di ogni pubblicazione; `node Tools/stamp.mjs --check` esce con 1 se un timbro manca, e' vecchio o punta a un file che non esiste.

---

## 4. `test_atomic_update.mjs` (+ `atomic_update_fixture.mjs`)
- **Scopo:** Prova in Chrome headless che un aggiornamento non mescola mai due versioni: pubblica una copia "vecchia" di MyLAN su un server che si comporta come GitHub Pages (query ignorata, `max-age=600`, ETag/304), la apre, pubblica una copia "nuova" sullo stesso indirizzo (export diverso in `src/core/theme.js`) e riapre con `index.html` vecchio ancora in cache e un modulo gia' scaduto. Controlla: parte la nuova versione senza errori, tutti i moduli e i fogli di stile portano `?v=<nuova versione>`, `version.json` letto senza cache, nuovo Service Worker con i suoi `importScripts`. `--no-stamp` rifa' la prova senza timbri e deve riprodurre il guasto ("does not provide an export named ...").
- **Esecuzione:** `node Tools/test_atomic_update.mjs [--no-stamp] [--port=18531] [--cdp=9631]`; usa `.claude/skills/headless-chrome-cdp/scripts/cdp.mjs` (o `CDP_LIB=<percorso di cdp.mjs>`). Copie temporanee in `%TEMP%`, cancellate alla fine.
