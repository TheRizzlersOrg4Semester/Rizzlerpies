#!/bin/sh
set -eu

CERT_DIR="/etc/nginx/certs"
CERT_FILE="$CERT_DIR/rizzlerpies.dk.pem"
KEY_FILE="$CERT_DIR/rizzlerpies.dk-key.pem"

mkdir -p "$CERT_DIR"

if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -config /etc/nginx/openssl.cnf \
    -extensions v3_req
fi

exec nginx -g 'daemon off;'
