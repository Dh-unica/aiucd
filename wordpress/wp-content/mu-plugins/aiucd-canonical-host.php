<?php
/**
 * Plugin Name: AIUCD Canonical Host (no-www)
 * Description: Forza il dominio canonico di produzione SENZA www
 *              (https://aiucd2026.unica.it): allinea home/siteurl e mantiene
 *              coerente la cache lingue di Polylang. Senza questo, col
 *              redirect www -> non-www del reverse proxy si creerebbe un
 *              loop infinito (proxy: www -> non-www ; WordPress/Polylang:
 *              non-www -> www). In sviluppo locale (localhost / IP LAN) e' un
 *              NO-OP completo.
 *
 *              NOTA: .env (WORDPRESS_URL) e wp-config.php non sono versionati
 *              e il deploy preserva le copie presenti sul server, quindi
 *              questo mu-plugin e' l'unico punto d'intervento sull'URL
 *              canonico deployabile via Git / GitHub Actions.
 *
 * @package aiucd
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// Dominio canonico di produzione: sempre HTTPS e SENZA www.
if ( ! defined( 'AIUCD_CANONICAL_URL' ) ) {
	define( 'AIUCD_CANONICAL_URL', 'https://aiucd2026.unica.it' );
}

if ( ! function_exists( 'aiucd_is_production_host' ) ) {
	/**
	 * Vero se la richiesta corrente riguarda l'installazione di produzione
	 * AIUCD. Copre anche i contesti senza host HTTP (WP-CLI, WP-Cron)
	 * riconoscendo la produzione dalla costante WP_HOME.
	 *
	 * @return bool
	 */
	function aiucd_is_production_host() {
		$prod_hosts = array( 'aiucd2026.unica.it', 'www.aiucd2026.unica.it' );

		if ( ! empty( $_SERVER['HTTP_HOST'] ) ) {
			return in_array( strtolower( (string) $_SERVER['HTTP_HOST'] ), $prod_hosts, true );
		}

		if ( defined( 'WP_HOME' ) ) {
			$home_host = strtolower( (string) parse_url( WP_HOME, PHP_URL_HOST ) );
			return in_array( $home_host, $prod_hosts, true );
		}

		return false;
	}
}

if ( ! function_exists( 'aiucd_heal_polylang_languages_cache' ) ) {
	/**
	 * Invalida la cache lingue di Polylang (transient pll_languages_list) se
	 * contiene home/search URL non allineati al dominio canonico: al rebuild
	 * Polylang li ricalcola da home_url(), gia' forzato al non-www.
	 * Idempotente: a cache coerente non fa nulla.
	 *
	 * @return void
	 */
	function aiucd_heal_polylang_languages_cache() {
		$cached = get_transient( 'pll_languages_list' );
		if ( ! is_array( $cached ) ) {
			return;
		}

		foreach ( $cached as $language ) {
			$home_url = '';
			if ( is_array( $language ) && isset( $language['home_url'] ) ) {
				$home_url = (string) $language['home_url'];
			} elseif ( is_object( $language ) && isset( $language->home_url ) ) {
				$home_url = (string) $language->home_url;
			}

			if ( '' !== $home_url && 0 !== strpos( $home_url, AIUCD_CANONICAL_URL ) ) {
				delete_transient( 'pll_languages_list' );
				return;
			}
		}
	}
}

if ( aiucd_is_production_host() ) {

	// 1) Forza home/siteurl. pre_option_* scavalca sia il valore in DB sia la
	//    costante WP_HOME / WP_SITEURL definita in wp-config.php.
	$aiucd_force_canonical = static function () {
		return AIUCD_CANONICAL_URL;
	};
	add_filter( 'pre_option_home', $aiucd_force_canonical, PHP_INT_MAX );
	add_filter( 'pre_option_siteurl', $aiucd_force_canonical, PHP_INT_MAX );

	// 2) Allinea subito la cache lingue di Polylang, prima che il plugin la
	//    legga (mu-plugin caricato prima dei plugin normali).
	aiucd_heal_polylang_languages_cache();
}
