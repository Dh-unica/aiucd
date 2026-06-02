# 03 · Design system

Il design system del Companion nasce per essere **in continuità con l'identità
visiva del convegno** e, al tempo stesso, per dare alla web-app un carattere vivo —
qualcosa che faccia *sentire* il convegno mentre accade, non solo descriverlo. La
grammatica visiva è radicata nella **Sardegna** e nel rapporto tra antico e digitale.

## Palette

Allineata alla palette ufficiale di aiucd2026.unica.it, definita come token in
`tokens.css`.

| Token | Valore | Uso |
|---|---|---|
| `--navy` | `#000060` | Colore identitario, titoli, blocchi pieni |
| `--rust` | `#d8613c` | Accento "vivo": stato live, linea "ora", pulse, CTA |
| `--sand` | `#c2a990` | Pause, sfondi caldi |
| `--accent` | `#cfcabe` | Superfici neutre |
| `--sage` / `--mist` | `#b1c5a4` / `#b5bdbc` | Stati "discussione" / "prossimo" |
| `--paper` / `--base` | `#ffffff` / `#f9f9f9` | Fondi |
| `--ink` / `--muted` | `#111111` / `#5a5a5a` | Testo |
| `--line` | `#e6e3dc` | Bordi, archi del grafo poster |

### I sei colori delle aree tematiche

Ogni contributo appartiene a una delle sei aree, ciascuna con un colore stabile usato
ovunque (bordo delle celle, chip, marker, cluster del grafo):

| Area | Colore |
|---|---|
| DH e co-costruzione | `#000060` |
| Archivi ed edizioni | `#2a6fa1` |
| Memorie e patrimonio | `#1f8a70` |
| Dati e conoscenza | `#c2a990` |
| Testualità digitali | `#d8613c` |
| Altri contributi | `#6b4c8a` |

## Tipografia

Due famiglie, una distinzione netta di ruolo:

- **Cardo** (serif editoriale) per titoli, numeri grandi e momenti tipografici forti
  — porta in scena la dimensione "manoscritta" e accademica.
- **Inter** per tutta la UI e il testo corrente — leggibile e neutra.

Le scale di spazio e di corpo del testo sono **fluide** (`clamp()`), così
l'interfaccia respira in modo continuo dal telefono al totem senza breakpoint bruschi.

## Token CSS

`tokens.css` centralizza spaziature, corpi, ombre, raggi e tempi:

- **Spazi**: da `--space-xs` a `--space-xl`, tutti fluidi.
- **Tipografia**: da `--fs-xs` a `--fs-xxl`, fluida.
- **Ombre** in tinta navy (`--shadow-sm/md/lg`) per coerenza cromatica anche nelle
  profondità.
- **Raggi** (`--radius-sm/md/lg/xl`) e **tempi** (`--t-fast/base/slow`).
- **Touch target** `--tap-min: 44px`, portato a `56px` in modalità kiosk insieme a
  corpi di testo maggiorati — il design è pensato fin dall'inizio anche per i totem.

## Iconografia e identità sarda

L'iconografia usa una tecnica uniforme — **`mask-image` + `currentColor`** — così
ogni segno eredita automaticamente il colore del contenitore senza inline del SVG.
Due registri distinti, con ruoli separati:

- **Glifi nuragici** (`.glyph--{area}`): sei **bronzetti** in pixel-art monocroma
  16×16 (guerriero, sacerdote, madre con bambino, navicella nuragica, stele di Nora,
  suonatore di launeddas), uno per area tematica. La griglia digitale che ospita un
  artefatto antico è la traduzione letterale dell'idea "il manoscritto incontra il
  codice".
- **Icone funzionali** (`.icon--{name}`): SVG vector in stile Lucide/Feather (stella,
  bussola, calendario, pin, ecc.), distinte dai glifi proprio per non confondere
  *identità culturale* e *funzione*. La favicon è il glifo della stele di Nora su
  fondo navy.

### Il pattern *pibiones*

Un motivo a rombo con pibione centrale — riferimento ai **tessuti tradizionali sardi**
— è disponibile come tile ripetibile 24×24 (`.bg-pibiones`), applicato via
`mask-image` con colore e opacità controllabili da custom property. È usato a opacità
molto bassa (≈4,5%) come trama di sfondo su alcune superfici (es. l'intestazione del
Programma), per dare texture identitaria senza mai disturbare la lettura.

## Microinterazioni e stato live

Il linguaggio del "vivo" è calibrato, non chiassoso:

- **Pulse "live"** (rust, ~1,5 s) sugli elementi che indicano qualcosa che accade ora,
  usato con parsimonia — un solo elemento "vivo" per schermata.
- **Barra di avanzamento** del talk: sottile, dà il senso del *ritmo* che nessun
  orario riesce a trasmettere.
- **Linea "ora"** orizzontale che attraversa la griglia del programma.

Niente parallax, niente effetti gratuiti: il convegno è un evento accademico e il
Companion vuole essere elegante e leggibile, non spettacolare.

## Principi di progetto

- **Mobile-first.** Le tab diventano una bottom-nav fissa, i drawer diventano
  bottom-sheet, i target rispettano `safe-area-inset`.
- **Accessibilità.** Ruoli ARIA su tab e dialog, focus trap nei drawer, gestione
  coerente di ESC, etichette parlanti al posto delle emoji decorative (★ → "In
  agenda"), gerarchia di z-index documentata per evitare elementi nascosti.
- **Stato live sempre visibile.** L'indicatore in topbar e la linea "ora" sono
  presenti in modo persistente: orientarsi nel tempo non deve mai costare un tap.
- **Continuità con il convegno.** Palette, tipografia e segni nascono dall'identità
  ufficiale dell'evento e dal contesto sardo, così il Companion è percepito come
  parte del convegno, non come uno strumento esterno.
