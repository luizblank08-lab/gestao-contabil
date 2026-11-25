#!/usr/bin/env bash
# Junta todas as etapas do banco num arquivo único para colar no SQL Editor do Supabase.
cd "$(dirname "$0")"
{ echo "-- ARQUIVO GERADO AUTOMATICAMENTE (npm run sql:juntar). Pode ser executado mais de uma vez."; for f in migrations/*.sql; do echo; echo "-- ===== $f ====="; cat "$f"; done; } > instalar-banco.sql
echo "Gerado: supabase/instalar-banco.sql"
