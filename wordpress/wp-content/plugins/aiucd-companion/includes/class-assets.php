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
        add_filter( 'script_loader_tag', array( __CLASS__, 'module_type' ), 10, 3 );
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
        $css_files = array(
            'tokens', 'base', 'program', 'path', 'mappa', 'cagliari',
            'catalog', 'poster', 'numeri', 'drawer', 'mobile-nav',
            'glyphs', 'avatar',
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
