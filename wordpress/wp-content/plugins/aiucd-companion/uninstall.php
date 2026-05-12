<?php
/**
 * AIUCD Companion · uninstall
 * Rimuove opzioni e flush delle rewrite (le static/ non vengono toccate,
 * sono dati versionati).
 */
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) exit;

delete_option( 'aiucd_companion_version' );
flush_rewrite_rules();
