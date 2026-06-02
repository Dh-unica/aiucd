# 01 · Visione e funzionalità

## La visione di prodotto

Il catalogo dei contributi di un convegno è una **vetrina del programma**: utile
nel *prima*, quando ci si fa un'idea di cosa aspettarsi, ma inerte nei tre giorni
in cui il convegno accade davvero. Il Companion nasce per colmare questo vuoto:
evolvere la vetrina in un **companion d'aula** che cambia "personalità" in base al
momento e accompagna il partecipante con quattro promesse:

1. **Capire cosa succede adesso**, in tempo reale, in tutte le aule.
2. **Costruire il proprio percorso**, scegliendo a mano o accettando un suggerimento.
3. **Seguire un filo tematico** che attraversa più aule e sessioni.
4. **Orientarsi fisicamente** nella sede e nella città.

Il tutto senza login, senza backend dedicato, senza app da installare: una pagina
web che si apre da un link o da un QR code e funziona sul telefono di chiunque.

### Lo "stato live", cuore del prodotto

L'elemento che distingue il Companion da un programma stampato è lo **stato live**:
un indicatore sempre presente nella topbar che cambia significato a seconda di
`new Date()` confrontato con la griglia oraria del programma. Non c'è alcuna logica
server-side — il tempo è calcolato interamente nel browser. Gli stati sono granulari:

| Stato | Significato | Quando |
|---|---|---|
| `pre` | Conto alla rovescia (giorni / "Domani" / "Oggi") | Prima dell'apertura |
| `pre-soon` / `pre-imminent` | Apertura entro 24h / entro 60 minuti | Vigilia e ultime ore |
| `live` | "In corso" + numero di talk simultanei + minuti al prossimo cambio + barra di avanzamento | Durante una sessione o una plenaria |
| `break` | "Pausa" + prossimo evento annunciato | Tra una sessione e l'altra |
| `post` | "Convegno concluso" → modalità archivio | Dopo la chiusura |

L'indicatore è cliccabile e porta al contesto rilevante (la griglia, la *live
snapshot*, le Cifre). I timer si aggiornano ogni 30 secondi e, poiché una pagina web
viene "congelata" quando va in background, un handler `visibilitychange`/`pageshow`
riallinea tutto istantaneamente al rientro in primo piano — così l'indicatore non
resta mai indietro. Un controllo non bloccante segnala inoltre se l'orologio del
dispositivo è sfasato di oltre 5 minuti rispetto al server, perché tutta
l'esperienza "live" dipende dall'ora del device.

## Le sezioni

La navigazione è a tab, deep-linkable via hash (`#programma`, `#poster`, …): ogni
sezione ha un URL condivisibile. Su desktop le tab sono in alto; su mobile diventano
una bottom-nav fissa. Le sezioni principali sono sei, più tre superfici trasversali
(drawer agenda, overlay percorsi, assistente Noa).

### Programma — la griglia tempo × aula

La "home" del Companion. Un convegno con track paralleli si capisce a colpo d'occhio
solo come **tabellone**, non come lista: l'utente vuole sapere "alle 15:20 di giovedì
cosa succede in Aula 5A mentre in 6A parla un altro?", che è una domanda *spaziale*.

- Griglia **CSS Grid** tempo × aula per ciascuno dei tre giorni, con tab-giorno e il
  giorno corrente preselezionato.
- Le celle-talk hanno il **bordo sinistro colorato** per area tematica; plenarie e
  pause rompono la griglia a tutta larghezza, restituendo il ritmo della giornata.
- **Linea "ora"** orizzontale che attraversa la griglia all'orario corrente — il
  dettaglio che, da solo, fa la differenza tra "programma" e "convegno vivo".
