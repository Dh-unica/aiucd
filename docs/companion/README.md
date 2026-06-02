# Companion AIUCD 2026 · Documentazione di progettazione

Il **Companion** è la web-app del convegno **AIUCD 2026** (Cagliari, 3–5 giugno 2026),
integrata nel sito istituzionale [aiucd2026.unica.it](https://www.aiucd2026.unica.it/).
Accompagna il partecipante nei tre momenti del convegno — prima (attesa e
preparazione), durante (orientamento in tempo reale tra aule e sessioni) e dopo
(archivio) — senza login, senza app store, da aprire con un tap dal telefono.

È un'applicazione **statica** (HTML, CSS e JavaScript vanilla in ES modules, nessun
framework) servita come **plugin WordPress** (`aiucd-companion`) tramite shortcode,
bilingue **IT/EN** via Polylang, con dati rigenerati da un Excel sorgente attraverso
una pipeline Python.

## Indice della documentazione

| Documento | Contenuto |
|---|---|
| [01 · Visione e funzionalità](01-visione-e-funzionalita.md) | La visione di prodotto e il catalogo completo delle sezioni: Esplora, Programma, Poster, Sede, Esplora Cagliari, Cifre, drawer "Il mio AIUCD26", l'assistente Noa e i percorsi tematici. |
| [02 · Architettura](02-architettura.md) | L'architettura tecnica: web-app statica come plugin WordPress, flusso dati Excel → JSON → plugin, bilinguismo, integrazione con il sito (con diagramma Mermaid). |
| [03 · Design system](03-design-system.md) | Palette, tipografia, token CSS, glifi nuragici, pattern *pibiones* e i principi che legano il prodotto all'identità del convegno e della Sardegna. |
| [04 · Pipeline dati e deploy](04-pipeline-dati-e-deploy.md) | La procedura operativa di aggiornamento dei dati e di rilascio in produzione via GitHub Actions. |

## In una riga

Una "control room" d'aula che cambia personalità a seconda del momento del
convegno, costruita con strumenti minimali e curata in ogni dettaglio — dal calcolo
dello stato live al pattern tessile sardo sullo sfondo.
