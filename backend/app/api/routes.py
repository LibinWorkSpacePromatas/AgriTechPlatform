import json
import tempfile
import zipfile
from pathlib import Path
from time import sleep
from uuid import UUID, uuid4
from typing import Any

import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from app.api import auth, scan, sensors
from app.db.session import SessionLocal
from app.db.models import Block, User, BlockDecision
from fastapi import Query
from pydantic import BaseModel
from app.schemas.opportunities import OpportunitiesResponse
from app.schemas.growing_opportunities import (
    GrowingOpportunityNewsResponse,
    GrowingOpportunitiesResponse,
    GrowingOpportunityFeedbackRequest,
    GrowingOpportunityFeedbackResponse,
)
from app.schemas.insights import DashboardBlockInsightsResponse
from app.schemas.satellite import BlockInsightsResponse as GEEInsightsResponse, SatelliteTimeseriesPoint
from app.services.satellite_events import satellite_event_broker
from app.services.satellite_access import satellite_access_service
from app.services.satellite_insights import SatelliteInsightsUnavailableError, satellite_insights_service
from app.services.block_lookup import resolve_block
from app.services.cloudinary_uploads import CloudinaryUploadError, cloudinary_upload_service
from app.services.opportunities import build_opportunities_response
from app.services.growing_opportunities import growing_opportunities_service
from app.services.weather_ingest import (
    build_weather_summary,
    fetch_weather,
    get_block_centroid_lat_lon,
    is_weather_fresh,
    query_weather_ranges,
    store_weather,
)

router = APIRouter()
router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(scan.router, prefix="/scan", tags=["scan"])
router.include_router(sensors.router, prefix="/api", tags=["sensors"])

logger = logging.getLogger(__name__)

class BlockUpsertRequest(BaseModel):
    user_id: str
    lanslu: str
    crop: str | None = None
    description: str | None = None
    geometry: dict[str, Any]

class BlockLocationRequest(BaseModel):
    user_id: str
    lanslu: str
    lat: float
    lon: float


