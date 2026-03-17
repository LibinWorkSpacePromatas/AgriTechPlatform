from sqlalchemy import Column, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from geoalchemy2 import Geometry

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID, primary_key=True)
    name = Column(String)
    region = Column(String)
    council = Column(String)
    farm_name = Column(String)
    farm_location = Column(String)
    primary_crop = Column(String)
    primary_soil = Column(String)


class Block(Base):
    __tablename__ = "blocks"

    id = Column(UUID, primary_key=True)
    user_id = Column(UUID, ForeignKey("users.id"))
    lanslu = Column(String)
    soil_subgroup = Column(String)
    soil_class = Column(String)
    description = Column(String)
    area_ha = Column(Float)
    crop = Column(String)
    geom = Column(Geometry("POLYGON"))
