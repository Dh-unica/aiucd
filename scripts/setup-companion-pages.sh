#!/usr/bin/env bash
# AIUCD Companion · setup delle 2 Page WP (IT + EN) linkate via Polylang.
# Idempotente: se le pagine esistono già le riusa.

set -euo pipefail

cd "$(dirname "$0")/.."

WP_ENV_FILE="$(mktemp)"
trap 'rm -f "$WP_ENV_FILE"' EXIT
docker inspect aiucd_wordpress --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | grep -E '^WORDPRESS_' > "$WP_ENV_FILE"

WPCLI() {
    docker run --rm \
        --env-file "$WP_ENV_FILE" \
        --network aiucd_aiucd_network \
        --volumes-from aiucd_wordpress \
        --workdir /var/www/html \
        -u 1000:1000 \
        wordpress:cli-2.10 "$@"
}

echo "→ Cerco / creo la Page IT (slug=companion)"
IT_ID="$(WPCLI wp post list --post_type=page --name=companion --field=ID --format=ids 2>/dev/null | tr -d '[:space:]' || true)"
if [ -z "$IT_ID" ]; then
    IT_ID="$(WPCLI wp post create \
        --post_type=page \
        --post_status=publish \
        --post_title='Companion del convegno' \
        --post_name='companion' \
        --post_content='[aiucd_companion]' \
        --porcelain 2>&1 | tail -1)"
    echo "   creata IT: $IT_ID"
else
    echo "   trovata IT: $IT_ID (riuso)"
    WPCLI wp post update "$IT_ID" --post_content='[aiucd_companion]' --post_status=publish 2>&1 | tail -1
fi

echo "→ Cerco / creo la Page EN (slug=conference-app)"
EN_ID="$(WPCLI wp post list --post_type=page --name=conference-app --field=ID --format=ids 2>/dev/null | tr -d '[:space:]' || true)"
if [ -z "$EN_ID" ]; then
    EN_ID="$(WPCLI wp post create \
        --post_type=page \
        --post_status=publish \
        --post_title='Conference Companion App' \
        --post_name='conference-app' \
        --post_content='[aiucd_companion]' \
        --porcelain 2>&1 | tail -1)"
    echo "   creata EN: $EN_ID"
else
    echo "   trovata EN: $EN_ID (riuso)"
    WPCLI wp post update "$EN_ID" --post_content='[aiucd_companion]' --post_status=publish 2>&1 | tail -1
fi

echo "→ Polylang: assegna lingue + linka traduzioni"
WPCLI wp eval "
    pll_set_post_language( $IT_ID, 'it' );
    pll_set_post_language( $EN_ID, 'en' );
    pll_save_post_translations( array( 'it' => $IT_ID, 'en' => $EN_ID ) );
    echo 'IT: ' . pll_get_post_language( $IT_ID ) . PHP_EOL;
    echo 'EN: ' . pll_get_post_language( $EN_ID ) . PHP_EOL;
    \$tr = pll_get_post_translations( $IT_ID );
    echo 'Translations: ' . json_encode( \$tr ) . PHP_EOL;
"

echo "→ Flush rewrite rules"
WPCLI wp rewrite flush --hard 2>&1 | tail -2

echo ""
echo "✅ Setup completato"
echo "   IT: http://localhost:7000/companion/         (post_id=$IT_ID)"
echo "   EN: http://localhost:7000/language/en/conference-app/  (post_id=$EN_ID)"
