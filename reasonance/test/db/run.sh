#!/bin/sh
# Runs the Ourgument database tests against a throwaway database on a plain
# local Postgres (no Supabase stack needed): a tiny stand-in for Supabase's
# auth schema and roles, then both migrations, then the checks.
#   PSQL="psql -h localhost -p 5432 -U postgres" sh test/db/run.sh
set -e
cd "$(dirname "$0")"
PSQL=${PSQL:-psql}
M=../../../chess3d/supabase/migrations
$PSQL -q -c "drop database if exists rs_test" -c "create database rs_test"
$PSQL -q -d rs_test -c "do \$\$ begin create role anon nologin; exception when duplicate_object then null; end \$\$" \
  -c "do \$\$ begin create role authenticated nologin; exception when duplicate_object then null; end \$\$"
sed '/^create role/d' supabase-stub.sql | $PSQL -q -d rs_test -v ON_ERROR_STOP=1
$PSQL -q -d rs_test -c "create publication supabase_realtime" 2>/dev/null
$PSQL -q -d rs_test -v ON_ERROR_STOP=1 -f $M/20261102120000_cube_chess.sql >/dev/null
$PSQL -q -d rs_test -v ON_ERROR_STOP=1 -f $M/20261105120000_reasonance.sql >/dev/null
$PSQL -q -d rs_test -v ON_ERROR_STOP=1 -f $M/20261105120000_reasonance.sql >/dev/null # safe to run twice
for f in 20261105230000_reasonance_neither.sql 20261105230000_reasonance_neither.sql; do
  $PSQL -q -d rs_test -v ON_ERROR_STOP=1 -f $M/$f >/dev/null
done
$PSQL -q -d rs_test -v ON_ERROR_STOP=1 -f database.test.sql | grep -q 'ALL PASSED'
# The example posts, on a fresh copy (twice, to show it's safe to rerun).
$PSQL -q -c "drop database if exists rs_test2" -c "create database rs_test2 template rs_test" >/dev/null
$PSQL -q -d rs_test2 -c "truncate rs_posts cascade" >/dev/null
$PSQL -q -d rs_test2 -v ON_ERROR_STOP=1 -f $M/20261105200000_reasonance_examples.sql 2>&1 | grep -i warning && exit 1
$PSQL -q -d rs_test2 -v ON_ERROR_STOP=1 -f $M/20261105200000_reasonance_examples.sql >/dev/null
$PSQL -q -d rs_test2 -v ON_ERROR_STOP=1 -f examples.test.sql | grep -q 'ALL PASSED'
# The newer examples replace the old ones, except posts someone else rated.
$PSQL -q -d rs_test2 -v ON_ERROR_STOP=1 -f examples-v2.before.sql >/dev/null
for i in 1 2; do
  $PSQL -q -d rs_test2 -v ON_ERROR_STOP=1 -f $M/20261106120000_ourgument_examples.sql 2>&1 | grep -i warning && exit 1
done
$PSQL -q -d rs_test2 -v ON_ERROR_STOP=1 -f examples-v2.test.sql | grep -q 'ALL PASSED'
echo 'Database tests passed.'
