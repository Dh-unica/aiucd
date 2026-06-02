# 04 · Pipeline dati e deploy

Documento operativo sintetico: come un aggiornamento delle fonti arriva fino al sito
in produzione. La procedura completa di riferimento è `docs/UPDATE_PROCEDURE.md` nel
repo `aiucd_stats`.

## Le fonti

Tutto nasce in `data/source/` (repo `aiucd_stats`), con **nomi file fissi** letti
dagli script:

| Fonte | Cosa fornisce |
|---|---|
| `FONTE_AIUCD_CAGLIARI_26_CONDIVISO.xlsx` | Titoli, autori, esito (orale/poster), programma, foglio POSTER, foglio MAPPA |
| `aiucd26_submissions.xls` | Abstract, area tematica, candidatura al premio Gigliozzi |
| `paths_proposed.md` | I 14 percorsi tematici curati (Markdown human-readable) |
| `translations_en.json` | Overlay manuale delle traduzioni EN dei dati |

I 134 contributi nascono dal **merge per `Paper ID`** di due sorgenti, ciascuna
autoritativa per un sottoinsieme di campi: CONDIVISO è autoritativo per
titolo/autori/modalità (con cascata Programma Dettaglio → POSTER → Esiti Call),
SUBMISSIONS per abstract/area/Gigliozzi.

> `aiucd26_submissions.xls` è in formato **SpreadsheetML 2003 XML** esportato dal
> sistema CMT: non va riaperto/risalvato con Excel o LibreOffice, perché il
> salvataggio cambia formato e rompe il loader. Se serve aggiornarlo, ri-esportarlo.

## Gli script Python

```bash
python scripts/build.py && python scripts/apply_translations.py
```

1. **`build.py`** — archivia la build precedente in `data/_history/<timestamp>/`,
   legge gli Excel e i percorsi, esegue il merge per Paper ID, **valida le regole di
   business** (talk con orario, riferimenti coerenti, swap di codici rilevati), e
   scrive i JSON in `data/generated/`: `program.json`, `papers.json`, `posters.json`,
   `catalogo.json`, `paths.json`, `poi.json`, più `manifest.json` (con hash SHA-256
   per il cache-busting) e un `build_report.md` leggibile con statistiche e warning.
2. **`apply_translations.py`** — aggiunge i campi `*_en` ai JSON. È **idempotente e
   non distruttivo**: i record senza traduzione restano in italiano e il frontend
   cade in fallback. **Non va saltato**: altrimenti la versione EN perde
   silenziosamente tutte le traduzioni — per questo i due comandi si concatenano con
   `&&`.

Script ausiliari, da lanciare **solo** se sono cambiate città di affiliazione o POI:

```bash
python scripts/enrich_geo.py     # affiliations_geo.json (geocoding cache OSM)
python scripts/enrich_poi.py     # immagini POI + tempi a piedi/auto via OSRM
```

`catalogo.json` **non è più curato a mano**: è rigenerato a ogni build. Le modifiche
si fanno alla fonte (per un titolo: `Esiti Call`; per un abstract/area: il foglio
submissions; per gli autori di un poster: colonna `AUTORI` del foglio POSTER), mai sul
JSON generato.

## Validazione in locale

```bash
cat data/generated/build_report.md          # stats + warning attesi vs anomalie
python3 -m http.server 8765                  # poi apri il companion in standalone
```

Lo smoke test sfrutta `?simulate=` per controllare ogni momento del convegno
(pre / live / pausa / post) e ciascuna tab. Si verifica IT e, con `?lang=en`, EN.

## Sync verso il plugin WordPress

```bash
./scripts/sync-companion-to-wp.sh
```

Lo script fa un `rsync -a --delete` di `companion/` → `static/companion/` e di
`data/generated/` → `static/data/generated/` del plugin `aiucd-companion` nel repo
`aiucd`. Non tocca il codice PHP. Il cache-busting dei JSON è automatico
(`manifest.json → version` combinato con l'`mtime` di `app.js`).

## Commit e deploy

Due commit distinti:

```bash
# repo sorgente
cd aiucd_stats && git add data/ && git commit -m "chore(data): refresh build (<data>)" && git push

# repo WordPress → triggera il deploy
cd aiucd && git add wordpress/wp-content/plugins/aiucd-companion/static/ \
  && git commit -m "feat(companion): sync data + companion (<data>)" && git push origin main
```

Il push su `main` del repo `aiucd` attiva `.github/workflows/deploy.yml` sul
**self-hosted runner `aiucd-prod`**, che esegue: cleanup e checkout, verifica delle
directory persistenti, **backup pre-deploy obbligatorio** (DB + uploads), restart di
docker compose, sanity check post-deploy (incluso `wp plugin status aiucd-companion`)
e retention degli ultimi 10 backup. Non esiste alcun deploy del repo `aiucd_stats`:
l'Excel non va in produzione, solo i JSON generati dentro il plugin.

## Verifica in produzione

```
https://www.aiucd2026.unica.it/companion/                      # IT
https://www.aiucd2026.unica.it/language/en/conference-app/     # EN
```

Controlli rapidi: i JSON serviti con il nuovo `?v=…` (versione del manifest), header
`Last-Modified` aggiornato, nessun 404 sugli asset (es. immagini POI).

## Rollback

- **Dati**: ogni build precedente è in `data/_history/<timestamp>/`; si ripristina la
  cartella, si ri-sincronizza e si committa nel repo `aiucd`.
- **Deploy**: i backup pre-deploy (DB + uploads) restano sul runner di produzione; per
  il codice del plugin si usa `git revert` del commit di sync e si rideploya.

## Checklist sintetica

```text
[ ] Aggiornate le fonti in data/source/ (nomi file invariati)
[ ] python scripts/build.py && python scripts/apply_translations.py
[ ] (opz.) enrich_geo.py / enrich_poi.py se cambiati geo o POI
[ ] Letto build_report.md (warning attesi? stats coerenti?)
[ ] Smoke test ?simulate= in locale (pre/live/break/post), IT + EN
[ ] ./scripts/sync-companion-to-wp.sh
[ ] Commit/push repo aiucd_stats
[ ] Commit/push repo aiucd → deploy GHA verde
[ ] Smoke test su produzione IT + EN
```
