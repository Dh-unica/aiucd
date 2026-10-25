#!/usr/bin/env bash
# ruota-segreti.sh — nuovi salt di WordPress e nuove password del DB di AIUCD
#
# I segreti stanno solo nel .env (non versionato, chmod 600) e nei container che lo leggono.
# Google Site Kit cifra credenziali e token OAuth con LOGGED_IN_KEY e LOGGED_IN_SALT:
# scripts/sitekit-ricifra.php li ricifra con i salt nuovi, così la connessione a Google resta.
#
# Uso, dalla cartella del deploy (sul server: ~/actions-runner/_work/aiucd/aiucd):
#   scripts/ruota-segreti.sh                        salt e password nuovi: tutti gli utenti escono
#   scripts/ruota-segreti.sh ripristina <cartella>  rimette .env, password e dati di Site Kit di prima
#
# Prima salva un dump del DB e il .env in $BACKUP_ROOT/segreti-<data>/ (chmod 700). Durante il cambio
# il sito è in manutenzione, per pochi secondi. Se la verifica fallisce rimette tutto com'era da solo.
# Quando il sito è verificato la cartella va cancellata: contiene le password vecchie e il DB.
#
# Variabili: BACKUP_ROOT (default $HOME), SITE_HOST (default aiucd2026.unica.it).
set -euo pipefail

cd "$(dirname "$0")/.."
BACKUP_ROOT=${BACKUP_ROOT:-$HOME}
SITE_HOST=${SITE_HOST:-aiucd2026.unica.it}
WP=aiucd_wordpress
DB=aiucd_database
SALTS=(AUTH_KEY SECURE_AUTH_KEY LOGGED_IN_KEY NONCE_KEY AUTH_SALT SECURE_AUTH_SALT LOGGED_IN_SALT NONCE_SALT)

die() { echo "ERRORE: $*" >&2; exit 1; }
[ -s .env ] || die "manca .env in $PWD"

