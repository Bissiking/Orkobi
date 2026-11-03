#!/bin/sh
set -eu
# Mots de passe hexadécimaux produits par la recette isolée, jamais affichés.
case "$ORKOBI_MIGRATION_PASSWORD$ORKOBI_APP_PASSWORD" in *[!a-f0-9]*) exit 1;; esac
case "$MYSQL_DATABASE" in [a-z]*) ;; *) exit 1;; esac
case "$MYSQL_DATABASE" in *[!a-z0-9_]*) exit 1;; esac
[ "${#MYSQL_DATABASE}" -le 64 ]
[ "${#ORKOBI_MIGRATION_PASSWORD}" -ge 32 ]
[ "${#ORKOBI_APP_PASSWORD}" -ge 32 ]
client=mysql
command -v mariadb >/dev/null 2>&1 && client=mariadb
"$client" -uroot -p"$MYSQL_ROOT_PASSWORD" <<SQL
CREATE USER 'orkobi_migrator'@'%' IDENTIFIED BY '$ORKOBI_MIGRATION_PASSWORD';
CREATE USER 'orkobi_app'@'%' IDENTIFIED BY '$ORKOBI_APP_PASSWORD';
GRANT ALL PRIVILEGES ON \`$MYSQL_DATABASE\`.* TO 'orkobi_migrator'@'%' WITH GRANT OPTION;
SQL
