#!/usr/bin/env bash
# Roda os testes de permissão do banco num PostgreSQL local (sem Supabase).
# Usa as variáveis padrão do PostgreSQL: PGHOST, PGPORT, PGUSER (padrão: localhost, 5432, postgres).
set -euo pipefail
cd "$(dirname "$0")/../.."
export PGUSER="${PGUSER:-postgres}"
psql -d postgres -q -c "drop database if exists teste_gc" -c "create database teste_gc" 2>/dev/null
psql -d teste_gc -q -v ON_ERROR_STOP=1 -f supabase/tests/mock_supabase.sql 2>/dev/null
for f in supabase/migrations/*.sql; do psql -d teste_gc -q -v ON_ERROR_STOP=1 -f "$f" 2>/dev/null; done
psql -d teste_gc -v ON_ERROR_STOP=1 -f supabase/tests/test_etapa1.sql 2>&1 | sed 's/^psql:.*NOTICE:  //'
