# Registro Utilità e Script — MyLAN /Tools

Questo registro documenta gli script Python di supporto e manutenzione per il repository MyLAN.

---

## 1. `generate_icons.py`
- **Scopo:** Genera le icone PNG ufficiali (192x192 e 512x512, "any" con angoli arrotondati e "maskable" a sfondo pieno con il disegno nell'80% centrale) conformi alle specifiche W3C PWA per abilitare l'installazione standalone borderless dell'applicazione su desktop e mobile.
- **Output:** Salva i file `src/icons/icon-192.png`, `icon-512.png`, `icon-maskable-192.png` e `icon-maskable-512.png`.
- **Esecuzione:** `python Tools/generate_icons.py`

---

## 2. `test_runtime_cache.mjs`
- **Scopo:** Prova la cache di runtime delle app (`src/loader/sw-runtime-store.js`, `sw-runtime-quota.js`, `runtime-rules.js`) in una VM di Node con CacheStorage e quota finte: senza `max_entries` 3000 voci restano tutte, `version_param` tiene una sola versione, `max_entries` dato resta un tetto, oltre l'80% della quota escono le voci piu' vecchie (prima le altre app) fino al 70% senza toccare pagine e regole, al massimo una stima al minuto, `parseRuntimeCache` senza tetto predefinito, `mylan:runtime-cache-drop` cancella solo i percorsi indicati coperti da una regola.
- **Esecuzione:** `node Tools/test_runtime_cache.mjs`

---

## 3. `stamp.mjs` (+ `stamp-rules.mjs`)
- **Scopo:** Rende atomico l'aggiornamento di MyLAN dopo una pubblicazione su GitHub Pages (file in cache 10 minuti nel browser). Calcola la versione come hash dei file pubblicati (stampi esclusi, fine riga normalizzati) e scrive `?v=<versione>` (e in `version.json` l'elenco `files` che il Service Worker scarica prima di passare a una nuova pubblicazione) su tutti gli import relativi, sui fogli di stile e sullo script di `index.html`, sul `fetch` dei testi (`src/core/i18n.js`), sulla versione di riserva di `src/boot.js` e in `version.json`. Il Service Worker ha una versione sua (`sw.js` + i suoi `importScripts`): si reinstalla solo se cambia il suo codice. Nessun numero da aumentare a mano.
- **Esecuzione:** `node Tools/stamp.mjs` prima di ogni pubblicazione; `node Tools/stamp.mjs --check` esce con 1 se un timbro manca, e' vecchio o punta a un file che non esiste.

---

## 4. `test_atomic_update.mjs` (+ `atomic_update_fixture.mjs`)
- **Scopo:** Prova in Chrome headless che gli aggiornamenti di MyLAN non mescolano mai due versioni, su un server che si comporta come GitHub Pages (query ignorata, `max-age=600`, ETag/304) con tre pubblicazioni finte ("old", "new", "newer": export diverso in `src/core/theme.js`). A) senza Service Worker: `index.html` vecchio in cache e un modulo scaduto -> parte la nuova versione intera (`version.json`). B) con il Service Worker (`src/loader/sw-shell.js`): il lancio dopo la pubblicazione parte subito dalla cache con la versione vecchia intera, quello dopo con la nuova senza chiedere file alla rete (scaricata tutta in background); un modulo tolto dalla cache con il server gia' su un'altra versione viene rifiutato (503) e `src/boot.js` riparte con la versione pubblicata. `--no-stamp` rifa' A senza timbri e deve riprodurre il guasto ("does not provide an export named ...").
- **Esecuzione:** `node Tools/test_atomic_update.mjs [--no-stamp] [--port=18531] [--cdp=9631]`; usa `.claude/skills/headless-chrome-cdp/scripts/cdp.mjs` (o `CDP_LIB=<percorso di cdp.mjs>`). Copie temporanee in `%TEMP%`, cancellate alla fine.

---

## 5. `test_invite_v2.mjs`
- **Scopo:** Prova il protocollo d'invito (`src/crypto/invite-v2.js`, docs/INTEGRATION.md §5) in Node senza rete: vettore fissato del protocollo 2 (PBKDF2-SHA256 200000 + HKDF, deve coincidere con quello dell'host), busta della risposta che si apre solo con la chiave della risposta, topic che non contengono il codice, protocollo 1 ancora disponibile per i link senza `p` e scelta del protocollo dal link (`p=2` -> 2, link senza `p` -> 1, codice digitato -> 2).
- **Esecuzione:** `node Tools/test_invite_v2.mjs`
