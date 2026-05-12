<?php
/**
 * AIUCD Companion · body partial
 *
 * Markup interno del companion da renderizzare DENTRO una pagina WordPress
 * (via lo shortcode [aiucd_companion] del plugin aiucd-companion).
 *
 * Differenze rispetto a companion/index.html:
 *  - niente <html>/<head>/<body>/<title> (li mette WordPress)
 *  - niente <script type="module" src="..."> (lo enqueue il plugin)
 *  - i path delle immagini partner sono risolti via wp_upload_dir()
 *
 * Questo file è la fonte di verità per il rendering WP; ogni modifica al body
 * di companion/index.html va replicata qui (e viceversa).
 */
if ( ! defined( 'ABSPATH' ) ) {
    // Permette di servire il file anche in dev locale senza WP. In quel caso
    // facciamo un fallback "graceful" sul path relativo storico.
    if ( ! function_exists( 'aiucd_companion_upload_url' ) ) {
        function aiucd_companion_upload_url( $rel ) {
            return '../aiucd_site_static/wp-content/uploads/' . ltrim( $rel, '/' );
        }
    }
} else {
    if ( ! function_exists( 'aiucd_companion_upload_url' ) ) {
        function aiucd_companion_upload_url( $rel ) {
            $base = wp_upload_dir();
            return esc_url( $base['baseurl'] . '/' . ltrim( $rel, '/' ) );
        }
    }
}
?>
<!-- ===== TOPBAR ===== -->
<header class="topbar">
  <div class="topbar-inner">
    <a class="brand" href="#programma">
      <div class="brand-mark">
        <img src="<?php echo aiucd_companion_upload_url( '2025/12/logo_blu-1-150x150.png' ); ?>" alt="AIUCD 2026">
      </div>
      <div class="brand-text">
        <strong>AIUCD 2026 · Cagliari</strong>
        <small>3—5 giugno · Companion</small>
      </div>
    </a>
    <button class="live-indicator" id="live-indicator" type="button" data-state="pre" aria-label="Pre-convegno">
      <span class="live-indicator-text">
        <span class="live-indicator-label">Pre-convegno</span>
        <span class="live-indicator-detail" aria-hidden="true"></span>
      </span>
      <span class="live-indicator-progress" aria-hidden="true"><span class="live-indicator-progress-fill"></span></span>
    </button>
    <button class="topbar-agenda-btn" id="topbar-agenda-btn" type="button" aria-haspopup="dialog" aria-controls="agenda-drawer">
      <span class="topbar-agenda-icon icon icon--star-filled" aria-hidden="true"></span>
      <span class="topbar-agenda-label">Il mio AIUCD26</span>
      <span class="topbar-agenda-count" id="topbar-agenda-count" data-empty="true">0</span>
    </button>
  </div>
</header>

<!-- ===== TAB NAV ===== -->
<nav class="tab-nav">
  <div class="tab-nav-inner" role="tablist">
    <button class="tab-btn" role="tab" data-tab="catalogo" aria-selected="false">Esplora</button>
    <button class="tab-btn" role="tab" data-tab="programma" aria-selected="true"><span class="tab-countdown" id="tab-countdown-top" hidden></span><span class="tab-label">Programma</span></button>
    <button class="tab-btn" role="tab" data-tab="poster" aria-selected="false">Poster</button>
    <button class="tab-btn" role="tab" data-tab="mappa" aria-selected="false">Sede</button>
    <button class="tab-btn" role="tab" data-tab="cagliari" aria-selected="false">Esplora Cagliari</button>
    <button class="tab-btn" role="tab" data-tab="numeri" aria-selected="false">Cifre del convegno</button>
  </div>
</nav>

<!-- ===== MAIN ===== -->
<main>
  <section class="tab-section" data-tab="programma" data-active="true"><!-- renderProgram --></section>
  <section class="tab-section" data-tab="catalogo"><!-- renderCatalog --></section>
  <section class="tab-section" data-tab="poster"><!-- renderPoster --></section>
  <section class="tab-section" data-tab="mappa"><!-- renderMappa --></section>
  <section class="tab-section" data-tab="cagliari"><!-- renderCagliari --></section>
  <section class="tab-section" data-tab="numeri"><!-- renderNumeri --></section>
</main>

