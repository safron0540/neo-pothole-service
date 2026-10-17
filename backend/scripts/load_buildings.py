"""Загрузка домов с номерами вдоль улиц демо-территории: python -m scripts.load_buildings

Запускать после load_streets: берутся дома с тегом addr:housenumber не дальше 40 м
от загруженных улиц (автообработка ищет дом в радиусе 30 м). Точка дома — для контура
точка внутри контура (ST_PointOnSurface). Повтор обновляет дом по паре (тип, номер OSM).
В конце печатается покрытие: у какой доли кусков улиц есть дом в 30 м (В-35).
"""

import argparse

from sqlalchemy import Connection, text

from scripts import overpass

SEARCH_RADIUS_M = 40
OSM_TYPES = {"node": "n", "way": "w", "relation": "r"}


def build_query(street_osm_ids: list[int]) -> str:
    ids = ",".join(str(i) for i in street_osm_ids)
    tag = f'(around.s:{SEARCH_RADIUS_M})["addr:housenumber"]'
    return (
        f"[out:json][timeout:180];way(id:{ids})->.s;"
        f"node{tag};out;"
        f"way{tag};out geom;"
        f"relation{tag};out center;"
    )


def element_ewkt(element: dict) -> str | None:
    if element["type"] == "node":
        return f"SRID=4326;POINT({element['lon']} {element['lat']})"
    if element["type"] == "relation" and "center" in element:
        center = element["center"]
        return f"SRID=4326;POINT({center['lon']} {center['lat']})"
    geometry = element.get("geometry") or []
    points = ", ".join(f"{p['lon']} {p['lat']}" for p in geometry)
    if len(geometry) >= 4 and geometry[0] == geometry[-1]:
        return f"SRID=4326;POLYGON(({points}))"
    if len(geometry) >= 2:
        return f"SRID=4326;LINESTRING({points})"
    return None


def load(conn: Connection, data: dict) -> int:
    count = 0
    for element in data["elements"]:
        house_number = element.get("tags", {}).get("addr:housenumber")
        ewkt = element_ewkt(element)
        if not house_number or ewkt is None or element["type"] not in OSM_TYPES:
            continue
        conn.execute(
            text(
                "INSERT INTO buildings (osm_type, osm_id, house_number, geom)"
                " VALUES (:t, :id, :n, ST_PointOnSurface(ST_GeomFromEWKT(:g))::geography)"
                " ON CONFLICT (osm_type, osm_id) DO UPDATE"
                " SET house_number = EXCLUDED.house_number, geom = EXCLUDED.geom"
            ),
            {
                "t": OSM_TYPES[element["type"]],
                "id": element["id"],
                "n": house_number[:20],
                "g": ewkt,
            },
        )
        count += 1
    return count


def coverage(conn: Connection, radius_m: float = 30) -> tuple[int, int]:
    """Сколько кусков улиц имеют хотя бы один дом в радиусе (из скольких)."""
    return conn.execute(
        text(
            "SELECT count(*) FILTER (WHERE EXISTS (SELECT 1 FROM buildings b"
            " WHERE ST_DWithin(b.geom, s.geom, :r))), count(*) FROM streets s"
        ),
        {"r": radius_m},
    ).one()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", help="готовый ответ Overpass вместо запроса в сеть")
    parser.add_argument("--save", help="сохранить ответ Overpass в файл")
    args = parser.parse_args()

    from app.db import engine

    with engine.connect() as conn:
        osm_ids = conn.execute(
            text("SELECT osm_id FROM streets WHERE osm_id IS NOT NULL ORDER BY osm_id")
        ).scalars()
        osm_ids = list(osm_ids)
    if not osm_ids:
        raise SystemExit("Улиц нет: сначала python -m scripts.load_streets")

    data = overpass.load_json(args.file) if args.file else overpass.query(build_query(osm_ids))
    if args.save:
        overpass.save_json(data, args.save)
    with engine.begin() as conn:
        count = load(conn, data)
        covered, total = coverage(conn)
    print(f"Дома: загружено {count}")
    print(f"Покрытие: у {covered} из {total} кусков улиц есть дом в 30 м ({covered / total:.0%})")


if __name__ == "__main__":
    main()
