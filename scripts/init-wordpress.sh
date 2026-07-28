#!/bin/bash

# Script per inizializzare la struttura WordPress per sviluppo
# File: /home/ale/docker/aiucd/scripts/init-wordpress.sh

PROJECT_DIR="/home/ale/docker/aiucd"
WP_DIR="$PROJECT_DIR/wordpress"

echo "🚀 Inizializzazione struttura WordPress per sviluppo..."

# Ferma i container se attivi
if docker compose ps --services --filter "status=running" | grep -q wordpress; then
    echo "⏹️  Fermando container attivi..."
    docker compose down
fi

# Crea la directory WordPress se non esiste
if [ ! -d "$WP_DIR" ]; then
    echo "📁 Creando directory WordPress..."
    mkdir -p "$WP_DIR"
fi

# Se la directory WordPress è vuota, inizializza con i file core
if [ ! "$(ls -A $WP_DIR)" ]; then
    echo "⬇️  Scaricando WordPress core files..."
    
    # Usa un container temporaneo per copiare i file WordPress
    docker run --rm \
        -v "$WP_DIR:/dest" \
        wordpress:7.0.2-apache \
        bash -c "cp -r /usr/src/wordpress/* /dest/ && chown -R $(id -u):$(id -g) /dest"
    
    echo "✅ WordPress core files copiati"
fi

# Crea la struttura delle directory se non esistono
echo "📂 Creando struttura directory..."
mkdir -p "$WP_DIR/wp-content/themes"
mkdir -p "$WP_DIR/wp-content/plugins" 
mkdir -p "$WP_DIR/wp-content/uploads"

# Imposta i permessi corretti
echo "🔐 Impostando permessi..."
chmod -R 755 "$WP_DIR"
chmod -R 777 "$WP_DIR/wp-content/uploads"

# Crea un file .htaccess di base se non esiste
if [ ! -f "$WP_DIR/.htaccess" ]; then
    echo "⚙️  Creando .htaccess di base..."
    cat > "$WP_DIR/.htaccess" << 'EOF'
# BEGIN WordPress
RewriteEngine On
RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
RewriteBase /
RewriteRule ^index\.php$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.php [L]
# END WordPress
EOF
fi

# Crea un README per la directory WordPress
cat > "$WP_DIR/README-DEV.md" << 'EOF'
# WordPress Development Directory

Questa directory contiene i file WordPress per lo sviluppo.

## Struttura:
- `wp-content/themes/` - Temi personalizzati (versionati)
- `wp-content/plugins/` - Plugin personalizzati (versionati)  
- `wp-content/uploads/` - File caricati dagli utenti (NON versionati)
- `wp-config.php` - Configurazione (generata automaticamente)

## Note:
- I file core WordPress sono versionati per consistency
- Gli uploads sono gestiti da un volume Docker separato
- Modifica direttamente i file per lo sviluppo di temi/plugin
EOF

echo ""
echo "✅ Struttura WordPress inizializzata con successo!"
echo ""
echo "📁 Directory creata: $WP_DIR"
echo "🔧 Puoi ora:"
echo "   - Modificare temi in: $WP_DIR/wp-content/themes/"
echo "   - Aggiungere plugin in: $WP_DIR/wp-content/plugins/"
echo "   - Versionare il codice con git"
echo ""
echo "🚀 Avvia i servizi con: docker compose up -d"
echo "🌐 WordPress sarà disponibile su: http://localhost:8000"
