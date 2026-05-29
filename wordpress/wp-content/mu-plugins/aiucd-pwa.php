<?php
/**
 * Plugin Name: AIUCD PWA
 * Description: Rende installabile come PWA la pagina del Companion AIUCD 2026
 *              ([aiucd_companion]). Serve un Web App Manifest e un Service
 *              Worker come file virtuali alla root del sito (scope corretto),
 *              e inietta meta/icone solo sulla pagina del companion.
 *              Polylang-aware (IT/EN). Nessuna dipendenza esterna.
 * Author:      DH UNICA + Linkalab
 * Version:     1.0.0
 *
 * Endpoint virtuali (intercettati su `init`, non sono file reali):
 *   /aiucd-companion.webmanifest   → manifest JSON (accetta ?lang=it|en)
 *   /aiucd-companion-sw.js         → service worker (scope '/')
 *
 * Le icone sono file reali in mu-plugins/aiucd-pwa/.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AIUCD_PWA {

	/** Tag dello shortcode del companion (allineato a AIUCD_Companion_Shortcode::TAG). */
	const SHORTCODE = 'aiucd_companion';

	/** Slug degli endpoint virtuali (relativi alla home). */
	const MANIFEST_PATH = 'aiucd-companion.webmanifest';
	const SW_PATH       = 'aiucd-companion-sw.js';

	/** Colori di brand. */
	const THEME_COLOR      = '#000060'; // navy AIUCD (barra/status bar)
	const BACKGROUND_COLOR = '#fafaf7'; // off-white (splash screen — contrasta con l'icona navy)

	public static function register() {
		add_action( 'init',     array( __CLASS__, 'maybe_serve_virtual' ), 0 );
		add_action( 'wp_head',  array( __CLASS__, 'head_tags' ), 5 );
		add_action( 'wp_footer', array( __CLASS__, 'register_sw' ), 99 );
	}

	/* --------------------------------------------------------------------- *
	 * Endpoint virtuali (manifest + service worker)
	 * --------------------------------------------------------------------- */

	/**
	 * Intercetta le richieste agli endpoint virtuali PRIMA del routing WP e
	 * risponde direttamente. Serve il SW dalla root così che il suo scope
	 * di default sia '/' (controlla tutta l'origine).
	 */
	public static function maybe_serve_virtual() {
		$req = isset( $_SERVER['REQUEST_URI'] ) ? wp_parse_url( $_SERVER['REQUEST_URI'], PHP_URL_PATH ) : '';
		if ( ! $req ) {
			return;
		}

		$home_path = trim( (string) wp_parse_url( home_url( '/' ), PHP_URL_PATH ), '/' );
		$path      = trim( (string) $req, '/' );
		if ( $home_path !== '' && strpos( $path, $home_path ) === 0 ) {
			$path = trim( substr( $path, strlen( $home_path ) ), '/' );
		}

		if ( $path === self::MANIFEST_PATH ) {
			self::serve_manifest();
		} elseif ( $path === self::SW_PATH ) {
			self::serve_service_worker();
		}
	}

	private static function serve_manifest() {
		$lang = isset( $_GET['lang'] ) ? sanitize_key( wp_unslash( $_GET['lang'] ) ) : self::current_lang();
		$is_en = ( $lang === 'en' );

		$page_url = self::companion_page_url( $lang );
		$start    = $page_url ? $page_url : home_url( '/' );
		$scope    = $page_url ? ( wp_parse_url( $page_url, PHP_URL_PATH ) ?: '/' ) : '/';

		$base = self::assets_url();

		$manifest = array(
			'id'               => $scope,
			'name'             => $is_en ? 'AIUCD 2026 — Companion' : 'AIUCD 2026 — Companion',
			'short_name'       => 'AIUCD 2026',
			'description'      => $is_en
				? 'The companion for the AIUCD 2026 conference in Cagliari: programme, map, paths and Noa.'
				: 'Il companion del convegno AIUCD 2026 a Cagliari: programma, mappa, percorsi e Noa.',
			'lang'             => $is_en ? 'en' : 'it',
			'dir'              => 'ltr',
			'start_url'        => $start,
			'scope'            => $scope,
			'display'          => 'standalone',
			'orientation'      => 'any',
			'theme_color'      => self::THEME_COLOR,
			'background_color' => self::BACKGROUND_COLOR,
			'categories'       => array( 'education', 'events' ),
			'icons'            => array(
				array(
					'src'     => $base . 'icon-192.png',
					'sizes'   => '192x192',
					'type'    => 'image/png',
					'purpose' => 'any',
				),
				array(
					'src'     => $base . 'icon-512.png',
					'sizes'   => '512x512',
					'type'    => 'image/png',
					'purpose' => 'any',
				),
				array(
					'src'     => $base . 'icon-maskable-192.png',
					'sizes'   => '192x192',
					'type'    => 'image/png',
					'purpose' => 'maskable',
				),
				array(
					'src'     => $base . 'icon-maskable-512.png',
					'sizes'   => '512x512',
					'type'    => 'image/png',
					'purpose' => 'maskable',
				),
			),
		);

		nocache_headers();
		header( 'Content-Type: application/manifest+json; charset=utf-8' );
		echo wp_json_encode( $manifest );
		exit;
	}

	private static function serve_service_worker() {
		$version   = self::version();
		$start_url = self::companion_page_url( self::current_lang() );
		$start_url = $start_url ? $start_url : home_url( '/' );

		header( 'Content-Type: application/javascript; charset=utf-8' );
		header( 'Service-Worker-Allowed: /' );
		header( 'Cache-Control: no-cache' );

		$js = <<<'JS'
/* AIUCD 2026 — Service Worker. Runtime caching + offline fallback. */
const VERSION = '__VERSION__';
const RUNTIME = 'aiucd-runtime-' + VERSION;
const START_URL = '__START_URL__';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(RUNTIME).then((cache) => cache.add(START_URL).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith('aiucd-runtime-') && k !== RUNTIME)
          .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Navigazioni: network-first, fallback alla cache / start_url offline.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(RUNTIME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        const cached = await caches.match(req);
        return cached || (await caches.match(START_URL)) || Response.error();
      }
    })());
    return;
  }

  // Asset (CSS/JS/img, anche CDN): stale-while-revalidate.
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) {
        caches.open(RUNTIME).then((c) => c.put(req, res.clone()));
      }
      return res;
    }).catch(() => cached);
    return cached || network;
  })());
});
JS;

		$js = str_replace(
			array( '__VERSION__', '__START_URL__' ),
			array( esc_js( $version ), esc_url_raw( $start_url ) ),
			$js
		);

		echo $js; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped — JS statico, placeholder già escaped
		exit;
	}

	/* --------------------------------------------------------------------- *
	 * Iniezione su pagina companion
	 * --------------------------------------------------------------------- */

	public static function head_tags() {
		if ( ! self::is_companion_page() ) {
			return;
		}

		$lang     = self::current_lang();
		$base     = self::assets_url();
		$manifest = add_query_arg( 'lang', $lang, home_url( '/' . self::MANIFEST_PATH ) );
		$title    = 'AIUCD 2026';

		printf( "\n<!-- AIUCD PWA -->\n" );
		printf( '<link rel="manifest" href="%s">' . "\n", esc_url( $manifest ) );
		printf( '<meta name="theme-color" content="%s">' . "\n", esc_attr( self::THEME_COLOR ) );
		printf( '<meta name="mobile-web-app-capable" content="yes">' . "\n" );
		printf( '<meta name="apple-mobile-web-app-capable" content="yes">' . "\n" );
		printf( '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">' . "\n" );
		printf( '<meta name="apple-mobile-web-app-title" content="%s">' . "\n", esc_attr( $title ) );
		printf( '<link rel="apple-touch-icon" href="%s">' . "\n", esc_url( $base . 'apple-touch-icon.png' ) );
	}

	public static function register_sw() {
		if ( ! self::is_companion_page() ) {
			return;
		}
		$sw = home_url( '/' . self::SW_PATH );
		?>
<script>
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register(<?php echo wp_json_encode( $sw ); ?>, { scope: '/' })
      .catch(function (e) { console.warn('AIUCD PWA: SW registration failed', e); });
  });
}
</script>
		<?php
	}

	/* --------------------------------------------------------------------- *
	 * Helpers
	 * --------------------------------------------------------------------- */

	private static function is_companion_page() {
		if ( is_admin() || ! is_singular() ) {
			return false;
		}
		$post = get_post();
		return $post && has_shortcode( $post->post_content, self::SHORTCODE );
	}

	/** URL della pagina che contiene lo shortcode companion, nella lingua data. */
	private static function companion_page_url( $lang ) {
		$args = array(
			'post_type'      => 'page',
			'post_status'    => 'publish',
			'posts_per_page' => 1,
			's'              => '[' . self::SHORTCODE,
			'fields'         => 'ids',
			'no_found_rows'  => true,
		);
		if ( function_exists( 'pll_current_language' ) ) {
			$args['lang'] = $lang;
		}

		$ids = get_posts( $args );
		if ( empty( $ids ) && isset( $args['lang'] ) ) {
			unset( $args['lang'] );
			$ids = get_posts( $args );
		}
		foreach ( (array) $ids as $id ) {
			$p = get_post( $id );
			if ( $p && has_shortcode( $p->post_content, self::SHORTCODE ) ) {
				return get_permalink( $id );
			}
		}
		return '';
	}

	/** Lingua corrente ISO 639-1 (Polylang-aware, fallback locale → 'it'). */
	private static function current_lang() {
		if ( function_exists( 'pll_current_language' ) ) {
			$l = pll_current_language();
			if ( $l ) {
				return $l;
			}
		}
		$locale = function_exists( 'get_locale' ) ? get_locale() : 'it_IT';
		return substr( $locale, 0, 2 ) ?: 'it';
	}

	/** URL base della cartella icone (mu-plugins/aiucd-pwa/). */
	private static function assets_url() {
		return content_url( 'mu-plugins/aiucd-pwa/' );
	}

	/** Versione per cache-busting del SW: mtime di questo file + delle icone. */
	private static function version() {
		$parts = array( '1.0.0' );
		foreach ( array( __FILE__, __DIR__ . '/aiucd-pwa/icon-512.png' ) as $f ) {
			if ( file_exists( $f ) ) {
				$parts[] = (string) filemtime( $f );
			}
		}
		return implode( '-', $parts );
	}
}

AIUCD_PWA::register();
