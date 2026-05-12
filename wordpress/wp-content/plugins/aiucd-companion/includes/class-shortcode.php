<?php
/**
 * Shortcode [aiucd_companion]
 *
 * Renderizza il mount-point del companion dentro la pagina WordPress.
 * Inietta variabili globali (lingua corrente, URL base statici) consumate da app.js.
 * Il markup vero e proprio vive in static/companion/partials/body.php (sincronizzato
 * dal repo aiucd_stats).
 */

if ( ! defined( 'ABSPATH' ) ) exit;

class AIUCD_Companion_Shortcode {

    const TAG = 'aiucd_companion';

    public static function register() {
        add_shortcode( self::TAG, array( __CLASS__, 'render' ) );
    }

    public static function render( $atts = array(), $content = '' ) {
        $lang     = AIUCD_Companion_Polylang::current_lang();
        $base_url = AIUCD_COMPANION_URL . 'static/companion/';
        $data_url = AIUCD_COMPANION_URL . 'static/data/generated/';

        $body_partial = AIUCD_COMPANION_DIR . 'static/companion/partials/body.php';

        ob_start();
        ?>
        <script>
          window.AIUCD_LANG     = <?php echo wp_json_encode( $lang ); ?>;
          window.AIUCD_BASE_URL = <?php echo wp_json_encode( $base_url ); ?>;
          window.AIUCD_DATA_URL = <?php echo wp_json_encode( $data_url ); ?>;
        </script>
        <div id="aiucd-companion-root" data-lang="<?php echo esc_attr( $lang ); ?>">
        <?php
        if ( file_exists( $body_partial ) ) {
            // Il partial è statico: lo includiamo come PHP per poter
            // eventualmente injectare placeholder (es. URL upload immagini).
            include $body_partial;
        } else {
            echo '<p class="aiucd-error">Companion non ancora sincronizzato. Esegui <code>scripts/sync-companion-to-wp.sh</code>.</p>';
        }
        ?>
        </div>
        <?php
        return ob_get_clean();
    }
}