envget() { sed -n "s/^$2=//p" "$1" | tail -1; }  # file chiave
envset() {  # file chiave valore (solo lettere e cifre: niente da quotare)
  if grep -q "^$2=" "$1"; then sed -i "s/^$2=.*/$2=$3/" "$1"; else echo "$2=$3" >> "$1"; fi
}
gen() { python3 -I -c 'import secrets, string, sys; a = string.ascii_letters + string.digits; print("".join(secrets.choice(a) for _ in range(int(sys.argv[1]))))' "$1"; }
fp() { sha256sum | cut -c1-12; }  # impronta di un segreto, per confrontarlo senza stamparlo
env_of() { docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$1" | sed -n "s/^$2=//p"; }

sql() {  # password di root, SQL da stdin. La password passa da stdin: non compare in ps né in docker inspect
  { printf '%s\n' "$1"; cat; } | docker exec -i "$DB" sh -c 'read -r MYSQL_PWD; export MYSQL_PWD; exec mysql -uroot -N -B' 2>/dev/null
}
sitekit() {  # modo; chiave e sale su stdin per verso-stdin e verso-env
  docker exec -i "$WP" php -r "$(sed 1d scripts/sitekit-ricifra.php)" "$1"
}
leggibili() { sitekit verifica | sed -n 's/^site kit: \([0-9]*\) leggibili.*/\1/p'; }

install_env() {  # file temporaneo -> .env, in modo atomico
  chmod 600 "$1"
  mv "$1" .env
}
manutenzione() {  # on | off. Il file vive nel bind mount wordpress/, come quello del deploy
  if [ "$1" = on ]; then printf '<?php $upgrading = %s; ?>\n' "$(date +%s)" > wordpress/.maintenance; else rm -f wordpress/.maintenance; fi
}
# i file temporanei contengono segreti; la manutenzione non deve restare accesa se lo script si interrompe
trap 'rm -f .env.??????; manutenzione off' EXIT

set_passwords() {  # root attuale, password utente, password root
  local h hosts_user hosts_root user
  user=$(envget .env WORDPRESS_DB_USER)
  hosts_user=$(sql "$1" <<<"SELECT host FROM mysql.user WHERE user='$user'")
  hosts_root=$(sql "$1" <<<"SELECT host FROM mysql.user WHERE user='root'")
  [ -n "$hosts_user" ] && [ -n "$hosts_root" ] || { echo "utenti del DB non trovati" >&2; return 1; }
  {
    for h in $hosts_user; do echo "SET PASSWORD FOR '$user'@'$h' = PASSWORD('$2');"; done
    for h in $hosts_root; do echo "SET PASSWORD FOR 'root'@'$h' = PASSWORD('$3');"; done
  } | sql "$1"
}

wait_db() {  # password di root
  for _ in $(seq 1 60); do sql "$1" <<<'SELECT 1' >/dev/null && return 0; sleep 2; done
  return 1
}

check_site() {  # wp-login.php legge il DB: deve rispondere 200
  local code
  for _ in $(seq 1 30); do
    code=$(curl -s -o /dev/null -m 60 -w '%{http_code}' -H "Host: $SITE_HOST" -H 'X-Forwarded-Proto: https' http://127.0.0.1:7000/wp-login.php || true)
    [ "$code" = 200 ] && { echo "sito ok: $SITE_HOST/wp-login.php risponde $code"; return 0; }
    sleep 2
  done
  echo "il sito non risponde (ultimo codice: ${code:-nessuno})" >&2
  return 1
}

cmd_ruota() {
  local root_old root_new user_new dir tmp k sk
  root_old=$(envget .env MYSQL_ROOT_PASSWORD)
  sql "$root_old" <<<'SELECT 1' >/dev/null || die "MYSQL_ROOT_PASSWORD del .env non entra nel DB"
  [ "$(env_of "$WP" WORDPRESS_LOGGED_IN_KEY | fp)" = "$(envget .env WORDPRESS_LOGGED_IN_KEY | fp)" ] ||
    die "i salt del .env non sono quelli del container: il .env è cambiato dopo l'ultimo deploy"
  sk=$(sitekit verifica) || die "lettura dei dati di Site Kit non riuscita"
  echo "$sk"
  case "$sk" in *" 0 illeggibili"*) ;; *) echo "nota: i valori illeggibili lo sono già per Site Kit, che va ricollegato a Google" ;; esac
  sk=$(echo "$sk" | sed -n 's/^site kit: \([0-9]*\) leggibili.*/\1/p')

  dir=$BACKUP_ROOT/segreti-$(date +%Y%m%d-%H%M%S)
  mkdir -m 700 "$dir"
  cp .env "$dir/env"; chmod 600 "$dir/env"
  echo "dump del DB in $dir ..."
  printf '%s\n' "$root_old" | docker exec -i "$DB" sh -c \
    'read -r MYSQL_PWD; export MYSQL_PWD; exec mysqldump -uroot --single-transaction --quick --routines --triggers --events "$1"' _ "$(envget .env WORDPRESS_DB_NAME)" |
    gzip -6 > "$dir/db.sql.gz"
  [ "$(gzip -cd "$dir/db.sql.gz" | tail -1 | cut -c1-14)" = "-- Dump comple" ] || die "dump incompleto, non tocco niente"

  tmp=$(mktemp .env.XXXXXX)
  cp .env "$tmp"
  for k in "${SALTS[@]}"; do envset "$tmp" "WORDPRESS_$k" "$(gen 64)"; done
  user_new=$(gen 32); root_new=$(gen 32)
  envset "$tmp" WORDPRESS_DB_PASSWORD "$user_new"
  envset "$tmp" MYSQL_ROOT_PASSWORD "$root_new"

  manutenzione on
  printf '%s\n%s\n' "$(envget "$tmp" WORDPRESS_LOGGED_IN_KEY)" "$(envget "$tmp" WORDPRESS_LOGGED_IN_SALT)" | sitekit verso-stdin ||
    die "ricifratura di Site Kit non riuscita: non ho cambiato niente"
  if ! set_passwords "$root_old" "$user_new" "$root_new"; then
    # Site Kit è già sui salt nuovi: il ripristino li legge dal .env attuale per riportarlo indietro
    echo "cambio delle password non riuscito" >&2; install_env "$tmp"; cmd_ripristina "$dir"; exit 1
  fi
  install_env "$tmp"
  docker compose up -d

  if ! wait_db "$root_new"; then echo "il DB non risponde con la password nuova" >&2; cmd_ripristina "$dir"; exit 1; fi
  if sql "$root_old" <<<'SELECT 1' >/dev/null; then echo "la password vecchia di root entra ancora" >&2; cmd_ripristina "$dir"; exit 1; fi
  if [ "$(env_of "$WP" WORDPRESS_DB_PASSWORD | fp)" != "$(echo "$user_new" | fp)" ] ||
     [ "$(env_of "$WP" WORDPRESS_LOGGED_IN_KEY | fp)" != "$(envget .env WORDPRESS_LOGGED_IN_KEY | fp)" ] ||
     [ "$(env_of "$DB" MYSQL_ROOT_PASSWORD | fp)" != "$(echo "$root_new" | fp)" ]; then
    echo "i container non hanno i valori nuovi" >&2; cmd_ripristina "$dir"; exit 1
  fi
  if [ "$(leggibili)" != "$sk" ]; then echo "Site Kit non legge più i dati che leggeva prima" >&2; cmd_ripristina "$dir"; exit 1; fi
  manutenzione off
  check_site || { cmd_ripristina "$dir"; exit 1; }
  echo "salt e password ruotati: tutti gli utenti devono rientrare. Quando il sito è verificato: rm -r $dir"
}

cmd_ripristina() {  # cartella salvata dalla rotazione
  local dir=$1 root_now root_old key_now salt_now
  [ -s "$dir/env" ] || die "manca $dir/env"
  echo "ripristino da $dir ..." >&2
  manutenzione on
  root_old=$(envget "$dir/env" MYSQL_ROOT_PASSWORD)
  root_now=$(envget .env MYSQL_ROOT_PASSWORD)
  key_now=$(envget .env WORDPRESS_LOGGED_IN_KEY); salt_now=$(envget .env WORDPRESS_LOGGED_IN_SALT)
  sql "$root_now" <<<'SELECT 1' >/dev/null || root_now=$root_old
  set_passwords "$root_now" "$(envget "$dir/env" WORDPRESS_DB_PASSWORD)" "$root_old"
  cp "$dir/env" .env.ripristino; install_env .env.ripristino
  docker compose up -d
  wait_db "$root_old" || die "il DB non risponde con la password di $dir"
  # i dati di Site Kit possono essere cifrati con i salt nuovi: tornano a quelli del container
  printf '%s\n%s\n' "$key_now" "$salt_now" | sitekit verso-env
  manutenzione off
  check_site && echo "ripristinato $dir" >&2
}

case "${1:-}" in
  "") cmd_ruota ;;
  ripristina) [ -n "${2:-}" ] || die "uso: $0 ripristina <cartella>"; cmd_ripristina "$2" ;;
  *) echo "uso: $0 | $0 ripristina <cartella>" >&2; exit 2 ;;
esac