def _validate_user_and_lanslu(user_id: str, lanslu: str, db: Session) -> UUID:
    try:
        user_uuid = UUID(user_id)
    except (ValueError, AttributeError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid user_id format: {user_id}") from exc

    if not lanslu.strip():
        raise HTTPException(status_code=400, detail="lanslu is required.")

    user = db.query(User).filter(User.id == user_uuid).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found.")

    return user_uuid


def _analyze_block_geometry(db: Session, geojson_str: str) -> dict[str, Any]:
    analysis = db.execute(
        text(
            """
            WITH prepared AS (
                SELECT ST_RemoveRepeatedPoints(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326))) AS raw_geom
            ),
            normalized AS (
                SELECT
                    raw_geom,
                    CASE
                        WHEN GeometryType(raw_geom) IN ('POLYGON', 'ST_Polygon') THEN raw_geom
                        ELSE COALESCE(
                            (
                                SELECT dumped.geom
                                FROM ST_Dump(ST_CollectionExtract(ST_UnaryUnion(raw_geom), 3)) AS dumped
                                ORDER BY ST_Area(dumped.geom::geography) DESC
                                LIMIT 1
                            ),
                            (
                                SELECT dumped.geom
                                FROM ST_Dump(ST_CollectionExtract(raw_geom, 3)) AS dumped
                                ORDER BY ST_Area(dumped.geom::geography) DESC
                                LIMIT 1
                            )
                        )
                    END AS g
                FROM prepared
            )
            SELECT
                ST_IsValid(g) AS is_valid,
                ST_IsEmpty(g) AS is_empty,
                GeometryType(g) AS geometry_type,
                ST_Dimension(g) AS geometry_dimension,
                ST_Area(g::geography) / 10000.0 AS area_ha,
                ST_AsGeoJSON(g) AS block_polygon,
                ST_Y(ST_Centroid(g)) AS centroid_lat,
                ST_X(ST_Centroid(g)) AS centroid_lon
            FROM normalized
            """
        ),
        {"geojson": geojson_str},
    ).mappings().first()

    if not analysis or not analysis.get("is_valid") or analysis.get("is_empty"):
        raise HTTPException(status_code=400, detail="Invalid or empty polygon geometry.")

    geometry_type = (analysis.get("geometry_type") or "").upper()
    geometry_dimension = int(analysis.get("geometry_dimension") or -1)
    if geometry_dimension != 2 or geometry_type not in {"POLYGON", "MULTIPOLYGON", "ST_POLYGON", "ST_MULTIPOLYGON"}:
        raise HTTPException(status_code=400, detail="Uploaded geometry must be a polygon or multipolygon.")

    area_ha = float(analysis["area_ha"] or 0.0)
    if area_ha < 0.01:
        raise HTTPException(status_code=400, detail="Block too small. Minimum is 0.01 hectares.")

    return dict(analysis)


def _upsert_block_geometry(
    *,
    db: Session,
    user_uuid: UUID,
    lanslu: str,
    geojson_obj: dict[str, Any],
    crop: str | None = None,
    description: str | None = None,
) -> dict[str, Any]:
    geojson_str = json.dumps(geojson_obj, sort_keys=True)
    analysis = _analyze_block_geometry(db, geojson_str)

    existing = (
        db.query(Block)
        .filter(Block.user_id == user_uuid, Block.lanslu == lanslu)
        .order_by(Block.id)
        .first()
    )

    block_id = existing.id if existing else uuid4()
    area_ha = float(analysis["area_ha"] or 0.0)

    if existing:
        db.execute(
            text(
                """
                WITH prepared AS (
                    SELECT ST_RemoveRepeatedPoints(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326))) AS raw_geom
                ),
                normalized AS (
                    SELECT
                        CASE
                            WHEN GeometryType(raw_geom) IN ('POLYGON', 'ST_Polygon') THEN raw_geom
                            ELSE COALESCE(
                                (
                                    SELECT dumped.geom
                                    FROM ST_Dump(ST_CollectionExtract(ST_UnaryUnion(raw_geom), 3)) AS dumped
                                    ORDER BY ST_Area(dumped.geom::geography) DESC
                                    LIMIT 1
                                ),
                                (
                                    SELECT dumped.geom
                                    FROM ST_Dump(ST_CollectionExtract(raw_geom, 3)) AS dumped
                                    ORDER BY ST_Area(dumped.geom::geography) DESC
                                    LIMIT 1
                                )
                            )
                        END AS geom
                    FROM prepared
                )
                UPDATE blocks
                SET
                    crop = COALESCE(:crop, crop),
                    description = COALESCE(:description, description),
                    area_ha = :area_ha,
                    geom = normalized.geom
                FROM normalized
                WHERE id = :block_id
                """
            ),
            {
                "block_id": str(block_id),
                "crop": crop,
                "description": description,
                "area_ha": area_ha,
                "geojson": geojson_str,
            },
        )
        db.execute(text("DELETE FROM satellite_cache WHERE block_id = :block_id"), {"block_id": str(block_id)})
        db.execute(text("DELETE FROM satellite_timeseries WHERE block_id = :block_id"), {"block_id": str(block_id)})
    else:
        db.execute(
            text(
                """
                WITH prepared AS (
                    SELECT ST_RemoveRepeatedPoints(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326))) AS raw_geom
                ),
                normalized AS (
                    SELECT
                        CASE
                            WHEN GeometryType(raw_geom) IN ('POLYGON', 'ST_Polygon') THEN raw_geom
                            ELSE COALESCE(
                                (
                                    SELECT dumped.geom
                                    FROM ST_Dump(ST_CollectionExtract(ST_UnaryUnion(raw_geom), 3)) AS dumped
                                    ORDER BY ST_Area(dumped.geom::geography) DESC
                                    LIMIT 1
                                ),
                                (
                                    SELECT dumped.geom
                                    FROM ST_Dump(ST_CollectionExtract(raw_geom, 3)) AS dumped
                                    ORDER BY ST_Area(dumped.geom::geography) DESC
                                    LIMIT 1
                                )
                            )
                        END AS geom
                    FROM prepared
                )
                INSERT INTO blocks (id, user_id, lanslu, crop, description, area_ha, geom)
                VALUES (
                    :block_id,
                    :user_id,
                    :lanslu,
                    :crop,
                    :description,
                    :area_ha,
                    (SELECT geom FROM normalized)
                )
                """
            ),
            {
                "block_id": str(block_id),
                "user_id": str(user_uuid),
                "lanslu": lanslu,
                "crop": crop,
                "description": description,
                "area_ha": area_ha,
                "geojson": geojson_str,
            },
        )

    from app.services.weather_ingest import fetch_weather, store_weather, get_block_info
    db.commit()

    try:
        info = get_block_info(db, block_id)
        lat, lon, tz = info["lat"], info["lon"], info["timezone"]
        if lat is not None and lon is not None:
            data = fetch_weather(lat, lon, timezone=tz)
            store_weather(db, block_id, data, timezone_str=tz)

            # Update decision state for weather
            decision = db.get(BlockDecision, block_id)
            if not decision:
                decision = BlockDecision(block_id=block_id)
                db.add(decision)
            decision.weather_ready = True
            db.commit()
    except Exception as exc:
        logger.warning("Weather refresh failed for block %s: %s", block_id, exc)

    # Trigger async satellite job immediately after geometry update
    try:
        from app.services.satellite_scheduler import satellite_refresh_scheduler
        satellite_refresh_scheduler.enqueue_block_refresh(
            db,
            block_id,
            reason="block_upsert",
            priority=10, # High priority for user interaction
            force=True
        )
    except Exception as exc:
        logger.warning("Satellite enqueue failed for block %s: %s", block_id, exc)

    return {
        "status": "created" if existing is None else "updated",
        "block": {
            "id": str(block_id),
            "user_id": str(user_uuid),
            "lanslu": lanslu,
            "description": description if description is not None else getattr(existing, "description", None),
            "area_ha": area_ha,
            "crop": crop if crop is not None else getattr(existing, "crop", None),
            "block_polygon": json.loads(analysis["block_polygon"]) if analysis.get("block_polygon") else None,
            "centroid_lat": float(analysis["centroid_lat"]) if analysis.get("centroid_lat") is not None else None,
            "centroid_lon": float(analysis["centroid_lon"]) if analysis.get("centroid_lon") is not None else None,
        },
    }


def _load_geojson_from_uploaded_shapefile(file_name: str, file_bytes: bytes) -> dict[str, Any]:
    try:
        import geopandas as gpd
        from shapely.geometry import mapping
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Server missing shapefile dependencies: {exc}") from exc

    suffix = Path(file_name or "upload").suffix.lower()
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)

        try:
            if suffix == ".zip":
                archive_path = tmp_path / (Path(file_name).name or "shapefile.zip")
                archive_path.write_bytes(file_bytes)
                with zipfile.ZipFile(archive_path) as archive:
                    archive.extractall(tmp_path)

                shapefiles = [
                    path for path in tmp_path.rglob("*.shp")
                    if "__MACOSX" not in path.parts
                ]
                if not shapefiles:
                    raise HTTPException(status_code=400, detail="ZIP must contain at least one .shp file.")
                read_path = shapefiles[0]
            elif suffix == ".shp":
                read_path = tmp_path / (Path(file_name).name or "upload.shp")
                read_path.write_bytes(file_bytes)
            else:
                raise HTTPException(status_code=400, detail="Upload a zipped shapefile (.zip) or a .shp file with all sidecar files available.")
        except zipfile.BadZipFile as exc:
            raise HTTPException(status_code=400, detail="Uploaded ZIP is not a valid archive.") from exc

        try:
            gdf = gpd.read_file(read_path)
        except Exception as exc:
            if suffix == ".shp":
                raise HTTPException(
                    status_code=400,
                    detail="Standalone .shp uploads are incomplete. Upload the full shapefile as a .zip containing .shp, .shx, .dbf, and .prj.",
                ) from exc
            raise HTTPException(status_code=400, detail=f"Failed to read shapefile: {exc}") from exc

        if gdf.empty:
            raise HTTPException(status_code=400, detail="Uploaded shapefile contains no features.")

        try:
            if gdf.crs:
                gdf = gdf.to_crs(epsg=4326)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Failed to convert shapefile CRS to WGS84: {exc}") from exc

        geometry_series = gdf.geometry.dropna()
        if geometry_series.empty:
            raise HTTPException(status_code=400, detail="Uploaded shapefile has no usable geometry.")

        geometry = geometry_series.iloc[0]
        if geometry.is_empty:
            raise HTTPException(status_code=400, detail="Uploaded shapefile has empty geometry.")
        if geometry.geom_type not in {"Polygon", "MultiPolygon"}:
            raise HTTPException(status_code=400, detail="Uploaded shapefile geometry must be a polygon or multipolygon.")

        return mapping(geometry)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/api/uploads/images", tags=["uploads"])
