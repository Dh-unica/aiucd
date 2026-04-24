<?php
/**
 * STEP 3: Template Part - Header Menu Dinamico
 * 
 * Mostra il menu assegnato alla location 'primary'
 * Il menu cambia automaticamente in base alla lingua (gestito da functions.php)
 * 
 * @package AIUCD Theme
 */
?>
<nav class="wp-block-navigation" aria-label="<?php esc_attr_e( 'Primary menu', 'aiucd-theme' ); ?>">
    <?php
    wp_nav_menu( array(
        'theme_location'  => 'primary',
        'container'       => 'div',
        'container_class' => 'menu-menu-' . ( function_exists( 'pll_current_language' ) ? pll_current_language() : 'it' ) . '-container',
        'fallback_cb'     => false,
        'menu_class'      => 'menu',
    ) );
    ?>
</nav>

