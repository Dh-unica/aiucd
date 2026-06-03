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
		add_action( 'wp_footer', array( __CLASS__, 'install_ui' ), 100 );
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
	 * UI di installazione (banner "Installa l'app")
	 * --------------------------------------------------------------------- */

	/**
	 * Inietta un banner dismissibile "Installa l'app" sulla pagina del companion.
	 *
	 * Razionale: il prompt nativo del browser è inaffidabile (Chrome lo mostra
	 * una sola volta e poi lo sopprime ~90 giorni; iOS non lo mostra affatto).
	 * Catturando `beforeinstallprompt` mostriamo una nostra CTA "Installa" che
	 * riapre il dialog nativo on-demand; su iOS mostriamo le istruzioni manuali
	 * (Condividi → Aggiungi a Home). Non possiamo forzare l'installazione dove
	 * l'app è già installata o i criteri non sono soddisfatti: in quei casi il
	 * banner semplicemente non appare.
	 *
	 * Stato "rifiutato" salvato in localStorage (30 gg) per non essere invadenti.
	 */
	public static function install_ui() {
		if ( ! self::is_companion_page() ) {
			return;
		}

		$lang  = self::current_lang();
		$is_en = ( $lang === 'en' );
		$icon  = self::assets_url() . 'icon-192.png';

		$strings = $is_en ? array(
			'title' => 'Install the AIUCD 2026 app',
			'sub'   => 'Add it to your Home Screen: programme, map and your agenda always at hand, even offline.',
			'cta'   => 'Install',
			'ios'   => 'To install: tap Share, then “Add to Home Screen”.',
			'close' => 'Close',
		) : array(
			'title' => 'Installa l’app AIUCD 2026',
			'sub'   => 'Aggiungila alla schermata Home: programma, mappa e la tua agenda sempre a portata, anche offline.',
			'cta'   => 'Installa',
			'ios'   => 'Per installarla: tocca Condividi e poi «Aggiungi a Home».',
			'close' => 'Chiudi',
		);
		?>
<style>
.aiucd-install-banner{
  display:flex; align-items:center; gap:12px;
  margin:12px; padding:12px 38px 12px 14px;
  background:#fff; border:1px solid #e2e5ee; border-left:4px solid #000060;
  border-radius:14px; box-shadow:0 6px 20px rgba(0,0,32,.08);
  font-family:"Inter",system-ui,-apple-system,sans-serif; position:relative;
}
.aiucd-install-banner[hidden]{display:none;}
.aiucd-install-icon{width:44px;height:44px;border-radius:10px;flex-shrink:0;}
.aiucd-install-text{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1;}
.aiucd-install-text strong{font-size:14px;color:#000060;font-weight:700;line-height:1.2;}
.aiucd-install-sub{font-size:12px;color:#5b6478;line-height:1.35;}
.aiucd-install-cta{
  flex-shrink:0; border:0; cursor:pointer; background:#d8613c; color:#fff;
  font:700 13px/1 "Inter",system-ui,-apple-system,sans-serif;
  padding:10px 16px; border-radius:999px;
  transition:background .15s ease, transform .15s ease;
}
.aiucd-install-cta:hover{background:#c2542f;transform:translateY(-1px);}
.aiucd-install-cta:active{transform:translateY(0);}
.aiucd-install-cta:focus-visible{outline:2px solid #000060;outline-offset:2px;}
.aiucd-install-close{
  position:absolute; top:6px; right:8px; border:0; background:transparent;
  cursor:pointer; font-size:20px; line-height:1; color:#9aa1b2;
  width:28px; height:28px; border-radius:50%;
}
.aiucd-install-close:hover{color:#5b6478;background:#f1f2f6;}
.aiucd-install-banner--ios .aiucd-install-cta{display:none;}
@media (max-width:420px){
  .aiucd-install-text strong{font-size:13px;}
  .aiucd-install-sub{font-size:11px;}
  .aiucd-install-cta{padding:9px 13px;font-size:12px;}
}
@media (prefers-reduced-motion:reduce){
  .aiucd-install-cta{transition:none;}
}
</style>
<script>
(function () {
  var S    = <?php echo wp_json_encode( $strings ); ?>;
  var ICON = <?php echo wp_json_encode( esc_url_raw( $icon ) ); ?>;
  var DISMISS_KEY = 'aiucd-pwa-install-dismissed';
  var DISMISS_DAYS = 30;

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
           window.navigator.standalone === true;
  }
  // Già installata → niente banner.
  if (isStandalone()) return;
  // Rifiutata di recente → rispetta la scelta.
  try {
    var d = localStorage.getItem(DISMISS_KEY);
    if (d && (Date.now() - parseInt(d, 10)) < DISMISS_DAYS * 864e5) return;
  } catch (e) {}

  var ua = navigator.userAgent || '';
  var isIOS = /iphone|ipad|ipod/i.test(ua) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  var deferred = null;
  var banner = null;

  function persistDismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) {}
  }
  function dismiss() {
    persistDismiss();
    if (banner) banner.hidden = true;
  }
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }
  function build(mode) {
    if (banner) return banner;
    var root = document.getElementById('aiucd-companion-root') || document.body;
    banner = document.createElement('div');
    banner.className = 'aiucd-install-banner' + (mode === 'ios' ? ' aiucd-install-banner--ios' : '');
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', S.title);
    banner.hidden = true;

    var img = document.createElement('img');
    img.className = 'aiucd-install-icon'; img.src = ICON; img.alt = '';
    var txt = document.createElement('div'); txt.className = 'aiucd-install-text';
    var strong = document.createElement('strong'); strong.textContent = S.title;
    var sub = document.createElement('span'); sub.className = 'aiucd-install-sub';
    sub.textContent = (mode === 'ios' ? S.ios : S.sub);
    txt.appendChild(strong); txt.appendChild(sub);
    var cta = document.createElement('button');
    cta.type = 'button'; cta.className = 'aiucd-install-cta'; cta.textContent = S.cta;
    var close = document.createElement('button');
    close.type = 'button'; close.className = 'aiucd-install-close';
    close.setAttribute('aria-label', S.close); close.innerHTML = '&times;';

    cta.addEventListener('click', function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function (choice) {
        if (choice && choice.outcome === 'accepted') {
          if (banner) banner.hidden = true;
        } else {
          dismiss();
        }
        deferred = null;
      });
    });
    close.addEventListener('click', dismiss);

    banner.appendChild(img); banner.appendChild(txt);
    banner.appendChild(cta); banner.appendChild(close);
    root.insertBefore(banner, root.firstChild);
    return banner;
  }
  function show(mode) {
    ready(function () { build(mode).hidden = false; });
  }

  // Android / Chromium: cattura l'evento e mostra la CTA "Installa".
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    show('android');
  });
  // Installata con successo → nascondi e ricorda.
  window.addEventListener('appinstalled', function () {
    persistDismiss();
    if (banner) banner.hidden = true;
    deferred = null;
  });
  // iOS: nessun beforeinstallprompt → istruzioni manuali (solo se non già a Home).
  if (isIOS) {
    ready(function () { if (!isStandalone()) show('ios'); });
  }
})();
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
		// Bump manuale di questa stringa per forzare l'aggiornamento del Service
		// Worker (e quindi lo svuotamento della runtime cache) sui dispositivi che
		// hanno già installato la PWA, anche quando cambiano solo gli asset del
		// companion (il cui mtime non incide su questa versione).
		$parts = array( '1.0.1' );
		foreach ( array( __FILE__, __DIR__ . '/aiucd-pwa/icon-512.png' ) as $f ) {
			if ( file_exists( $f ) ) {
				$parts[] = (string) filemtime( $f );
			}
		}
		return implode( '-', $parts );
	}
}

AIUCD_PWA::register();
