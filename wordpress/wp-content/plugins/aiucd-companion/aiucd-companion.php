<?php
/**
 * Plugin Name: AIUCD Companion
 * Plugin URI:  https://www.aiucd2026.unica.it/
 * Description: Integra il companion del convegno AIUCD 2026 (web app statica) in una pagina WordPress tramite shortcode [aiucd_companion]. Compatibile con Polylang IT/EN.
 * Version:     1.0.0
 * Author:      DH UNICA + Linkalab
 * License:     GPL-2.0-or-later
 * Text Domain: aiucd-companion
 * Requires PHP: 7.4
 * Requires at least: 6.0
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

define( 'AIUCD_COMPANION_VERSION', '1.0.0' );
define( 'AIUCD_COMPANION_FILE', __FILE__ );
define( 'AIUCD_COMPANION_DIR', plugin_dir_path( __FILE__ ) );
define( 'AIUCD_COMPANION_URL', plugin_dir_url( __FILE__ ) );

require_once AIUCD_COMPANION_DIR . 'includes/class-shortcode.php';
require_once AIUCD_COMPANION_DIR . 'includes/class-assets.php';
require_once AIUCD_COMPANION_DIR . 'includes/class-polylang.php';

add_action( 'plugins_loaded', function () {
    AIUCD_Companion_Shortcode::register();
    AIUCD_Companion_Assets::register();
    AIUCD_Companion_Polylang::register();
} );

register_activation_hook( __FILE__, function () {
    flush_rewrite_rules();
} );

register_deactivation_hook( __FILE__, function () {
    flush_rewrite_rules();
} );