async def upload_image(file: UploadFile = File(...)):
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image size must be 10 MB or smaller.")

    try:
        uploaded = cloudinary_upload_service.upload_image(
            file_name=file.filename or "auction-image",
            content=content,
            content_type=file.content_type,
        )
    except CloudinaryUploadError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {
        "secure_url": uploaded.secure_url,
        "public_id": uploaded.public_id,
    }


@router.get("/users")
def get_users(db: Session = Depends(get_db)):
    try:
        users = db.query(User).all()
        return [
            {
                "id": str(user.id),
                "name": user.name,
                "region": user.region,
                "council": user.council,
                "farm_name": user.farm_name,
                "farm_location": user.farm_location,
                "primary_crop": user.primary_crop,
                "primary_soil": user.primary_soil,
                "role": getattr(user, "role", "farmer") or "farmer",
            }
            for user in users
        ]
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching users: {exc}") from exc


@router.get("/blocks/{user_id}")
def get_blocks(user_id: UUID, db: Session = Depends(get_db)):
    try:
        blocks = db.execute(
            text(
                """
                SELECT
                    id,
                    user_id,
                    lanslu,
                    soil_subgroup,
                    soil_class,
                    description,
                    area_ha,
                    crop,
                    timezone,
                    CASE
                        WHEN geom IS NULL OR ST_IsEmpty(geom) THEN NULL
                        ELSE ST_AsGeoJSON(ST_MakeValid(geom))
                    END AS block_polygon,
                    CASE
                        WHEN geom IS NULL OR ST_IsEmpty(geom) THEN NULL
                        ELSE ST_Y(ST_Centroid(ST_MakeValid(geom)))
                    END AS centroid_lat,
                    CASE
                        WHEN geom IS NULL OR ST_IsEmpty(geom) THEN NULL
                        ELSE ST_X(ST_Centroid(ST_MakeValid(geom)))
                    END AS centroid_lon
                FROM blocks
                WHERE user_id = :user_id
                ORDER BY lanslu NULLS LAST, id
                """
            ),
            {"user_id": str(user_id)},
        ).mappings().all()

        return [
            {
                "id": str(block["id"]),
                "user_id": str(block["user_id"]),
                "lanslu": block["lanslu"],
                "soil_subgroup": block["soil_subgroup"],
                "soil_class": block["soil_class"],
                "description": block["description"],
                "area_ha": block["area_ha"],
                "crop": block["crop"],
                "timezone": block["timezone"],
                "block_polygon": json.loads(block["block_polygon"]) if block["block_polygon"] else None,
                "centroid_lat": float(block["centroid_lat"]) if block["centroid_lat"] is not None else None,
                "centroid_lon": float(block["centroid_lon"]) if block["centroid_lon"] is not None else None,
            }
            for block in blocks
        ]
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching blocks: {exc}") from exc


