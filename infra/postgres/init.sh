#!/bin/sh
set -eu
# Seulement au premier démarrage d'un volume vide. psql cite les valeurs et identifiants.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=ON_ERROR_STOP=1 <<'SQL'
\getenv migration_password ORKOBI_MIGRATION_PASSWORD
\getenv app_password ORKOBI_APP_PASSWORD
\getenv database POSTGRES_DB
CREATE ROLE orkobi_migrator LOGIN PASSWORD :'migration_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE orkobi_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
REVOKE ALL ON DATABASE :"database" FROM PUBLIC;
GRANT CONNECT, CREATE ON DATABASE :"database" TO orkobi_migrator;
GRANT CONNECT ON DATABASE :"database" TO orkobi_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
