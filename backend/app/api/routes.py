import json
import tempfile
import zipfile
from pathlib import Path
from time import sleep
from uuid import UUID, uuid4
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from app.api import auth, scan, sensors
from app.db.session import SessionLocal
from app.db.models import Block, User
from fastapi import Query
from pydantic import BaseModel
from app.schemas.opportunities import OpportunitiesResponse
from app.schemas.growing_opportunities import (
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
from app.services.opportunities import build_opportunities_response
from app.services.growing_opportunities import growing_opportunities_service

router = APIRouter()
router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(scan.router, prefix="/scan", tags=["scan"])
router.include_router(sensors.router, prefix="/api", tags=["sensors"])


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
                SELECT ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326)) AS g
            )
            SELECT
                ST_IsValid(g) AS is_valid,
                ST_IsEmpty(g) AS is_empty,
                GeometryType(g) AS geometry_type,
                ST_Dimension(g) AS geometry_dimension,
                ST_Area(ST_Transform(g, 3857)) / 10000.0 AS area_ha,
                ST_AsGeoJSON(g) AS block_polygon,
                ST_Y(ST_Centroid(g)) AS centroid_lat,
                ST_X(ST_Centroid(g)) AS centroid_lon
            FROM prepared
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
                UPDATE blocks
                SET
                    crop = COALESCE(:crop, crop),
                    description = COALESCE(:description, description),
                    area_ha = :area_ha,
                    geom = ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326))
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
                INSERT INTO blocks (id, user_id, lanslu, crop, description, area_ha, geom)
                VALUES (
                    :block_id,
                    :user_id,
                    :lanslu,
                    :crop,
                    :description,
                    :area_ha,
                    ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326))
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

    db.commit()

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
                ST_Area(ST_Transform(g, 3857)) / 10000.0 AS area_ha,
                ST_AsGeoJSON(ST_MakeValid(g)) AS block_polygon,
                ST_Y(ST_Centroid(ST_MakeValid(g))) AS centroid_lat,
                ST_X(ST_Centroid(ST_MakeValid(g))) AS centroid_lon
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
                    geom = ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326))
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
                ST_Area(ST_Transform(g, 3857)) / 10000.0 AS area_ha,
                ST_AsGeoJSON(ST_MakeValid(g)) AS block_polygon
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
                    geom = ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326))
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


@router.get("/api/blocks/{block_id}/events", tags=["satellite-events"])
def stream_block_satellite_events(block_id: str):
    try:
        block_reference = satellite_access_service.resolve_block_reference(block_id)
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error while preparing satellite events: {exc}") from exc

    def event_stream():
        last_event_id: int | None = None
        yield _format_sse_payload(
            {
                "block_id": block_reference.block_id,
                "event": "connected",
                "reason": "stream_opened",
            }
        )

        while True:
            refresh_events = satellite_event_broker.list_events(
                block_id=block_reference.block_id,
                after_id=last_event_id,
            )

            if not refresh_events:
                yield ": keep-alive\n\n"
                sleep(1)
                continue

            for refresh_event in refresh_events:
                last_event_id = refresh_event.id
                yield _format_sse_payload(
                    {
                        "block_id": refresh_event.block_id,
                        "event": refresh_event.event,
                        "timestamp": refresh_event.timestamp.isoformat(),
                        "reason": refresh_event.reason,
                        "data_quality": refresh_event.data_quality,
                        "error": refresh_event.error,
                        "latency_ms": refresh_event.latency_ms,
                    }
                )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
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