@router.post("/api/blocks", tags=["blocks"])
def upsert_block(request: BlockUpsertRequest, db: Session = Depends(get_db)):
    user_uuid = _validate_user_and_lanslu(request.user_id, request.lanslu, db)

    if not request.geometry:
        raise HTTPException(status_code=400, detail="geometry is required.")

    return _upsert_block_geometry(
        db=db,
        user_uuid=user_uuid,
        lanslu=request.lanslu,
        geojson_obj=request.geometry,
        crop=request.crop,
        description=request.description,
    )


@router.delete("/api/blocks", tags=["blocks"])
def delete_block(
    user_id: str = Query(...),
    lanslu: str = Query(...),
    db: Session = Depends(get_db),
):
    try:
        user_uuid = UUID(user_id)
    except (ValueError, AttributeError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid user_id format: {user_id}") from exc

    if not lanslu.strip():
        raise HTTPException(status_code=400, detail="lanslu is required.")

    block = (
        db.query(Block)
        .filter(Block.user_id == user_uuid, Block.lanslu == lanslu)
        .order_by(Block.id)
        .first()
    )
    if not block:
        raise HTTPException(status_code=404, detail=f"Block {lanslu} not found for user {user_id}")

    block_id = str(block.id)
    try:
        db.execute(text("DELETE FROM satellite_cache WHERE block_id = :block_id"), {"block_id": block_id})
        db.execute(text("DELETE FROM satellite_timeseries WHERE block_id = :block_id"), {"block_id": block_id})
        db.execute(text("DELETE FROM satellite_refresh_jobs WHERE block_id = :block_id"), {"block_id": block_id})
        db.execute(text("DELETE FROM satellite_refresh_events WHERE block_id = :block_id"), {"block_id": block_id})
        db.execute(text("DELETE FROM blocks WHERE id = :block_id"), {"block_id": block_id})
        db.commit()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while deleting block: {exc}") from exc

    return {"status": "deleted", "block_id": block_id, "user_id": user_id, "lanslu": lanslu}


@router.post("/api/blocks/upload-shapefile", tags=["blocks"])
async def upload_shapefile(
    file: UploadFile = File(...),
    user_id: str = Form(...),
    lanslu: str = Form(...),
    crop: str | None = Form(default=None),
    description: str | None = Form(default=None),
    db: Session = Depends(get_db),
):
    user_uuid = _validate_user_and_lanslu(user_id, lanslu, db)

    if not file.filename:
        raise HTTPException(status_code=400, detail="A shapefile upload is required.")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded shapefile is empty.")

    geojson_obj = _load_geojson_from_uploaded_shapefile(file.filename, file_bytes)
    response = _upsert_block_geometry(
        db=db,
        user_uuid=user_uuid,
        lanslu=lanslu,
        geojson_obj=geojson_obj,
        crop=crop,
        description=description,
    )
    response["status"] = "uploaded" if response["status"] == "created" else response["status"]
    return response


@router.post("/api/blocks/location", tags=["blocks"])
def set_block_location(request: BlockLocationRequest, db: Session = Depends(get_db)):
    try:
        user_uuid = UUID(request.user_id)
    except (ValueError, AttributeError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid user_id format: {request.user_id}") from exc

    if not request.lanslu.strip():
        raise HTTPException(status_code=400, detail="lanslu is required.")

    existing = (
        db.query(Block)
        .filter(Block.user_id == user_uuid, Block.lanslu == request.lanslu)
        .order_by(Block.id)
        .first()
    )
    if not existing:
        raise HTTPException(status_code=404, detail=f"Block {request.lanslu} not found for user {request.user_id}")

    analysis = db.execute(
        text(
            """
            WITH pt AS (
                SELECT ST_SetSRID(ST_Point(:lon, :lat), 4326) AS p
            ),
            buf AS (
                SELECT ST_Transform(ST_Buffer(ST_Transform(p, 3857), 20.0), 4326) AS g FROM pt
            )
            SELECT
                ST_Area(g::geography) / 10000.0 AS area_ha,
                ST_AsGeoJSON(ST_RemoveRepeatedPoints(ST_MakeValid(g))) AS block_polygon,
                ST_Y(ST_Centroid(ST_RemoveRepeatedPoints(ST_MakeValid(g)))) AS centroid_lat,
                ST_X(ST_Centroid(ST_RemoveRepeatedPoints(ST_MakeValid(g)))) AS centroid_lon
            FROM buf
            """
        ),
        {"lat": request.lat, "lon": request.lon},
    ).mappings().first()

    area_ha = float(analysis["area_ha"] or 0.0)
    if area_ha < 0.1:
        raise HTTPException(status_code=400, detail="Computed location footprint is too small.")

    geojson_str = analysis["block_polygon"]
    try:
        db.execute(
            text(
                """
                UPDATE blocks
                SET
                    area_ha = :area_ha,
                    geom = ST_RemoveRepeatedPoints(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326)))
                WHERE id = :block_id
                """
            ),
            {"block_id": str(existing.id), "area_ha": area_ha, "geojson": geojson_str},
        )
        db.execute(text("DELETE FROM satellite_cache WHERE block_id = :block_id"), {"block_id": str(existing.id)})
        db.execute(text("DELETE FROM satellite_timeseries WHERE block_id = :block_id"), {"block_id": str(existing.id)})
        db.commit()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while setting block location: {exc}") from exc

    try:
        info = get_block_info(db, existing.id)
        lat, lon, tz = info["lat"], info["lon"], info["timezone"]
        if lat is not None and lon is not None:
            data = fetch_weather(lat, lon, timezone=tz)
            store_weather(db, existing.id, data, timezone_str=tz)

            # Update decision state for weather
            decision = db.get(BlockDecision, existing.id)
            if not decision:
                decision = BlockDecision(block_id=existing.id)
                db.add(decision)
            decision.weather_ready = True
            db.commit()
    except Exception as exc:
        logger.warning("Weather refresh failed for block %s: %s", existing.id, exc)

    # Trigger async satellite job
    try:
        from app.services.satellite_scheduler import satellite_refresh_scheduler
        satellite_refresh_scheduler.enqueue_block_refresh(
            db,
            existing.id,
            reason="location_update",
            priority=10,
            force=True
        )
    except Exception as exc:
        logger.warning("Satellite enqueue failed for block %s: %s", existing.id, exc)

    return {
        "status": "updated",
        "block": {
            "id": str(existing.id),
            "user_id": request.user_id,
            "lanslu": request.lanslu,
            "area_ha": area_ha,
            "block_polygon": json.loads(geojson_str) if geojson_str else None,
            "centroid_lat": float(analysis["centroid_lat"]) if analysis.get("centroid_lat") is not None else None,
            "centroid_lon": float(analysis["centroid_lon"]) if analysis.get("centroid_lon") is not None else None,
        },
    }


@router.delete("/api/blocks/geometry", tags=["blocks"])
def clear_block_geometry(
    user_id: str = Query(...),
    lanslu: str = Query(...),
    db: Session = Depends(get_db),
):
    try:
        user_uuid = UUID(user_id)
    except (ValueError, AttributeError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid user_id format: {user_id}") from exc

    if not lanslu.strip():
        raise HTTPException(status_code=400, detail="lanslu is required.")

    block = (
        db.query(Block)
        .filter(Block.user_id == user_uuid, Block.lanslu == lanslu)
        .order_by(Block.id)
        .first()
    )
    if not block:
        raise HTTPException(status_code=404, detail=f"Block {lanslu} not found for user {user_id}")

    centroid = db.execute(
        text(
            """
            SELECT
                ST_Y(ST_Centroid(ST_MakeValid(geom))) AS lat,
                ST_X(ST_Centroid(ST_MakeValid(geom))) AS lon
            FROM blocks
            WHERE id = :block_id
            """
        ),
        {"block_id": str(block.id)},
    ).mappings().first()
    if not centroid or centroid.get("lat") is None or centroid.get("lon") is None:
        raise HTTPException(status_code=400, detail="Block has no valid centroid to clear geometry.")

    lat = float(centroid["lat"])
    lon = float(centroid["lon"])
    analysis = db.execute(
        text(
            """
            WITH pt AS (
                SELECT ST_SetSRID(ST_Point(:lon, :lat), 4326) AS p
            ),
            buf AS (
                SELECT ST_Transform(ST_Buffer(ST_Transform(p, 3857), 20.0), 4326) AS g FROM pt
            )
            SELECT
                ST_Area(g::geography) / 10000.0 AS area_ha,
                ST_AsGeoJSON(ST_RemoveRepeatedPoints(ST_MakeValid(g))) AS block_polygon
            FROM buf
            """
        ),
        {"lat": lat, "lon": lon},
    ).mappings().first()

    area_ha = float(analysis["area_ha"] or 0.0)
    geojson_str = analysis["block_polygon"]
    try:
        db.execute(
            text(
                """
                UPDATE blocks
                SET
                    area_ha = :area_ha,
                    geom = ST_RemoveRepeatedPoints(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326)))
                WHERE id = :block_id
                """
            ),
            {"block_id": str(block.id), "area_ha": area_ha, "geojson": geojson_str},
        )
        db.execute(text("DELETE FROM satellite_cache WHERE block_id = :block_id"), {"block_id": str(block.id)})
        db.execute(text("DELETE FROM satellite_timeseries WHERE block_id = :block_id"), {"block_id": str(block.id)})
        db.commit()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while clearing block geometry: {exc}") from exc

    try:
        info = get_block_info(db, block.id)
        lat2, lon2, tz = info["lat"], info["lon"], info["timezone"]
        if lat2 is not None and lon2 is not None:
            data = fetch_weather(lat2, lon2, timezone=tz)
            store_weather(db, block.id, data, timezone_str=tz)
    except Exception as exc:
        logger.warning("Weather refresh failed for block %s: %s", block.id, exc)

    return {
        "status": "geometry_cleared",
        "block": {
            "id": str(block.id),
            "user_id": user_id,
            "lanslu": lanslu,
            "area_ha": area_ha,
            "block_polygon": json.loads(geojson_str) if geojson_str else None,
            "centroid_lat": lat,
            "centroid_lon": lon,
        },
    }


@router.get("/api/block/{block_identifier}/insights", response_model=GEEInsightsResponse, tags=["satellite"])
@router.get("/block/{block_identifier}/insights", response_model=GEEInsightsResponse, tags=["satellite"])
def get_block_insights(block_identifier: str):
    try:
        return satellite_access_service.get_block_insights(block_identifier)
    except SatelliteInsightsUnavailableError as exc:
        raise HTTPException(status_code=503, detail=f"Satellite insights are temporarily unavailable: {exc}") from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching block insights: {exc}") from exc


@router.get("/api/block/{block_identifier}/timeseries", response_model=list[SatelliteTimeseriesPoint], tags=["satellite"])
def get_block_timeseries(block_identifier: str):
    try:
        return satellite_access_service.get_block_timeseries(block_identifier)
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching block time series: {exc}") from exc


@router.get("/api/blocks/{block_id}/insights", response_model=DashboardBlockInsightsResponse, tags=["satellite-insights"])
def get_block_dashboard_insights(block_id: str, refresh: bool = Query(default=False)):
    try:
        snapshot = satellite_access_service.get_block_snapshot(block_id, force_refresh=refresh)
        return snapshot.insights
    except SatelliteInsightsUnavailableError as exc:
        raise HTTPException(status_code=503, detail=f"Satellite insights are temporarily unavailable: {exc}") from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching dashboard block insights: {exc}") from exc


@router.get("/api/weather/latest", tags=["weather"])
def get_latest_weather(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
    timezone: str = Query("Australia/Sydney", description="Timezone for the request")
):
    """
    Backend proxy for Open-Meteo API.
    Provides weather data for the dashboard.
    """
    import httpx
    
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,apparent_temperature,is_day,rain,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m,cloud_cover",
        "hourly": "temperature_2m,apparent_temperature,relative_humidity_2m,rain,cloud_cover,wind_speed_10m",
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weather_code",
        "timezone": timezone,
        "past_days": 7,
        "forecast_days": 7
    }
    
    try:
        # Using a longer timeout and verified client
        with httpx.Client(timeout=20.0, follow_redirects=True) as client:
            response = client.get("https://api.open-meteo.com/v1/forecast", params=params)
            
            if response.status_code != 200:
                logger.error("Open-Meteo API returned error %s: %s", response.status_code, response.text)
                raise HTTPException(status_code=502, detail=f"Weather API error: {response.status_code}")
                
            return response.json()
    except httpx.TimeoutException:
        logger.error("Weather proxy timeout for lat=%s, lon=%s", lat, lon)
        raise HTTPException(status_code=504, detail="Weather service timed out")
    except Exception as exc:
        logger.error("Failed to proxy weather request: %s", str(exc))
        # Return more detail in development
        raise HTTPException(status_code=502, detail=f"Weather service error: {str(exc)}")


@router.get("/api/blocks/{block_id}/decision", tags=["blocks"])
def get_block_decision(block_id: str, db: Session = Depends(get_db)):
    """
    Fetches the latest irrigation decision payload for a specific block.
    Supports both UUID and human-readable identifiers.
    """
    try:
        block = resolve_block(db, block_id)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error resolving block: {exc}") from exc

    try:
        from app.services.decision_engine import is_decision_stale, trigger_block_decision
        if is_decision_stale(db, block.id):
            trigger_block_decision(db, block.id)
    except Exception as exc:
        logger.warning("Decision refresh-on-read failed for block %s: %s", block.id, exc)

    row = db.execute(
        text("""
            SELECT decision_payload 
            FROM block_decisions 
            WHERE block_id = :block_id
        """),
        {"block_id": str(block.id)}
    ).first()

    if not row:
        return None

    return row[0]  # JSON payload from decision_payload column


@router.get("/api/blocks/{block_id}/unified-state", tags=["blocks"])
def get_block_unified_state(block_id: str, db: Session = Depends(get_db)):
    try:
        block = resolve_block(db, block_id)
    except HTTPException:
        raise
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while resolving block: {exc}") from exc

    try:
        row = (
            db.execute(
                text(
                    """
                    SELECT *
                    FROM unified_farm_state
                    WHERE block_id = :block_id
                    LIMIT 1
                    """
                ),
                {"block_id": str(block.id)},
            )
            .mappings()
            .first()
        )
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching unified farm state: {exc}") from exc

    if not row:
        raise HTTPException(status_code=404, detail="No data found")

    def _float(value: Any) -> float | None:
        if value is None:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    weather: dict[str, Any] | None = None
    weather_summary: dict[str, Any] | None = None
    try:
        info = get_block_info(db, block.id)
        lat, lon, tz = info["lat"], info["lon"], info["timezone"]
        if lat is not None and lon is not None:
            if not is_weather_fresh(db, block.id, freshness_minutes=60):
                weather_data = fetch_weather(lat, lon, timezone=tz)
                store_weather(db, block.id, weather_data, timezone_str=tz)
            weather = query_weather_ranges(db, block.id)
            weather_summary = build_weather_summary(weather)
    except Exception:
        weather = None
        weather_summary = None

    return {
        "block_id": str(row.get("block_id") or block.id),
        "sensors": {
            "soil_moisture": _float(row.get("soil_moisture")),
            "soil_temperature": _float(row.get("soil_temperature")),
            "air_temperature": _float(row.get("air_temperature")),
            "humidity": _float(row.get("humidity")),
            "ph": _float(row.get("ph_level")),
            "sunlight": _float(row.get("sunlight")),
            "fertility": _float(row.get("fertility")),
        },
        "satellite": {
            "ndvi": _float(row.get("ndvi")),
            "ndwi": _float(row.get("ndwi")),
            "evi": _float(row.get("evi")),
            "lai": _float(row.get("lai")),
        },
        "weather": weather or {"last_24h": [], "last_7d": [], "next_7d": []},
        "weather_summary": weather_summary,
        "meta": {
            "data_quality": row.get("data_quality"),
            "date": row.get("composite_date_to").isoformat() if row.get("composite_date_to") else None,
        },
    }


@router.get("/api/blocks/{block_id}/events", tags=["satellite-events"])
async def stream_block_satellite_events(block_id: str):
    """
    Server-Sent Events (SSE) stream for satellite refresh progress.
    """
    import asyncio
    from datetime import datetime, timezone
    from app.services.satellite_access import satellite_access_service
    from app.services.satellite_events import satellite_event_broker

    try:
        # Resolve block once at the start of the stream
        block_reference = satellite_access_service.resolve_block_reference(block_id)
    except SQLAlchemyError as exc:
        logger.error("Database error resolving block for events: %s", exc)
        raise HTTPException(status_code=500, detail="Database error while preparing satellite events") from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Unexpected error resolving block for events: %s", exc)
        raise HTTPException(status_code=500, detail=f"Error resolving block: {exc}") from exc

    async def event_generator():
        # Start from the current tail so a new subscriber only sees events
        # produced after this SSE connection is established.
        last_event_id = satellite_event_broker.latest_event_id(block_id=block_reference.block_id)
        
        # Send initial connection event
        yield _format_sse_payload({
            "block_id": block_reference.block_id,
            "event": "connected",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "reason": "stream_established",
        })

        try:
            while True:
                # Check for new events since last poll
                refresh_events = satellite_event_broker.list_events(
                    block_id=block_reference.block_id,
                    after_id=last_event_id,
                )

                if not refresh_events:
                    # Keep connection alive with SSE comment
                    yield ": keep-alive\n\n"
                    await asyncio.sleep(2) # Poll every 2 seconds
                    continue

                for refresh_event in refresh_events:
                    last_event_id = refresh_event.id
                    yield _format_sse_payload({
                        "block_id": refresh_event.block_id,
                        "event": refresh_event.event,
                        "timestamp": refresh_event.timestamp.isoformat(),
                        "reason": refresh_event.reason,
                        "data_quality": refresh_event.data_quality,
                        "error": refresh_event.error,
                        "latency_ms": refresh_event.latency_ms,
                    })
                
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            logger.info("event=sse_stream_cancelled block_id=%s", block_reference.block_id)
        except Exception as exc:
            logger.error("event=sse_stream_error block_id=%s error=%s", block_reference.block_id, exc)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={ 
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no", # Prevent Nginx from buffering the stream
        },
    )


@router.get("/api/opportunities/{block_id}", response_model=OpportunitiesResponse, tags=["opportunities"])
def get_block_opportunities(block_id: str, db: Session = Depends(get_db)):
    try:
        block = resolve_block(db, block_id)
        satellite_response = satellite_insights_service.get_block_insights(db, block)
        return build_opportunities_response(block, satellite_response)
    except SatelliteInsightsUnavailableError as exc:
        raise HTTPException(status_code=503, detail=f"Satellite opportunities are temporarily unavailable: {exc}") from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching growth opportunities: {exc}") from exc


@router.get(
    "/api/blocks/{block_id}/growing-opportunities",
    response_model=GrowingOpportunitiesResponse,
    tags=["growing-opportunities"],
)
def get_growing_opportunities(block_id: str, db: Session = Depends(get_db)):
    try:
        block = resolve_block(db, block_id)
        return growing_opportunities_service.build_page_payload(db, block)
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching growing opportunities: {exc}") from exc


@router.get(
    "/api/blocks/{block_id}/growing-opportunities/news",
    response_model=GrowingOpportunityNewsResponse,
    tags=["growing-opportunities"],
)
def get_growing_opportunities_news(block_id: str, db: Session = Depends(get_db)):
    try:
        block = resolve_block(db, block_id)
        return growing_opportunities_service.build_news_payload(db, block)
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while fetching growing opportunities: {exc}") from exc


@router.post(
    "/api/blocks/{block_id}/growing-opportunities/feedback",
    response_model=GrowingOpportunityFeedbackResponse,
    tags=["growing-opportunities"],
)
def save_growing_opportunity_feedback(
    block_id: str,
    feedback: GrowingOpportunityFeedbackRequest,
    db: Session = Depends(get_db),
):
    try:
        block = resolve_block(db, block_id)
        return growing_opportunities_service.save_feedback(block, feedback)
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=500, detail=f"Database error while saving growing opportunity feedback: {exc}"
        ) from exc


def _format_sse_payload(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"
