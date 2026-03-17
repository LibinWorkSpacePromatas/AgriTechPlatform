from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

DATABASE_URL = "postgresql://postgres:libin41@localhost:5432/agritech"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
