#!/bin/sh
# Роли и базы (D-006, скилл db-schema): app_owner — владелец схемы и миграций, app_user — приложение, без BYPASSRLS.
set -e
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres <<SQL
CREATE ROLE app_owner LOGIN PASSWORD '$APP_OWNER_PASSWORD';
CREATE ROLE app_user LOGIN PASSWORD '$APP_USER_PASSWORD' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE DATABASE dinastia OWNER app_owner;
CREATE DATABASE dinastia_test OWNER app_owner;
SQL
for db in dinastia dinastia_test; do
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$db" <<SQL
REVOKE ALL ON DATABASE $db FROM PUBLIC;
GRANT CONNECT ON DATABASE $db TO app_user;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO app_owner;
GRANT USAGE ON SCHEMA public TO app_user;
-- Таблицы создаёт app_owner (миграции); приложение получает только DML, без DDL.
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO app_user;
SQL
done
