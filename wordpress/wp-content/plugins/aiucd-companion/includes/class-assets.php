<?php
/**
 * Enqueue CSS/JS del companion SOLO sulle pagine che contengono lo shortcode
 * [aiucd_companion]. Carica anche le librerie esterne da CDN (Leaflet, D3,
 * Chart.js, Google Fonts) replicando l'index.html standalone del companion.
 */

if ( ! defined( 'ABSPATH' ) ) exit;

class AIUCD_Companion_Assets {

    public static function register() {
        add_action( 'wp_enqueue_scripts', array( __CLASS__, 'maybe_enqueue' ) );
        add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue_global_fab' ) );
        add_action( 'wp_footer',          array( __CLASS__, 'render_global_fab' ), 99 );
        add_filter( 'script_loader_tag', array( __CLASS__, 'module_type' ), 10, 3 );
        add_filter( 'body_class',        array( __CLASS__, 'body_class' ) );
    }

    /**
     * Aggiunge la classe `aiucd-companion-page` al <body> sulle Page WP che
     * contengono lo shortcode. Permette al file wp-embed.css del companion di
     * applicare overrides scoped (hide page title H1, nasconde topbar brand,
     * relayout, ecc.) senza toccare lo styling standalone.
     */
    public static function body_class( $classes ) {
        if ( self::page_has_shortcode() ) {
            $classes[] = 'aiucd-companion-page';
        }
        return $classes;
    }

    private static function page_has_shortcode() {
        global $post;
        if ( ! is_singular() || ! $post ) return false;
        return has_shortcode( $post->post_content, AIUCD_Companion_Shortcode::TAG );
    }

