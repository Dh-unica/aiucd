<?php
// Ricifra i dati di Google Site Kit quando cambiano LOGGED_IN_KEY e LOGGED_IN_SALT.
// Site Kit li usa come chiave e sale (aes-256-ctr) per le credenziali OAuth e i token degli utenti;
// l'algoritmo è quello di Google\Site_Kit\Core\Storage\Data_Encryption.
//
// Si lancia nel container wordpress, da scripts/ruota-segreti.sh:
//   php -r "<questo file>" verso-stdin   porta i valori alla chiave e al sale letti da stdin (2 righe)
//   php -r "<questo file>" verso-env     li porta a quelli del container (ripristino)
//   php -r "<questo file>" verifica      conta quanti si decifrano con quelli del container
// "verso-*" è idempotente: un valore già cifrato con la destinazione resta com'è. Un valore che non si
// decifra con nessuna delle due coppie è già illeggibile per Site Kit: resta com'è e viene contato.
// Stampa sempre "site kit: N leggibili, M illeggibili, K non cifrati" (N con la chiave d'arrivo).
// Le credenziali del DB vengono dall'ambiente del container. Non stampa mai i valori.

const METODO = 'aes-256-ctr';

function decifra(string $raw, string $key, string $salt) {
	$bin = base64_decode($raw, true);
	if (false === $bin) {
		return null; // non cifrato: Site Kit lo legge così com'è
	}
	$len   = openssl_cipher_iv_length(METODO);
	$value = openssl_decrypt(substr($bin, $len), METODO, $key, 0, substr($bin, 0, $len));
	if (! $value || '' === $salt || substr($value, -strlen($salt)) !== $salt) {
		return false;
	}
	return substr($value, 0, -strlen($salt));
}

function cifra(string $value, string $key, string $salt): string {
	$iv = openssl_random_pseudo_bytes(openssl_cipher_iv_length(METODO));
	return base64_encode($iv . openssl_encrypt($value . $salt, METODO, $key, 0, $iv));
}

function esci(string $msg): void {
	fwrite(STDERR, "site kit: $msg\n");
	exit(1);
}

$modo = $argv[1] ?? '';
if (! in_array($modo, array('verso-stdin', 'verso-env', 'verifica'), true)) {
	esci('modo sconosciuto');
}
$env = array((string) getenv('WORDPRESS_LOGGED_IN_KEY'), (string) getenv('WORDPRESS_LOGGED_IN_SALT'));
$in  = array('', '');
if ('verifica' !== $modo) {
	$in = array_pad(array_map('trim', explode("\n", (string) stream_get_contents(STDIN))), 2, '');
	if (strlen($in[0]) < 32 || strlen($in[1]) < 32) {
		esci('servono chiave e sale su stdin');
	}
}
$coppie = array(
	'verso-stdin' => array($env, $in),
	'verso-env'   => array($in, $env),
	'verifica'    => array($env, $env),
);
list($da, $verso) = $coppie[ $modo ];

list($host, $port) = array_pad(explode(':', (string) getenv('WORDPRESS_DB_HOST')), 2, '3306');
$db = new mysqli($host, getenv('WORDPRESS_DB_USER'), getenv('WORDPRESS_DB_PASSWORD'), getenv('WORDPRESS_DB_NAME'), (int) $port);
$db->set_charset('utf8mb4');
$p = getenv('WORDPRESS_TABLE_PREFIX') ?: 'wp_';

$righe = array();
foreach ($db->query("SELECT option_id, option_value FROM {$p}options WHERE option_name IN ('googlesitekit_credentials', 'googlesitekit_adsense_ad_blocking_recovery_tag')") as $r) {
	$righe[] = array("{$p}options", 'option_value', 'option_id', (int) $r['option_id'], $r['option_value']);
}
foreach ($db->query("SELECT umeta_id, meta_value FROM {$p}usermeta WHERE meta_key IN ('{$p}googlesitekit_access_token', '{$p}googlesitekit_refresh_token')") as $r) {
	$righe[] = array("{$p}usermeta", 'meta_value', 'umeta_id', (int) $r['umeta_id'], $r['meta_value']);
}

$nuovi = array();
$conta = array('leggibili' => 0, 'illeggibili' => 0, 'non cifrati' => 0);
foreach ($righe as list($tabella, $colonna, $chiave, $id, $raw)) {
	$v = decifra($raw, $verso[0], $verso[1]);
	if (null === $v) {
		$conta['non cifrati']++;
		continue;
	}
	if (false !== $v) {
		$conta['leggibili']++;
		continue;
	}
	$v = 'verifica' === $modo ? false : decifra($raw, $da[0], $da[1]);
	if (! is_string($v)) {
		$conta['illeggibili']++;
		continue;
	}
	$c = cifra($v, $verso[0], $verso[1]);
	if (decifra($c, $verso[0], $verso[1]) !== $v) {
		esci('ricifratura non verificata');
	}
	$nuovi[] = array($tabella, $colonna, $chiave, $id, $c);
	$conta['leggibili']++;
}

$db->begin_transaction();
foreach ($nuovi as list($tabella, $colonna, $chiave, $id, $c)) {
	$st = $db->prepare("UPDATE $tabella SET $colonna = ? WHERE $chiave = ?");
	$st->bind_param('si', $c, $id);
	$st->execute();
}
$db->commit();
printf("site kit: %d leggibili, %d illeggibili, %d non cifrati (%d ricifrati)\n", $conta['leggibili'], $conta['illeggibili'], $conta['non cifrati'], count($nuovi));
