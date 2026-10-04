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
