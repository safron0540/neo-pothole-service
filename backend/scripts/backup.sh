#!/usr/bin/env sh
# Резервная копия базы и фото: запускать на сервере из корня репозитория (cron, раз в сутки).
#   ./backend/scripts/backup.sh [папка]        по умолчанию ./backups (в Git не идёт)
# Хранится KEEP_DAYS последних дней (по умолчанию 7): на сервере мало места.
#
# Восстановление на чистой машине:
#   docker compose up -d db
#   docker compose exec -T db pg_restore -U app -d potholes --clean --if-exists --no-owner < backups/db-ДАТА.dump
#   docker compose run --rm -T -v "$PWD/backups:/backups" backend tar -xzf /backups/photos-ДАТА.tar.gz -C /data/photos
#   docker compose up -d
set -eu

DIR="${1:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-7}"
STAMP="$(date -u +%Y%m%d-%H%M)"
DB_USER="${POSTGRES_USER:-app}"
DB_NAME="${POSTGRES_DB:-potholes}"

mkdir -p "$DIR"
# Сжатый формат pg_dump: восстанавливается pg_restore, в том числе по одной таблице
docker compose exec -T db pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$DIR/db-$STAMP.dump"
# Фото из тома photos; контейнер backend видит его как /data/photos
docker compose exec -T backend tar -czf - -C /data/photos . > "$DIR/photos-$STAMP.tar.gz"

find "$DIR" -name 'db-*.dump' -mtime +"$KEEP_DAYS" -delete
find "$DIR" -name 'photos-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
echo "Копия: $DIR/db-$STAMP.dump, $DIR/photos-$STAMP.tar.gz"