<!-- ===== PARTNER STRIP ===== -->
<footer class="partners-strip">
  <div class="partners-strip-inner">
    <div class="partners-label">Con il patrocinio e il sostegno di</div>
    <div class="partners-row">
      <a href="https://www.aiucd.it/" target="_blank" rel="noopener">
        <img src="<?php echo aiucd_companion_upload_url( '2025/12/logo_aiucd_trimmed-1.png' ); ?>" alt="AIUCD">
      </a>
      <a href="https://www.unica.it/" target="_blank" rel="noopener">
        <img src="<?php echo aiucd_companion_upload_url( '2025/12/dh_UNICA_BLACK-copia-1-300x138.png' ); ?>" alt="DH UNICA">
      </a>
      <a href="#" target="_blank" rel="noopener">
        <img src="<?php echo aiucd_companion_upload_url( '2025/12/logo_fondazione_sardegna-300x110.png' ); ?>" alt="Fondazione Sardegna">
      </a>
      <a href="#" target="_blank" rel="noopener">
        <img src="<?php echo aiucd_companion_upload_url( '2025/12/Logo-Parri-9-ets-copy-removebg-preview-300x86.png' ); ?>" alt="Istituto Parri">
      </a>
      <a href="#" target="_blank" rel="noopener">
        <img src="<?php echo aiucd_companion_upload_url( '2025/12/ISSASCO_logo_senza_testo_copia-removebg-preview-150x150.png' ); ?>" alt="ISSASCO">
      </a>
      <a href="#" target="_blank" rel="noopener">
        <img src="<?php echo aiucd_companion_upload_url( '2025/12/APEnet_grigio_CMYK-300x212.png' ); ?>" alt="APEnet">
      </a>
    </div>
  </div>
</footer>

<!-- ===== DRAWER · I miei talk ===== -->
<aside class="agenda-drawer" id="agenda-drawer" role="dialog" aria-modal="true" aria-labelledby="agenda-drawer-title" data-open="false" hidden><!-- Render via JS --></aside>
<div class="agenda-drawer-backdrop" id="agenda-drawer-backdrop" data-open="false" hidden></div>

<!-- ===== OVERLAY · Percorsi suggeriti ===== -->
<aside class="paths-overlay" id="paths-overlay" role="dialog" aria-modal="true" aria-labelledby="paths-overlay-title" data-open="false" hidden><!-- Render via JS --></aside>
<div class="paths-overlay-backdrop" id="paths-overlay-backdrop" data-open="false" hidden></div>

<!-- ===== NOA · drawer (sinistra) + FAB sempre visibile ===== -->
<aside class="noa-drawer" id="noa-drawer" role="dialog" aria-modal="true" aria-labelledby="noa-drawer-title" data-open="false" hidden><!-- Render via JS --></aside>
<div class="noa-drawer-backdrop" id="noa-drawer-backdrop" data-open="false" hidden></div>
<button class="noa-fab" id="noa-fab" type="button" aria-label="Apri Noa, la tua guida del convegno" aria-controls="noa-drawer" aria-haspopup="dialog" data-has-suggestion="false">
  <span class="glyph glyph--memories" aria-hidden="true"></span>
</button>

<!-- ===== MOBILE BOTTOM NAV (visibile solo su mobile, vedi mobile-nav.css) ===== -->
<nav class="mobile-bottom-nav" aria-label="Navigazione principale">
  <div class="mobile-bottom-nav-inner" role="tablist">
    <button class="mb-tab" type="button" role="tab" data-tab="catalogo" aria-selected="false">
      <span class="mb-tab-icon" aria-hidden="true">⌕</span>
      <span class="mb-tab-label">Esplora</span>
    </button>
    <button class="mb-tab" type="button" role="tab" data-tab="programma" aria-selected="true">
      <span class="mb-tab-icon" aria-hidden="true">▦</span>
      <span class="mb-tab-label"><span class="mb-tab-countdown" id="tab-countdown-mobile" hidden></span>Programma</span>
    </button>
    <button class="mb-tab" type="button" role="tab" data-tab="poster" aria-selected="false">
      <span class="mb-tab-icon" aria-hidden="true">▥</span>
      <span class="mb-tab-label">Poster</span>
    </button>
    <button class="mb-tab" type="button" role="tab" data-tab="mappa" aria-selected="false">
      <span class="mb-tab-icon" aria-hidden="true">⌖</span>
      <span class="mb-tab-label">Sede</span>
    </button>
    <button class="mb-tab" type="button" role="tab" data-tab="cagliari" aria-selected="false">
      <span class="mb-tab-icon" aria-hidden="true">⬢</span>
      <span class="mb-tab-label">Cagliari</span>
    </button>
    <button class="mb-tab" type="button" role="tab" data-tab="numeri" aria-selected="false">
      <span class="mb-tab-icon" aria-hidden="true">∑</span>
      <span class="mb-tab-label">Cifre</span>
    </button>
  </div>
</nav>
