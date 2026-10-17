"""Загрузка улиц демо-территории из OSM: python -m scripts.load_streets

Список улиц, их группа и район — scripts/street_groups.csv. Каждый кусок улицы в OSM
становится отдельной строкой streets. Повторный запуск обновляет строки по osm_id,
а не дублирует их. Ключи: --file ответ.json (без сети), --save ответ.json (сохранить).
"""

import argparse
import csv
from pathlib import Path

from sqlalchemy import Connection, text

from scripts import overpass

CSV_PATH = Path(__file__).with_name("street_groups.csv")

# Только проезжие дороги: тротуары, дворовые проезды и тропинки не нужны
ROAD_TYPES = "^(trunk|primary|secondary|tertiary|unclassified|residential|living_street)(_link)?$"


def read_groups(path: Path = CSV_PATH) -> dict[str, dict[str, str]]:
    """Название улицы → {"street_group": …, "district": …}. Строки с # пропускаются."""
    with path.open(encoding="utf-8") as file:
        lines = [line for line in file if line.strip() and not line.startswith("#")]
    return {
        row["name"]: {"street_group": row["street_group"], "district": row["district"]}
        for row in csv.DictReader(lines)
    }


def build_query(names: list[str]) -> str:
    south, west, north, east = overpass.TOMSK_BBOX
    ways = "".join(
        f'way({south},{west},{north},{east})["highway"~"{ROAD_TYPES}"]["name"="{name}"];'
        for name in names
    )
    return f"[out:json][timeout:120];({ways});out geom;"


def line_ewkt(geometry: list[dict]) -> str:
    points = ", ".join(f"{p['lon']} {p['lat']}" for p in geometry)
    return f"SRID=4326;LINESTRING({points})"


def load(conn: Connection, data: dict, groups: dict[str, dict[str, str]]) -> int:
    """Записывает куски улиц из ответа Overpass. Возвращает число обработанных кусков."""
    district_ids: dict[str, int] = {}
    for district in sorted({g["district"] for g in groups.values()}):
        conn.execute(
            text("INSERT INTO districts (name) VALUES (:n) ON CONFLICT (name) DO NOTHING"),
            {"n": district},
        )
        district_ids[district] = conn.execute(
            text("SELECT id FROM districts WHERE name = :n"), {"n": district}
        ).scalar_one()

    count = 0
    for way in data["elements"]:
        name = way.get("tags", {}).get("name")
        geometry = way.get("geometry") or []
        if way.get("type") != "way" or name not in groups or len(geometry) < 2:
            continue
        conn.execute(
            text(
                "INSERT INTO streets (osm_id, name, street_group, district_id, geom)"
                " VALUES (:osm_id, :name, :group, :district, ST_GeogFromText(:geom))"
                " ON CONFLICT (osm_id) DO UPDATE SET name = EXCLUDED.name,"
                " street_group = EXCLUDED.street_group, district_id = EXCLUDED.district_id,"
                " geom = EXCLUDED.geom"
            ),
            {
                "osm_id": way["id"],
                "name": name,
                "group": groups[name]["street_group"],
                "district": district_ids[groups[name]["district"]],
                "geom": line_ewkt(geometry),
            },
        )
        count += 1
    return count


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", help="готовый ответ Overpass вместо запроса в сеть")
    parser.add_argument("--save", help="сохранить ответ Overpass в файл")
    args = parser.parse_args()

    from app.db import engine

    groups = read_groups()
    data = overpass.load_json(args.file) if args.file else overpass.query(build_query(list(groups)))
    if args.save:
        overpass.save_json(data, args.save)
    with engine.begin() as conn:
        count = load(conn, data, groups)
        found = conn.execute(
            text("SELECT count(DISTINCT name) FROM streets WHERE name = ANY(:n)"),
            {"n": list(groups)},
        ).scalar_one()
    print(f"Улицы: загружено кусков {count}; найдено улиц {found} из {len(groups)}")
    if found < len(groups):
        print("Часть улиц из street_groups.csv не нашлась в OSM: проверьте названия")


if __name__ == "__main__":
    main()
