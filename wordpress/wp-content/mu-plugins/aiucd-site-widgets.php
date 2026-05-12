<?php
/**
 * Plugin Name: AIUCD Site Widgets
 * Description: Mostra in tutte le pagine del sito (header) due piccoli widget:
 *              (1) countdown verso l'apertura del convegno (T-N giorni / In corso / …)
 *              (2) contatore "★ Il mio AIUCD26" che riflette il localStorage
 *                  popolato dal companion. Click → /companion/?action=open-agenda.
 *              I widget si attaccano allo slot <div id="aiucd-site-widgets">
 *              renderizzato da themes/aiucd-theme/parts/header.html.
 *              Carico leggero: ~5KB combinati, nessun fetch di rete.
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_action( 'wp_enqueue_scripts', function () {
    $base = plugins_url( '', __FILE__ ) . '/aiucd-site-widgets';
    $dir  = __DIR__ . '/aiucd-site-widgets';

    // Versionamento: mtime dei sorgenti → cache busting automatico.
    $js_ver  = file_exists( "$dir/site-widgets.js" )  ? filemtime( "$dir/site-widgets.js" )  : '1';
    $css_ver = file_exists( "$dir/site-widgets.css" ) ? filemtime( "$dir/site-widgets.css" ) : '1';

    wp_enqueue_style(
        'aiucd-site-widgets',
        "$base/site-widgets.css",
        array(),
        $css_ver
    );
    wp_enqueue_script(
        'aiucd-site-widgets',
        "$base/site-widgets.js",
        array(),
        $js_ver,
        true
    );

    // Localizzazione: passa al JS lingua + URL del companion (per il link agenda).
    // Per la EN il companion è su /language/en/conference-app/, slug brandizzato.
    $lang = function_exists( 'pll_current_language' ) ? pll_current_language() : 'it';
    $companion_url_it = home_url( '/companion/' );
    $companion_url_en = home_url( '/language/en/conference-app/' );

    wp_add_inline_script(
        'aiucd-site-widgets',
        'window.AIUCD_SITE_CONFIG = ' . wp_json_encode( array(
            'lang'          => $lang,
            'companionUrlIt' => $companion_url_it,
            'companionUrlEn' => $companion_url_en,
            'openingISO'    => '2026-06-03T12:00:00+02:00', // CEST opening
            'closingISO'    => '2026-06-05T18:00:00+02:00', // CEST closing
            'agendaStorageKey' => 'aiucd2026-agenda',
        ) ) . ';',
        'before'
    );
}, 20 );
