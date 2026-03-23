from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from fastapi import HTTPException

from app.db.models import Block
from app.db.session import SessionLocal
from app.schemas.satellite import BlockInsightsResponse, SatelliteTimeseriesPoint
from app.services.block_lookup import resolve_block
from app.services.satellite_insights import satellite_insights_service


@dataclass(slots=True)
class BlockSatelliteSnapshot:
    block_id: str
    lanslu: str | None
    crop: str | None
    insights: BlockInsightsResponse


@dataclass(slots=True)
class BlockReference:
    block_id: str
    lanslu: str | None
    crop: str | None


class SatelliteAccessService:
    def get_block_snapshot(self, block_identifier: str, *, force_refresh: bool = False) -> BlockSatelliteSnapshot:
        with SessionLocal() as db:
            block = resolve_block(db, block_identifier)
            insights = (
                satellite_insights_service.refresh_block_insights(db, block)
                if force_refresh
                else satellite_insights_service.get_block_insights(db, block)
            )
            return self._build_snapshot(block, insights)

    def get_block_insights(self, block_identifier: str, *, force_refresh: bool = False) -> BlockInsightsResponse:
        return self.get_block_snapshot(block_identifier, force_refresh=force_refresh).insights

    def get_block_timeseries(self, block_identifier: str) -> list[SatelliteTimeseriesPoint]:
        with SessionLocal() as db:
            block = resolve_block(db, block_identifier)
            return satellite_insights_service.get_block_timeseries(db, block)

    def get_user_block_snapshots(self, user_id: str) -> list[BlockSatelliteSnapshot]:
        try:
            user_uuid = UUID(user_id)
        except (ValueError, AttributeError) as exc:
            raise HTTPException(status_code=400, detail=f"Invalid user_id format: {user_id}") from exc

        with SessionLocal() as db:
            blocks = db.query(Block).filter(Block.user_id == user_uuid).all()
            if not blocks:
                raise HTTPException(status_code=404, detail=f"No blocks found for user {user_id}")

            return [
                self._build_snapshot(
                    block,
                    satellite_insights_service.get_block_insights(db, block),
                )
                for block in blocks
            ]

    def resolve_block_reference(self, block_identifier: str) -> BlockReference:
        with SessionLocal() as db:
            block = resolve_block(db, block_identifier)
            return BlockReference(
                block_id=str(block.id),
                lanslu=block.lanslu,
                crop=block.crop,
            )

    @staticmethod
    def _build_snapshot(block: Block, insights: BlockInsightsResponse) -> BlockSatelliteSnapshot:
        return BlockSatelliteSnapshot(
            block_id=str(block.id),
            lanslu=block.lanslu,
            crop=block.crop,
            insights=insights,
        )


satellite_access_service = SatelliteAccessService()
