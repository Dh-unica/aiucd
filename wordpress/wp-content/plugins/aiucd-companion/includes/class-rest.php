<?php
/**
 * Endpoint REST per la persistenza dell'agenda personale del companion.
 *
 * Perché esiste:
 *   L'agenda viene salvata lato client in localStorage (vedi assets/js/agenda.js).
 *   WebKit/Safari (Intelligent Tracking Prevention) cancella TUTTO lo
 *   "script-writable storage" — localStorage incluso — dopo ~7 giorni di uso del
 *   browser senza rivisita del sito come prima parte. Sui dispositivi mobili dei
 *   partecipanti questo svuota l'agenda dopo pochi giorni.
 *
 *   L'UNICO storage che sfugge a quel limite è un cookie IMPOSTATO DAL SERVER
 *   (header Set-Cookie), che ITP non considera scrivibile via script. Qui salviamo
 *   quindi gli ID dell'agenda in un cookie di prima parte server-set, usato come
 *   rete di sicurezza per ripristinare l'agenda quando localStorage viene azzerato.
 *
 * Privacy: cookie funzionale di prima parte, contiene solo gli ID dei talk scelti
 * dall'utente stesso. Nessun tracciamento, nessun dato di terze parti.
 */

if ( ! defined( 'ABSPATH' ) ) exit;

class AIUCD_Companion_Rest {

    const ROUTE_NS  = 'aiucd-companion/v1';
    const ROUTE     = '/agenda';
    const COOKIE    = 'aiucd2026_agenda';
    const TTL_DAYS  = 180;
    const MAX_ITEMS = 1000; // tetto difensivo: l'agenda reale è di pochi talk

    public static function register() {
        add_action( 'rest_api_init', array( __CLASS__, 'routes' ) );
    }

    public static function routes() {
        register_rest_route( self::ROUTE_NS, self::ROUTE, array(
            array(
                'methods'             => 'GET',
                'callback'            => array( __CLASS__, 'get_agenda' ),
                'permission_callback' => '__return_true',
            ),
            array(
                'methods'             => 'POST',
                'callback'            => array( __CLASS__, 'save_agenda' ),
                'permission_callback' => '__return_true',
            ),
        ) );
    }

    /**
     * Restituisce gli ID salvati nel cookie server-set dell'utente corrente.
     * Risposta sempre per-richiesta e non cacheabile.
     */
    public static function get_agenda( $request ) {
        $resp = new WP_REST_Response( array( 'ids' => self::read_cookie() ), 200 );
        $resp->header( 'Cache-Control', 'no-store, private, max-age=0' );
        return $resp;
    }

    /**
     * Persiste l'agenda nel cookie server-set. Riceve { "ids": [..] }.
     */
    public static function save_agenda( $request ) {
        $params = $request->get_json_params();
        $raw    = ( is_array( $params ) && isset( $params['ids'] ) && is_array( $params['ids'] ) )
            ? $params['ids']
            : array();

        $ids = self::sanitize_ids( $raw );

        self::set_cookie( wp_json_encode( $ids ) );

        $resp = new WP_REST_Response( array( 'ok' => true, 'count' => count( $ids ) ), 200 );
        $resp->header( 'Cache-Control', 'no-store, private, max-age=0' );
        return $resp;
    }

    /** Normalizza in lista di interi unici, ordinati, con tetto MAX_ITEMS. */
    private static function sanitize_ids( $raw ) {
        $out = array();
        foreach ( $raw as $id ) {
            if ( is_numeric( $id ) ) {
                $out[] = (int) $id;
            }
            if ( count( $out ) >= self::MAX_ITEMS ) {
                break;
            }
        }
        $out = array_values( array_unique( $out ) );
        sort( $out, SORT_NUMERIC );
        return $out;
    }

    /** Legge e valida gli ID dal cookie (tollerante a contenuti corrotti). */
    private static function read_cookie() {
        if ( empty( $_COOKIE[ self::COOKIE ] ) ) {
            return array();
        }
        $decoded = json_decode( wp_unslash( $_COOKIE[ self::COOKIE ] ), true );
        if ( ! is_array( $decoded ) ) {
            return array();
        }
        return self::sanitize_ids( $decoded );
    }

    /**
     * Scrive il cookie SERVER-SET (Set-Cookie). HttpOnly: il JS non ha bisogno di
     * leggerlo (lo recupera via GET), e così è certo che ITP non lo tratti come
     * storage scrivibile via script.
     */
    private static function set_cookie( $value ) {
        $opts = array(
            'expires'  => time() + self::TTL_DAYS * DAY_IN_SECONDS,
            'path'     => defined( 'COOKIEPATH' ) && COOKIEPATH ? COOKIEPATH : '/',
            'secure'   => is_ssl(),
            'httponly' => true,
            'samesite' => 'Lax',
        );
        if ( defined( 'COOKIE_DOMAIN' ) && COOKIE_DOMAIN ) {
            $opts['domain'] = COOKIE_DOMAIN;
        }
        if ( ! headers_sent() ) {
            setcookie( self::COOKIE, $value, $opts );
            // Rende il valore disponibile anche nella stessa richiesta.
            $_COOKIE[ self::COOKIE ] = $value;
        }
    }
}
