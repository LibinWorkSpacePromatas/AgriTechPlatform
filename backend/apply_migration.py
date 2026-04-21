import sys
import os
from sqlalchemy import text
from app.db.session import SessionLocal

def run_migration():
    db = SessionLocal()
    try:
        db.execute(text("ALTER TABLE sensor_definitions ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT false;"))
        db.commit()
        print("Migration applied: Added is_manual to sensor_definitions.")
    except Exception as e:
        db.rollback()
        print(f"Migration failed: {e}")
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()
