"""Зоны демо-подрядчиков по административным районам Томска: python -m scripts.load_zones

Границы районов берутся из OSM (Overpass) и собираются в полигоны в PostGIS. Зона
подрядчика — один или несколько целых районов (ZONES), поэтому она идёт по реальным
границам, а не прямоугольником. Мелкие наложения соседних границ вычитаются, чтобы зоны
строго не пересекались (В-19). Запускать после seed_demo. Ключи: --file ответ.json
(без сети), --save ответ.json (сохранить ответ).
"""

import argparse

from sqlalchemy import Connection, text

from scripts import overpass

DISTRICTS = ("Кировский район", "Ленинский район", "Октябрьский район", "Советский район")
ZONES = {
    "Демо-подрядчик «Запад»": ("Ленинский район", "Кировский район"),
    "Демо-подрядчик «Центр»": ("Советский район",),
    "Демо-подрядчик «Восток»": ("Октябрьский район",),
}


def build_query() -> str:
    south, west, north, east = overpass.TOMSK_BBOX
    names = "|".join(name.split()[0] for name in DISTRICTS)
    return (
        "[out:json][timeout:180];"
        f'rel({south},{west},{north},{east})["boundary"="administrative"]'
        f'["name"~"^({names}) район$"];out geom;'
    )


def outer_lines(relation: dict) -> list[str]:
    """Внешние линии границы района в EWKT; из них PostGIS соберёт полигон."""
    lines = []
    for member in relation.get("members", []):
        geometry = member.get("geometry")
        if member.get("type") == "way" and member.get("role") in ("outer", "") and geometry:
            points = ", ".join(f"{p['lon']} {p['lat']}" for p in geometry)
            lines.append(f"SRID=4326;LINESTRING({points})")
    return lines


def district_polygons(conn: Connection, data: dict) -> dict[str, str]:
    """Название района → EWKT мультиполигона."""
    result = {}
    for relation in data["elements"]:
        name = relation.get("tags", {}).get("name")
        lines = outer_lines(relation)
        if name not in DISTRICTS or not lines:
            continue
        result[name] = conn.execute(
            text(
                "SELECT ST_AsEWKT(ST_Multi(ST_CollectionExtract(ST_MakeValid("
                "ST_BuildArea(ST_Collect(ST_GeomFromEWKT(l)))), 3)))"
                " FROM unnest(CAST(:lines AS text[])) AS l"
            ),
            {"lines": lines},
        ).scalar_one()
    return result


def load(conn: Connection, data: dict) -> list[str]:
    """Записывает зоны подрядчиков; возвращает строки отчёта «подрядчик: районы»."""
    polygons = district_polygons(conn, data)
    missing = [name for name in DISTRICTS if name not in polygons]
    if missing:
        raise SystemExit(f"В ответе OSM нет границ: {', '.join(missing)}")
    report, taken = [], None
    for contractor, districts in ZONES.items():
        zone = conn.execute(
            text(
                "SELECT ST_AsEWKT(ST_Multi(ST_CollectionExtract(ST_MakeValid("
                "CASE WHEN CAST(:taken AS text) IS NULL THEN u"
                " ELSE ST_Difference(u, ST_GeomFromEWKT(:taken)) END), 3)))"
                " FROM (SELECT ST_Union(ST_GeomFromEWKT(z)) AS u"
                " FROM unnest(CAST(:zones AS text[])) AS z) s"
            ),
            {"zones": [polygons[d] for d in districts], "taken": taken},
        ).scalar_one()
        updated = conn.execute(
            text("UPDATE contractors SET zone = ST_GeogFromText(:z) WHERE name = :n"),
            {"z": zone, "n": contractor},
        ).rowcount
        if not updated:
            raise SystemExit(f"Нет подрядчика «{contractor}»: сначала python -m scripts.seed_demo")
        taken = conn.execute(
            text(
                "SELECT ST_AsEWKT(ST_Union(ST_GeomFromEWKT(:a), ST_GeomFromEWKT(:b)))"
                if taken
                else "SELECT CAST(:a AS text)"
            ),
            {"a": zone, "b": taken},
        ).scalar_one()
        report.append(f"{contractor}: {', '.join(districts)}")
    return report


def main() -> None:
    from app.db import engine

    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--file", help="ответ Overpass из файла (без сети)")
    parser.add_argument("--save", help="сохранить ответ Overpass в файл")
    args = parser.parse_args()
    data = overpass.load_json(args.file) if args.file else overpass.query(build_query())
    if args.save:
        overpass.save_json(data, args.save)
    with engine.begin() as conn:
        for line in load(conn, data):
            print(line)
    print("Готово: зоны подрядчиков идут по границам районов")


if __name__ == "__main__":
    main()
