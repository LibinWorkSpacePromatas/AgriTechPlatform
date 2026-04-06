from __future__ import annotations

from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session


def get_farm_context(db: Session, block_id: UUID) -> dict | None:
    row = (
        db.execute(
            text(
                """
                SELECT
                    ufs.*,
                    b.user_id,
                    b.lanslu,
                    (
                        SELECT (bd.decision_payload ->> 'irrigation')
                        FROM block_decisions bd
                        WHERE bd.block_id = ufs.block_id
                        LIMIT 1
                    ) AS irrigation_decision,
                    COALESCE(
                        (
                            SELECT SUM(wt.precipitation)
                            FROM weather_timeseries wt
                            WHERE wt.block_id = ufs.block_id
                              AND wt.observed_at BETWEEN NOW() AND NOW() + INTERVAL '48 hours'
                        ),
                        0
                    )::double precision AS rain_next_48h
                FROM unified_farm_state ufs
                JOIN blocks b ON b.id = ufs.block_id
                WHERE ufs.block_id = :block_id
                LIMIT 1
                """
            ),
            {"block_id": str(block_id)},
        )
        .mappings()
        .first()
    )
    return dict(row) if row else None

