from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db.models import Block


def resolve_block(db: Session, block_identifier: str) -> Block:
    block = db.query(Block).filter(Block.lanslu == block_identifier).first()

    if block is None:
        try:
            block_uuid = UUID(block_identifier)
        except ValueError:
            block_uuid = None

        if block_uuid is not None:
            block = db.query(Block).filter(Block.id == block_uuid).first()

    if block is None:
        raise HTTPException(status_code=404, detail=f"Block {block_identifier} was not found.")

    return block