    public static function maybe_enqueue() {
        if ( ! self::page_has_shortcode() ) return;

        $base    = AIUCD_COMPANION_URL . 'static/companion/';
        $css_dir = AIUCD_COMPANION_DIR . 'static/companion/assets/css/';
        $js_dir  = AIUCD_COMPANION_DIR . 'static/companion/assets/js/';

        $ver = self::version();

        // ── Google Fonts ────────────────────────────────────────────────
        wp_enqueue_style(
            'aiucd-google-fonts',
            'https://fonts.googleapis.com/css2?family=Cardo:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;500;600;700;800&display=swap',
            array(),
            null
        );

        // ── Leaflet + markercluster (CSS) ───────────────────────────────
        wp_enqueue_style( 'leaflet',                'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', array(), '1.9.4' );
        wp_enqueue_style( 'leaflet-markercluster',  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css', array(), '1.5.3' );
        wp_enqueue_style( 'leaflet-markercluster-d','https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css', array(), '1.5.3' );

        // ── Leaflet + markercluster + D3 + Chart.js (JS) ────────────────
        wp_enqueue_script( 'leaflet',               'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', array(), '1.9.4', true );
        wp_enqueue_script( 'leaflet-markercluster', 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js', array( 'leaflet' ), '1.5.3', true );
        wp_enqueue_script( 'd3',                    'https://cdn.jsdelivr.net/npm/d3@7.8.5/dist/d3.min.js', array(), '7.8.5', true );
        wp_enqueue_script( 'chartjs',               'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js', array(), '4.4.0', true );

        // ── CSS companion (in ordine di dipendenza) ─────────────────────
        // `wp-embed` viene per ultimo: contiene gli overrides scoped a
        // body.aiucd-companion-page che neutralizzano il chrome WP ridondante
        // (page title H1, brand duplicato, layout) senza impattare lo
        // standalone (dove la classe sul body non esiste).
        $css_files = array(
            'tokens', 'base', 'program', 'path', 'mappa', 'cagliari',
            'catalog', 'poster', 'numeri', 'drawer', 'mobile-nav',
            'glyphs', 'avatar', 'wp-embed',
        );
        foreach ( $css_files as $name ) {
            $file = $css_dir . $name . '.css';
            if ( file_exists( $file ) ) {
                wp_enqueue_style( "aiucd-$name", $base . "assets/css/$name.css", array(), $ver );
            }
        }

        // ── JS entry-point (ES module) ──────────────────────────────────
        wp_enqueue_script(
            'aiucd-companion-app',
            $base . 'assets/js/app.js',
            array( 'leaflet', 'leaflet-markercluster', 'd3', 'chartjs' ),
            $ver,
            true
        );
    }

    /**
     * Carica CSS/JS del FAB globale di Noa su TUTTE le pagine del sito,
     * tranne quelle che contengono già lo shortcode (lì il FAB pieno è
     * già renderizzato dal partial e gestito da app.js).
     *
     * Self-contained: file leggeri, nessuna dipendenza dal bundle companion.
     */
    public static function enqueue_global_fab() {
        if ( is_admin() ) return;
        if ( self::page_has_shortcode() ) return;

        $base = AIUCD_COMPANION_URL . 'static/companion/';
        $ver  = self::version();

        wp_enqueue_style(
            'aiucd-noa-fab-global',
            $base . 'assets/css/noa-fab-global.css',
            array(),
            $ver
        );
        wp_enqueue_script(
            'aiucd-noa-fab-global',
            $base . 'assets/js/noa-fab-global.js',
            array(),
            $ver,
            true
        );
    }

    /**
     * Renderizza il markup del FAB globale + bubble di benvenuto nel <footer>.
     * Funziona come bridge: il FAB è un <a> che porta alla pagina del companion
     * con `?noa=1#noa`, parametri letti da noa-drawer.js per aprire il drawer
     * automaticamente all'arrivo.
     *
     * Non emette nulla:
     *   - in admin
     *   - sulla pagina del companion (FAB già nel partial)
     *   - se non è stata identificata una pagina target (companion mancante)
     */
    public static function render_global_fab() {
        if ( is_admin() ) return;
        if ( self::page_has_shortcode() ) return;

        $bridge_url = self::bridge_url();
        if ( ! $bridge_url ) return;

        $lang = AIUCD_Companion_Polylang::current_lang();
        $is_en = ( $lang === 'en' );

        $label   = $is_en ? 'Ask Noa' : 'Chiedi a Noa';
        $aria    = $is_en ? 'Ask Noa, your conference companion guide' : 'Chiedi a Noa, la tua guida del convegno';
        $bub_h   = $is_en ? "Hi, I'm Noa" : 'Ciao, sono Noa';
        $bub_b   = $is_en
            ? 'I can guide you through the AIUCD 2026 conference: paths, agenda, things to do in Cagliari.'
            : 'Posso guidarti tra le tre giornate di AIUCD 2026: percorsi, agenda, cose da fare a Cagliari.';
        $bub_x   = $is_en ? 'Close' : 'Chiudi';

        // Glifo SVG inline — minimale, evita dipendenze da glyphs.css.
        $icon = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
              . '<path d="M12 2a7 7 0 0 0-7 7v3.27c0 .55-.22 1.08-.61 1.46L3 15.12V17h18v-1.88l-1.39-1.39A2.07 2.07 0 0 1 19 12.27V9a7 7 0 0 0-7-7Zm-2 18a2 2 0 1 0 4 0h-4Z" fill="currentColor"/>'
              . '</svg>';
        ?>
        <a id="noa-fab-global"
           href="<?php echo esc_url( $bridge_url ); ?>"
           aria-label="<?php echo esc_attr( $aria ); ?>"
           data-lang="<?php echo esc_attr( $lang ); ?>">
          <span class="noa-fab-global-icon" aria-hidden="true"><?php echo $icon; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped — SVG statico ?></span>
          <span class="noa-fab-global-label"><?php echo esc_html( $label ); ?></span>
        </a>
        <aside id="noa-fab-bubble" role="complementary" aria-labelledby="noa-fab-bubble-title">
          <strong id="noa-fab-bubble-title"><?php echo esc_html( $bub_h ); ?></strong>
          <span><?php echo esc_html( $bub_b ); ?></span>
          <button type="button" class="noa-fab-bubble-close" aria-label="<?php echo esc_attr( $bub_x ); ?>">×</button>
        </aside>
        <?php
    }

    /**
     * Risolve l'URL della pagina che contiene lo shortcode [aiucd_companion]
     * nella lingua corrente. Cache statica per turn (più chiamate nello stesso
     * request non ripetono la query). Aggiunge ?noa=1#noa come gancio per
     * l'autoapertura del drawer.
     */
    private static function bridge_url() {
        static $cached_url = null;
        static $cached_lang = null;

        $lang = AIUCD_Companion_Polylang::current_lang();
        if ( $cached_url !== null && $cached_lang === $lang ) {
            return $cached_url;
        }

        $page_id = self::find_companion_page_id( $lang );
        $cached_lang = $lang;
        if ( ! $page_id ) {
            $cached_url = false;
            return false;
        }

        $url = get_permalink( $page_id );
        if ( ! $url ) {
            $cached_url = false;
            return false;
        }

        $cached_url = add_query_arg( 'noa', '1', $url ) . '#noa';
        return $cached_url;
    }

    /**
     * Trova l'ID della pagina (lingua corrente) che contiene lo shortcode
     * [aiucd_companion]. Polylang-aware: cerca prima la pagina nella lingua
     * corrente; fallback su qualunque lingua se la traduzione manca.
     */
    private static function find_companion_page_id( $lang ) {
        $args = array(
            'post_type'      => 'page',
            'post_status'    => 'publish',
            'posts_per_page' => 1,
            's'              => '[' . AIUCD_Companion_Shortcode::TAG, // grezzo ma sufficiente
            'fields'         => 'ids',
            'no_found_rows'  => true,
        );
        if ( function_exists( 'pll_get_post' ) ) {
            $args['lang'] = $lang;
        }

        $q = get_posts( $args );
        if ( ! empty( $q ) ) {
            $candidate = $q[0];
            // Conferma che lo shortcode ci sia davvero (s='[aiucd_companion' è
            // un match testuale: filtriamo per certezza).
            $post = get_post( $candidate );
            if ( $post && has_shortcode( $post->post_content, AIUCD_Companion_Shortcode::TAG ) ) {
                return $candidate;
            }
        }

        // Fallback: cerca senza vincolo di lingua.
        if ( isset( $args['lang'] ) ) {
            unset( $args['lang'] );
            $q = get_posts( $args );
            if ( ! empty( $q ) ) {
                $post = get_post( $q[0] );
                if ( $post && has_shortcode( $post->post_content, AIUCD_Companion_Shortcode::TAG ) ) {
                    return $q[0];
                }
            }
        }

        return 0;
    }

    /**
     * Forza type="module" sullo script entry-point del companion.
     * Tutti gli import interni (es. data.js, app.js) sono ES module
     * e devono essere caricati di conseguenza.
     */
    public static function module_type( $tag, $handle, $src ) {
        if ( $handle === 'aiucd-companion-app' ) {
            return '<script type="module" src="' . esc_url( $src ) . '" id="' . esc_attr( $handle ) . '-js"></script>' . "\n";
        }
        return $tag;
    }

    /**
     * Versionamento: combina la versione del manifest (cambia ad ogni build dati)
     * con il mtime del file app.js (cambia ad ogni edit del codice). In questo
     * modo sia le modifiche al codice sia le ribuild dei dati invalidano la cache.
     */
    private static function version() {
        $parts = array();

        $manifest = AIUCD_COMPANION_DIR . 'static/data/generated/manifest.json';
        if ( file_exists( $manifest ) ) {
            $json = json_decode( file_get_contents( $manifest ), true );
            if ( ! empty( $json['version'] ) ) $parts[] = (string) $json['version'];
        }

        $app_js = AIUCD_COMPANION_DIR . 'static/companion/assets/js/app.js';
        if ( file_exists( $app_js ) ) $parts[] = (string) filemtime( $app_js );

        if ( empty( $parts ) ) return AIUCD_COMPANION_VERSION;
        return implode( '-', $parts );
    }
}
