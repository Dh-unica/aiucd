# Report incidente di sicurezza AIUCD 2026

## Sintesi

- **Sito:** `https://aiucd2026.unica.it`
- **Finestra di compromissione osservata:** 20–28 luglio 2026
- **Data di risposta e bonifica:** 28 luglio 2026
- **Severità:** critica
- **Stato:** contenuto e bonificato; monitoraggio e rotazione delle integrazioni esterne raccomandati

Il sito eseguiva WordPress 6.9.4, versione vulnerabile a
`CVE-2026-63030`. I log mostrano lo sfruttamento anonimo dell'endpoint REST
batch, la creazione di quattro amministratori, il caricamento di una webshell
mascherata da plugin di cache e l'esecuzione remota di comandi.

WordPress 7.0.2 corregge una vulnerabilità critica di confusione delle route
REST batch e SQL injection con esecuzione remota di codice. L'annuncio
ufficiale è disponibile in
[WordPress 7.0.2 Release](https://wordpress.org/news/2026/07/wordpress-7-0-2-release/).

## Causa radice

La causa radice, con confidenza alta, è lo sfruttamento di
`CVE-2026-63030` mentre il sito era ancora su WordPress 6.9.4.

Evidenze:

1. Dal 20 luglio compaiono sequenze di `POST /?rest_route=/batch/v1` e
   `POST /wp-json/batch/v1`, con risposte HTTP 207 ed errori nel server REST.
2. In corrispondenza delle sequenze vengono creati amministratori non
   legittimi.
3. Il 23 luglio uno degli account effettua login, visita la pagina di upload
   plugin, carica il falso plugin e lo attiva.
4. Subito dopo l'attivazione vengono richieste funzioni di `eval` e `cmd`,
   incluso il comando `id;hostname;pwd`.
5. La webshell viene richiamata nuovamente il 27 luglio e l'account illecito
   `wp2_0b1783` risulta ancora usato il 28 luglio.

Il reverse proxy fa apparire tutte le richieste come provenienti da
`90.147.144.144`; i log applicativi non permettono quindi di attribuire
l'indirizzo IP originario dell'attaccante.

## Indicatori di compromissione

### Utenti WordPress illeciti

| ID | Username | Data registrazione UTC |
|---:|---|---|
| 8 | `w2s_6181ac18ff1f` | 2026-07-20 07:40:47 |
| 9 | `wp2_0b1783` | 2026-07-21 01:49:46 |
| 10 | `site_admin` | 2026-07-22 03:58:54 |
| 11 | `cacheops6f8240` | 2026-07-23 18:41:23 |

Tutti disponevano del ruolo `administrator`.

### Plugin malevolo

- Directory: `wp-content/plugins/wp-performance-cache-893896/`
- Nome visualizzato: `WP Performance Cache`
- File loader:
  `wp-performance-cache-893896/wp-performance-cache-893896.php`
- Payload duplicato:
  `gzip.php` e `assets/cache-loader.php`
- SHA-256 payload:
  `ddfd4f3da8b4b0438ea528be78a8bf3942ccc53f39b056b3d5f410386120c320`
- SHA-256 loader:
  `5fea305fbf9fff6798d0e349121a61f5d35c54838d49a339997583a18623e64f`

Il payload decifrava codice incorporato usando il parametro GET `k`, lo
scriveva in un file `.tmp`, lo includeva e poi lo cancellava. In assenza della
chiave corretta produceva l'output binario che ha reso il sito illeggibile.

### URL e parametri osservati

- `/wp-content/plugins/wp-performance-cache-893896/gzip.php?k=wp`
- `/?wpcache=c9a17127cabc2ef55f43a709&m=eval&c=...`
- `/?wpcache=c9a17127cabc2ef55f43a709&m=cmd&c=...`

## Timeline essenziale

| Data e ora UTC | Evento |
|---|---|
| 2026-07-17 | Rilasciato WordPress 7.0.2 con la correzione critica. |
| 2026-07-20 07:40 | Prime sequenze REST batch e creazione del primo admin illecito. |
| 2026-07-21 01:49 | Creazione del secondo admin illecito. |
| 2026-07-22 03:58 | Creazione del terzo admin illecito. |
| 2026-07-23 18:41 | Creazione del quarto admin, login e upload del plugin. |
| 2026-07-23 18:42 | Attivazione della webshell e test di esecuzione comandi. |
| 2026-07-27 07:40 | Il workflow automatico aggiorna WordPress ma include anche il plugin estraneo nel proprio commit. |
| 2026-07-27 12:33 e 16:59 | Nuovi accessi diretti alla webshell. |
| 2026-07-28 03:59 | Uso autenticato dell'account illecito `wp2_0b1783`. |
| 2026-07-28 10:08 | Snapshot forense locale completato. |
| 2026-07-28 10:15–10:22 | Bonifica, rotazione credenziali, aggiornamenti e verifiche. |

## Backup ed evidenze preservate

Snapshot locale:

`backups/incident_20260728_120810/`

Il backup contiene progetto completo, `.env`, upload, dump SQL, metadati
Docker e log dei container. Gli archivi sono stati verificati e il dump SQL è
stato ripristinato con successo in un MariaDB temporaneo: 22 tabelle, 1.137
contenuti e 10 utenti nello snapshot pre-bonifica.

| File | Dimensione | SHA-256 |
|---|---:|---|
| `production-project.tar.gz` | 243 MB | `d78b6a99a96b2011f13179049211e5b16c2b3b9f90e758a143425bdff602ee24` |
| `production-uploads.tar.gz` | 127 MB | `791bf3a23663cd8cf9bec340cb7a603f3dcaba021025de09f8284f4c06240609` |
| `production-database.sql.gz` | 960 KB | `4ba31afe6e5ece4dbcc7af40a9d33e6f789649e75388e2dfeceb29e12f5257a1` |
| `wordpress-container.log.gz` | 11 MB | `128851488c07b464057d40d7afe0ecd5578c0d0c9460e989a1bc65bed2c41375` |
| `database-container.log.gz` | 1,2 KB | `076326daab9d40f575a6d132697f3ec7156fc0ba6dd40699f9cda90703634151` |
| `production-runtime-metadata.txt.gz` | 8,5 KB | `1767eab01670eb23e60259b5d9ad1e3eeadcafc8a15ba3cad667be1382783be9` |

## Azioni di contenimento e bonifica

- disattivato il plugin senza caricarne il codice;
- eliminata la directory del plugin dal webroot;
- eliminati i quattro utenti illeciti e i relativi metadati;
- invalidate tutte le sessioni WordPress;
- eliminati opzioni e transient residui collegati al plugin;
- ruotata la password dell'utente database WordPress;
- ruotate tutte le chiavi e i salt di autenticazione WordPress;
- impostato `.env` a permessi `0600`;
- abilitato `DISALLOW_FILE_EDIT`;
- aggiornato core e immagine Docker a WordPress 7.0.2;
- aggiornati Site Kit a 1.184.0 e TranslatePress a 3.2.6;
- rimosso il plugin inattivo Hello Dolly;
- fermato phpMyAdmin, che era esposto su `0.0.0.0:8080`;
- aggiunto al workflow di aggiornamento un controllo bloccante per plugin
  sconosciuti, modifiche al codice custom e checksum non validi.

## Verifiche finali

- core WordPress 7.0.2 conforme ai checksum ufficiali `it_IT`;
- sei plugin pubblici verificati con checksum WordPress.org;
- plugin custom e MU-plugin verificati rispetto a Git;
- nessun file `.tmp` residuo;
- nessun indicatore noto nei file PHP o negli upload;
- nessun utente illecito e nessuna sessione nel database;
- nessuna opzione database contenente gli indicatori noti;
- URL fisico della webshell: HTTP 404;
- parametro di comando della webshell: nessuna esecuzione, normale home;
- home e Companion: HTTP 200 e HTML UTF-8 valido.

## Impatto e limiti dell'analisi

È provata l'esecuzione remota di codice nel container WordPress. L'attaccante
deve quindi essere considerato in grado di leggere e modificare i file montati,
le variabili d'ambiente WordPress e il database applicativo.

Non sono emerse evidenze di:

- PHP malevolo negli upload;
- modifica del core dopo l'aggiornamento a 7.0.2;
- persistenza tramite cron WordPress o crontab host;
- nuovi utenti MariaDB;
- chiavi SSH aggiunte;
- escalation dal container all'host.

L'assenza di evidenze nei log disponibili non dimostra l'assenza di
esfiltrazione. Il reverse proxy non conserva l'IP client nei log Apache e la
webshell cancellava i file temporanei dopo l'esecuzione.

## Azioni successive raccomandate

1. Cambiare le password dei sei utenti WordPress legittimi, iniziando dai due
   amministratori.
2. Revocare e riconnettere le integrazioni che conservano token nel database,
   in particolare Google Site Kit e WP Mail SMTP.
3. Configurare il reverse proxy e Apache per registrare in modo affidabile
   l'IP client reale.
4. Applicare rate limiting a `/wp-login.php` e disabilitare o limitare
   `/xmlrpc.php` se non necessario.
5. Monitorare per almeno 14 giorni richieste agli IOC elencati, creazione
   utenti, upload plugin e modifiche al webroot.
6. Conservare lo snapshot locale e i log in posizione ad accesso ristretto;
   contengono credenziali storiche e dati personali.
