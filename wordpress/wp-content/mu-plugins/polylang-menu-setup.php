<?php
/**
 * Plugin Name: Polylang Menu Setup
 * Description: Shortcode per mostrare menu in base alla lingua corrente
 * Version: 4.1
 */

if ( ! defined( 'WPINC' ) ) {
    die;
}

/**
 * Test shortcode per verificare che il plugin sia caricato
 */
add_shortcode( 'test_menu', function() {
    return 'TEST SHORTCODE WORKS';
} );

/**
 * Shortcode: [language_menu]
 * Mostra il menu corretto per la lingua corrente
 */
add_shortcode( 'language_menu', function( $atts ) {
    // Verifica se Polylang è attivo
    if ( ! function_exists( 'pll_current_language' ) ) {
        return '<p style="color:red;">Polylang non trovato</p>';
    }

    $current_lang = pll_current_language();
    
    if ( empty( $current_lang ) ) {
        return '<p style="color:red;">Lingua corrente non riconosciuta</p>';
    }

    $menu_id = ( $current_lang === 'en' ) ? 37 : 25;

    // Mostra il menu
    ob_start();
    wp_nav_menu( array(
        'menu'        => $menu_id,
        'fallback_cb' => function() { return '<p>Menu vuoto</p>'; },
        'echo'        => true,
    ) );
    return ob_get_clean();
} );

/**
 * Shortcode: [polylang_switcher]
 *
 * Polylang Free non registra uno shortcode con questo nome. L'header FSE lo
 * usa però sia nelle parti salvate nel database sia nel template versionato:
 * senza questo bridge WordPress stampa quindi il testo letterale.
 */
add_shortcode( 'polylang_switcher', function() {
    if ( ! function_exists( 'pll_the_languages' ) ) {
        return '';
    }

    $languages = pll_the_languages( array(
        'raw'           => 1,
        'hide_if_empty' => 0,
    ) );

    if ( ! is_array( $languages ) || count( $languages ) < 2 ) {
        return '';
    }

    $items = array();

    foreach ( $languages as $language ) {
        if ( empty( $language['url'] ) || empty( $language['slug'] ) ) {
            continue;
        }

        $name       = ! empty( $language['name'] ) ? $language['name'] : strtoupper( $language['slug'] );
        $is_current = ! empty( $language['current_lang'] );
        $classes    = array( 'polylang-switcher__item', 'lang-item-' . sanitize_html_class( $language['slug'] ) );

        if ( $is_current ) {
            $classes[] = 'current-lang';
        }

        $link_attributes = sprintf(
            'href="%1$s" lang="%2$s" hreflang="%2$s" aria-label="%3$s"%4$s',
            esc_url( $language['url'] ),
            esc_attr( $language['slug'] ),
            esc_attr( sprintf( 'Passa a %s', $name ) ),
            $is_current ? ' aria-current="page"' : ''
        );

        if ( ! empty( $language['flag'] ) ) {
            $content = sprintf(
                '<img src="%1$s" alt="%2$s" width="16" height="11" loading="eager" decoding="async">',
                esc_url( $language['flag'] ),
                esc_attr( $name )
            );
        } else {
            $content = esc_html( strtoupper( $language['slug'] ) );
        }

        $items[] = sprintf(
            '<li class="%1$s"><a %2$s>%3$s</a></li>',
            esc_attr( implode( ' ', $classes ) ),
            $link_attributes,
            $content
        );
    }

    if ( count( $items ) < 2 ) {
        return '';
    }

    return sprintf(
        '<nav class="polylang-switcher" aria-label="%1$s"><ul class="polylang-switcher__list">%2$s</ul></nav>',
        esc_attr__( 'Selezione lingua', 'aiucd-theme' ),
        implode( '', $items )
    );
} );
