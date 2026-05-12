<?php
/**
 * Bridge con Polylang. Espone helper per lingua corrente e fallback.
 */

if ( ! defined( 'ABSPATH' ) ) exit;

class AIUCD_Companion_Polylang {

    public static function register() {
        // no-op: ci basta esporre static helpers
    }

    /**
     * Lingua corrente come codice ISO 639-1 ("it" o "en").
     * Fallback su default WP locale, poi "it".
     */
    public static function current_lang() {
        if ( function_exists( 'pll_current_language' ) ) {
            $lang = pll_current_language();
            if ( $lang ) return $lang;
        }
        $locale = function_exists( 'get_locale' ) ? get_locale() : 'it_IT';
        return substr( $locale, 0, 2 ) ?: 'it';
    }
}
