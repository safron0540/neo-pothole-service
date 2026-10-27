"""Загрузка всех проезжих дорог Томска из OSM: python -m scripts.load_roads

Кроме улиц из street_groups.csv загружаются остальные дороги, в том числе дворовые
проезды (highway=service). Без этого яма во дворе не находит улицу и остаётся без
адреса и срока. Группа берётся из street_groups.csv, у остальных дорог — DEFAULT_GROUP;
диспетчер может поменять её в справочнике, повторная загрузка его выбор не затирает.
Район — тот административный район, в котором лежит середина дороги.
Ключи: --file ответ.json (без сети), --save ответ.json (сохранить ответ).
"""

import argparse

from sqlalchemy import Connection, text

from app.core import rules
from scripts import load_zones, overpass
from scripts.load_streets import ROAD_TYPES, line_ewkt, read_groups

# [D] Решение от 27.10: дороге не из списка (двор, проезд) ставится самая мягкая группа
DEFAULT_GROUP = "Е"
UNNAMED = rules.UNNAMED_ROAD  # дорога без названия в OSM: обычно проезд между домами
# Служебные дороги, где ям не чинят по заявкам: проезд через окно «МакАвто» и т. п.
SKIP_SERVICE = ("drive-through", "emergency_access")


def build_query() -> str:
    south, west, north, east = overpass.TOMSK_BBOX
    bbox = f"({south},{west},{north},{east})"
    districts = "|".join(name.split()[0] for name in load_zones.DISTRICTS)
    return (
        "[out:json][timeout:300];("
        f'way{bbox}["highway"~"{ROAD_TYPES}"];'
        f'way{bbox}["highway"="service"]["access"!~"^(private|no)$"];'
        f'rel{bbox}["boundary"="administrative"]["name"~"^({districts}) район$"];'
        ");out geom;"
    )


def is_road(way: dict) -> bool:
    tags = way.get("tags", {})
    return (
        way.get("type") == "way"
        and len(way.get("geometry") or []) >= 2
        and tags.get("service") not in SKIP_SERVICE
    )


def load(conn: Connection, data: dict, groups: dict[str, dict[str, str]]) -> int:
    """Записывает дороги из ответа Overpass. Возвращает число обработанных кусков."""
    polygons = load_zones.district_polygons(conn, data)
    missing = [name for name in load_zones.DISTRICTS if name not in polygons]
    if missing:
        raise SystemExit(f"В ответе OSM нет границ: {', '.join(missing)}")
    for name in sorted(set(polygons) | {g["district"] for g in groups.values()}):
        conn.execute(
            text("INSERT INTO districts (name) VALUES (:n) ON CONFLICT (name) DO NOTHING"),
            {"n": name},
        )
    conn.execute(text("CREATE TEMP TABLE road_districts (id bigint, geom geometry)"))
    conn.execute(
        text(
            "INSERT INTO road_districts"
            " SELECT d.id, ST_GeomFromEWKT(p.geom) FROM districts d"
            " JOIN unnest(CAST(:names AS text[]), CAST(:geoms AS text[])) AS p(name, geom)"
            " ON p.name = d.name"
        ),
        {"names": list(polygons), "geoms": list(polygons.values())},
    )

    rows = []
    for way in data["elements"]:
        if not is_road(way):
            continue
        name = way.get("tags", {}).get("name")
        listed = groups.get(name)
        rows.append(
            {
                "osm_id": way["id"],
                "name": name or UNNAMED,
                "group": listed["street_group"] if listed else DEFAULT_GROUP,
                "listed": listed is not None,
                "district": listed["district"] if listed else None,
                "geom": line_ewkt(way["geometry"]),
            }
        )
    if rows:
        # Район из списка улиц главнее; иначе — район, где середина дороги (или ближайший).
        # Группу из списка обновляем всегда, а заданную диспетчером у прочих дорог не трогаем.
        conn.execute(
            text(
                "INSERT INTO streets (osm_id, name, street_group, district_id, geom)"
                " SELECT :osm_id, :name, :group, coalesce("
                "  (SELECT id FROM districts WHERE name = :district),"
                "  (SELECT rd.id FROM road_districts rd ORDER BY rd.geom <->"
                "   ST_LineInterpolatePoint(ST_GeomFromEWKT(:geom), 0.5) LIMIT 1)),"
                " ST_GeogFromText(:geom)"
                " ON CONFLICT (osm_id) DO UPDATE SET name = EXCLUDED.name,"
                " district_id = EXCLUDED.district_id, geom = EXCLUDED.geom,"
                " street_group = CASE WHEN :listed THEN EXCLUDED.street_group"
                " ELSE streets.street_group END"
            ),
            rows,
        )
    conn.execute(text("DROP TABLE road_districts"))
    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--file", help="ответ Overpass из файла (без сети)")
    parser.add_argument("--save", help="сохранить ответ Overpass в файл")
    args = parser.parse_args()

    from app.db import engine

    data = overpass.load_json(args.file) if args.file else overpass.query(build_query())
    if args.save:
        overpass.save_json(data, args.save)
    with engine.begin() as conn:
        count = load(conn, data, read_groups())
        by_group = conn.execute(
            text("SELECT street_group, count(*) FROM streets GROUP BY 1 ORDER BY 1")
        ).all()
    print(f"Дороги: загружено кусков {count}")
    print("По группам: " + ", ".join(f"{g or '—'} {n}" for g, n in by_group))


if __name__ == "__main__":
    main()