- **Live snapshot** integrata sopra la griglia: una striscia riassuntiva ("3 talk in
  corso · prossimo cambio fra N min") e mini-card per aula con titolo, autore, barra
  di avanzamento del talk e prossimo intervento.
- Click su una cella → **modale di dettaglio** del talk (titolo, autori, abstract,
  area, modalità), con pulsanti per salvarlo in agenda e aggiungerlo al calendario.
- **Allineamento al pixel** delle celle delle aule sulla stessa fascia oraria
  (CSS subgrid), così la linea "ora" taglia colonne coerenti.

### Esplora — il catalogo dei contributi

La sezione per **sfogliare e cercare** i 134 contributi accettati, particolarmente
utile nel pre-convegno e per ritrovare un singolo paper.

- Ricerca testuale (titolo, autore, parola chiave) e filtri per area tematica e
  modalità (orale / poster).
- Card colorate per area, chip "in agenda" sui contributi salvati, click → modale.
- **Mappa Leaflet delle affiliazioni**: da dove vengono le istituzioni partecipanti,
  con cluster, legenda dei colori-area e controlli di zoom Italia / Europa / Tutte.

### Poster — la galleria

I poster non hanno uno spazio espositivo lungo in sede: il Companion dà loro
**visibilità web** con un peso pari a quello di un atrio espositivo. Non una tabella,
ma una galleria che invita a esplorare e a vedere chi c'è dietro ogni lavoro.

- Schede con **foto dell'autore** (croppata round) o iniziali tipografiche come
  fallback, titolo, co-autori e affiliazioni, area, abstract.
- Visualizzazione a **grafo D3** (nodi = poster, cluster = aree) e viste alternative
  più navigabili a pollice su mobile.
- Aggancio ai **PDF/immagini pubblicati su Zenodo** quando disponibili: anteprima
  della prima pagina e link "Apri su Zenodo".

### Sede — la mappa delle aule con stato live

Una pianta schematica del Campus Sa Duchessa per orientarsi tra le aule, guidata
dallo stesso motore live del Programma.

- Le **aule** sono blocchi cliccabili che cambiano colore secondo lo stato (in corso,
  discussione, pausa, prossima, conclusa).
- Tap su un'aula → pannello con cosa è in corso, il prossimo talk e indicazioni
  "come arrivarci".
- Etichette tipografiche grandi, leggibili anche da lontano (utile su totem).

### Esplora Cagliari — i POI della città

Pensata per pianificare un'uscita tra una relazione e l'altra o per riempire un
vuoto di programma.

- I punti di interesse cittadini su **mappa Leaflet**, con marker per tipologia
  (culturale, belvedere, naturalistico, passeggiata, mezzi) e la sede in evidenza.
- Per ogni POI: **tempi reali di percorrenza** a piedi e in auto, calcolati in build
  via OSRM (con fallback deterministico se il servizio non risponde), immagine
  pre-scaricata e descrizione.
- Filtro per **tempo disponibile**: l'assistente Noa, rilevando un gap nell'agenda,
  può pre-filtrare i POI raggiungibili nella finestra di tempo libera.

### Cifre del convegno — le statistiche

La dashboard di pre-convegno: KPI, distribuzione per area, andamento delle
submission, principali affiliazioni, qualità del processo di valutazione. Grafici
**Chart.js** popolati in memoria dai dati dei contributi.

## Le superfici trasversali

### Drawer "Il mio AIUCD26" — l'agenda personale

Richiamabile da ogni tab tramite il pulsante ★ in topbar (con contatore). Lista
calendar-like dei talk salvati, con persistenza **senza login**:

- Salvataggio immediato in `localStorage`.
- **Copia di sicurezza via cookie server-set**: Safari (Intelligent Tracking
  Prevention) cancella il `localStorage` dopo ~7 giorni di inattività come prima
  parte, svuotando l'agenda sul telefono del partecipante. Un endpoint REST
  WordPress salva gli ID dell'agenda in un cookie impostato dal server, non soggetto
  a quel limite: al rientro l'agenda viene **fusa** dalle due fonti senza mai perdere
  voci. La sincronizzazione è debounced; il TTL del cookie si rinfresca a ogni visita.
- **Rilevamento conflitti**: due talk salvati sovrapposti vengono mostrati come una
  scelta esplicita.
- **Esporta nel calendario** (Google / Apple / Outlook / `.ics`).

### Overlay "Percorsi suggeriti" — i fili tematici

I percorsi spezzano la rigidità delle sessioni parallele proponendo itinerari curati
attraverso il convegno. Sono **estratti con l'IA e revisionati dal comitato di
programma** — l'interfaccia dichiara esplicitamente questa genesi. Tre famiglie
complementari:

- **Approfondisci un tema** — cluster ristretti ad alta coesione semantica.
- **Esplora tutto il convegno** — pochi macro-percorsi che abbracciano molti talk.
- **Connetti aree diverse** — percorsi-crocevia trans-disciplinari.

Ogni percorso è una **timeline verticale** che mostra dove andare, se il prossimo
talk è nella stessa aula (si resta seduti) o richiede uno spostamento, e segnala i
conflitti d'orario come scelte. Un pulsante aggiunge l'intero percorso all'agenda.

### Noa — l'assistente del convegno

Una guida sempre presente (FAB + drawer richiamabile da ogni tab) con una **voce**
definita: prima persona, asciutta, pratica, capace di ammettere i propri limiti, con
un tocco di sardità misurato. Noa adatta i suoi suggerimenti al momento:

- *pre*: conto alla rovescia e invito ad aprire l'agenda;
- *live* / *break*: segnala i **tempi morti** (gap ≥ 30 minuti tra talk salvati) e
  propone cosa fare, eventualmente rimandando a Esplora Cagliari filtrata sul tempo;
- *ultimo giorno* / *post*: suggerimenti di chiusura e ripasso dell'agenda.

Noa è anche la porta d'accesso ai percorsi tematici, presentati come tile raggruppate
per criterio.

## Disponibilità offline e installazione

Il Companion è una **PWA installabile**. La pagina espone un *web manifest*
(`display: standalone`, icone dedicate, lang-aware IT/EN) e registra un
**service worker** con caching a runtime e fallback offline: le navigazioni sono
*network-first* e, in assenza di rete, ricadono sulla cache o sulla pagina di
avvio. Dal telefono compare l'invito "Installa l'app": aggiunta alla schermata
Home, l'app si apre a tutto schermo e resta consultabile anche offline.

A livello di contenuti, i dati del convegno sono caricati al boot e indicizzati
in memoria: dopo il primo caricamento la consultazione non richiede ulteriori
chiamate di rete, e l'agenda personale è interamente offline (`localStorage`,
con cookie server-set come rete di sicurezza contro la pulizia ITP di Safari).

> Manifest, service worker e UI di installazione sono forniti dal mu-plugin
> `aiucd-pwa` (endpoint virtuali `/aiucd-companion.webmanifest` e
> `/aiucd-companion-sw.js`), non dai file statici del Companion.
