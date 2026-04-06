import psycopg2
from uuid import UUID
import os
from pathlib import Path
from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parent / ".env")

def populate():
    try:
        db_url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/agritech")
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()

        users = [
            ('22222222-1111-1111-1111-111111111111', 'Sarah Thompson', 'Barossa Valley', 'THE BAROSSA COUNCIL', 'Barossa Estate', 'Tanunda, SA', 'Grenache', 'Clay'),
            ('33333333-1111-1111-1111-111111111111', 'Michael Chen', 'McLaren Vale', 'CITY OF ONKAPARINGA', 'McLaren Vineyards', 'Willunga, SA', 'Cabernet Sauvignon', 'Sandy'),
            ('44444444-1111-1111-1111-111111111111', 'Emma Williams', 'Riverland', 'MID MURRAY COUNCIL', 'Sunridge Estate', 'Waikerie, SA', 'Chardonnay', 'Loamy'),
            ('55555555-1111-1111-1111-111111111111', 'David Anderson', 'Barossa Valley', 'THE BAROSSA COUNCIL', 'Heritage Wines', 'Nuriootpa, SA', 'Riesling', 'Silty'),
            ('66666666-2222-2222-2222-222222222222', 'Olivia Parker', 'Clare Valley', 'CLARE AND GILBERT VALLEYS COUNCIL', 'Valley Crest Farm', 'Clare, SA', 'Shiraz', 'Loam')
        ]

        for u in users:
            cur.execute("""
                INSERT INTO users (id, name, region, council, farm_name, farm_location, primary_crop, primary_soil)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING
            """, u)

        # Blocks for Sarah Thompson
        blocks = [
            ('66666666-1111-1111-1111-111111111111', '22222222-1111-1111-1111-111111111111', 'WOGJLp', 'D4', 'D4', 'Loam over red clay', 9, 'Grenache'),
            ('77777777-1111-1111-1111-111111111111', '22222222-1111-1111-1111-111111111111', 'BCPKKE', 'A6', 'A6', 'Gradational sandy loam', 8, 'Shiraz'),
            # Blocks for Michael Chen
            ('88888888-1111-1111-1111-111111111111', '33333333-1111-1111-1111-111111111111', 'EUVKFU', 'A6', 'A6', 'Sand over clay', 8, 'Cabernet Sauvignon'),
            ('99999999-1111-1111-1111-111111111111', '33333333-1111-1111-1111-111111111111', 'EUVJLU', 'D4', 'D4', 'Hard loam over red clay', 9, 'Merlot'),
            # Blocks for Emma Williams
            ('aaaaaaaa-1111-1111-1111-111111111111', '44444444-1111-1111-1111-111111111111', 'EUVJLU', 'D4', 'D4', 'Loam over red clay', 7, 'Chardonnay'),
            ('bbbbbbbb-1111-1111-1111-111111111111', '44444444-1111-1111-1111-111111111111', 'EUVJLp', 'D4', 'D4', 'Gradational clay loam', 10, 'Pinot Grigio'),
            # Blocks for David Anderson
            ('cccccccc-1111-1111-1111-111111111111', '55555555-1111-1111-1111-111111111111', 'BCPKFI', 'A4', 'A4', 'Silty loam over clay', 7, 'Riesling'),
            ('dddddddd-1111-1111-1111-111111111111', '55555555-1111-1111-1111-111111111111', 'EUVKFB', 'A6', 'A6', 'Fine sandy loam', 8, 'Semillon'),
            # Blocks for Olivia Parker
            ('eeeeeeee-2222-2222-2222-222222222222', '66666666-2222-2222-2222-222222222222', 'CLARE1', 'D4', 'D4', 'Red-brown earth with loamy topsoil', 11, 'Shiraz'),
            ('ffffffff-2222-2222-2222-222222222222', '66666666-2222-2222-2222-222222222222', 'CLARE2', 'A6', 'A6', 'Sandy loam with good drainage', 6, 'Cabernet Sauvignon')
        ]

        for b in blocks:
            # Note: geom is NOT NULL in blocks table. I'll use a dummy point or polygon for now.
            # ST_GeomFromText('POLYGON((...))', 4326)
            # Since I don't have the exact geom from the SQL dump snippet, I'll use a dummy point cast to polygon or just a simple polygon.
            # Actually, the user's tech.sql has valid geoms. I'll try to find them if possible, otherwise I'll use a dummy.
            cur.execute("""
                INSERT INTO blocks (id, user_id, lanslu, soil_subgroup, soil_class, description, area_ha, crop, geom)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, ST_SetSRID(ST_MakePolygon(ST_MakeLine(ARRAY[ST_MakePoint(0,0), ST_MakePoint(0,1), ST_MakePoint(1,1), ST_MakePoint(1,0), ST_MakePoint(0,0)])), 4326))
                ON CONFLICT (id) DO NOTHING
            """, b)

        conn.commit()
        print("Database populated successfully.")
        cur.close()
        conn.close()
    except Exception as e:
        print("Error populating database:", e)

if __name__ == "__main__":
    populate()
