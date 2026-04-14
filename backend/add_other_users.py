import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv


CURRENT_DIR = Path(__file__).resolve().parent
load_dotenv(CURRENT_DIR / ".env")


USERS = [
    (
        "22222222-1111-1111-1111-111111111111",
        "Sarah Thompson",
        "Barossa Valley",
        "THE BAROSSA COUNCIL",
        "Barossa Estate",
        "Tanunda, SA",
        "Grenache",
        "Clay",
    ),
    (
        "33333333-1111-1111-1111-111111111111",
        "Michael Chen",
        "McLaren Vale",
        "CITY OF ONKAPARINGA",
        "McLaren Vineyards",
        "Willunga, SA",
        "Cabernet Sauvignon",
        "Sandy",
    ),
    (
        "44444444-1111-1111-1111-111111111111",
        "Emma Williams",
        "Riverland",
        "MID MURRAY COUNCIL",
        "Sunridge Estate",
        "Waikerie, SA",
        "Chardonnay",
        "Loamy",
    ),
    (
        "55555555-1111-1111-1111-111111111111",
        "David Anderson",
        "Barossa Valley",
        "THE BAROSSA COUNCIL",
        "Heritage Wines",
        "Nuriootpa, SA",
        "Riesling",
        "Silty",
    ),
    (
        "66666666-2222-2222-2222-222222222222",
        "Olivia Parker",
        "Clare Valley",
        "CLARE AND GILBERT VALLEYS COUNCIL",
        "Valley Crest Farm",
        "Clare, SA",
        "Shiraz",
        "Loam",
    ),
]


BLOCKS = [
    (
        "66666666-1111-1111-1111-111111111111",
        "22222222-1111-1111-1111-111111111111",
        "WOGJLp",
        "D4",
        "D4",
        "Loam over red clay",
        9,
        "Grenache",
    ),
    (
        "77777777-1111-1111-1111-111111111111",
        "22222222-1111-1111-1111-111111111111",
        "BCPKKE",
        "A6",
        "A6",
        "Gradational sandy loam",
        8,
        "Shiraz",
    ),
    (
        "88888888-1111-1111-1111-111111111111",
        "33333333-1111-1111-1111-111111111111",
        "EUVKFU",
        "A6",
        "A6",
        "Sand over clay",
        8,
        "Cabernet Sauvignon",
    ),
    (
        "99999999-1111-1111-1111-111111111111",
        "33333333-1111-1111-1111-111111111111",
        "EUVJLU",
        "D4",
        "D4",
        "Hard loam over red clay",
        9,
        "Merlot",
    ),
    (
        "aaaaaaaa-1111-1111-1111-111111111111",
        "44444444-1111-1111-1111-111111111111",
        "EUVJLU",
        "D4",
        "D4",
        "Loam over red clay",
        7,
        "Chardonnay",
    ),
    (
        "bbbbbbbb-1111-1111-1111-111111111111",
        "44444444-1111-1111-1111-111111111111",
        "EUVJLp",
        "D4",
        "D4",
        "Gradational clay loam",
        10,
        "Pinot Grigio",
    ),
    (
        "cccccccc-1111-1111-1111-111111111111",
        "55555555-1111-1111-1111-111111111111",
        "BCPKFI",
        "A4",
        "A4",
        "Silty loam over clay",
        7,
        "Riesling",
    ),
    (
        "dddddddd-1111-1111-1111-111111111111",
        "55555555-1111-1111-1111-111111111111",
        "EUVKFB",
        "A6",
        "A6",
        "Fine sandy loam",
        8,
        "Semillon",
    ),
    (
        "eeeeeeee-2222-2222-2222-222222222222",
        "66666666-2222-2222-2222-222222222222",
        "CLARE1",
        "D4",
        "D4",
        "Red-brown earth with loamy topsoil",
        11,
        "Shiraz",
    ),
    (
        "ffffffff-2222-2222-2222-222222222222",
        "66666666-2222-2222-2222-222222222222",
        "CLARE2",
        "A6",
        "A6",
        "Sandy loam with good drainage",
        6,
        "Cabernet Sauvignon",
    ),
]


USER_INSERT_SQL = """
INSERT INTO users (
    id,
    name,
    region,
    council,
    farm_name,
    farm_location,
    primary_crop,
    primary_soil
)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (id) DO NOTHING
"""


BLOCK_INSERT_SQL = """
INSERT INTO blocks (
    id,
    user_id,
    lanslu,
    soil_subgroup,
    soil_class,
    description,
    area_ha,
    crop,
    geom
)
VALUES (
    %s,
    %s,
    %s,
    %s,
    %s,
    %s,
    %s,
    %s,
    ST_SetSRID(
        ST_MakePolygon(
            ST_MakeLine(
                ARRAY[
                    ST_MakePoint(0, 0),
                    ST_MakePoint(0, 1),
                    ST_MakePoint(1, 1),
                    ST_MakePoint(1, 0),
                    ST_MakePoint(0, 0)
                ]
            )
        ),
        4326
    )
)
ON CONFLICT (id) DO NOTHING
"""


def populate() -> None:
    db_url = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/agritech",
    )

    inserted_users = 0
    inserted_blocks = 0

    try:
        with psycopg2.connect(db_url) as conn:
            with conn.cursor() as cur:
                for user in USERS:
                    cur.execute(USER_INSERT_SQL, user)
                    inserted_users += max(cur.rowcount, 0)

                for block in BLOCKS:
                    cur.execute(BLOCK_INSERT_SQL, block)
                    inserted_blocks += max(cur.rowcount, 0)

        print("Database population completed successfully.")
        print(f"Users inserted: {inserted_users}")
        print(f"Blocks inserted: {inserted_blocks}")
    except Exception as exc:
        print(f"Error populating database: {exc}")


if __name__ == "__main__":
    populate()
