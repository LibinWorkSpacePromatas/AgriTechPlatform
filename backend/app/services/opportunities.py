from __future__ import annotations

from app.db.models import Block
from app.schemas.opportunities import OpportunitiesResponse, OpportunityCard
from app.schemas.satellite import BlockInsightsResponse


def build_opportunities_response(block: Block, satellite_response: BlockInsightsResponse) -> OpportunitiesResponse:
    relevant_alerts = [alert for alert in satellite_response.alerts if alert.metric in {"ndre", "evi"}]
    warning = satellite_response.error

    if satellite_response.data_quality == "no_data" or satellite_response.ndre is None or satellite_response.evi is None:
        if not warning:
            warning = "Real NDRE and EVI data are required before growth opportunities can be evaluated."
        return OpportunitiesResponse(
            block_id=satellite_response.block_id,
            source=satellite_response.source,
            composite_date_from=satellite_response.composite_date_from,
            composite_date_to=satellite_response.composite_date_to,
            ndvi=satellite_response.ndvi,
            ndwi=satellite_response.ndwi,
            evi=satellite_response.evi,
            ndre=satellite_response.ndre,
            lai=satellite_response.lai,
            cloud_cover_pct=satellite_response.cloud_cover_pct,
            pixel_count=satellite_response.pixel_count,
            map_tile_url=satellite_response.map_tile_url,
            data_quality=satellite_response.data_quality,
            crop=block.crop,
            ndre_status=satellite_response.ndre_status,
            evi_status=satellite_response.evi_status,
            warning=warning,
            alerts=relevant_alerts,
            opportunities=[],
        )

    opportunities = _build_cards(block, satellite_response)
    return OpportunitiesResponse(
        block_id=satellite_response.block_id,
        source=satellite_response.source,
        composite_date_from=satellite_response.composite_date_from,
        composite_date_to=satellite_response.composite_date_to,
        ndvi=satellite_response.ndvi,
        ndwi=satellite_response.ndwi,
        evi=satellite_response.evi,
        ndre=satellite_response.ndre,
        lai=satellite_response.lai,
        cloud_cover_pct=satellite_response.cloud_cover_pct,
        pixel_count=satellite_response.pixel_count,
        map_tile_url=satellite_response.map_tile_url,
        data_quality=satellite_response.data_quality,
        crop=block.crop,
        ndre_status=satellite_response.ndre_status,
        evi_status=satellite_response.evi_status,
        warning=warning,
        alerts=relevant_alerts,
        opportunities=opportunities,
    )


def _build_cards(block: Block, satellite_response: BlockInsightsResponse) -> list[OpportunityCard]:
    ndre = satellite_response.ndre or 0.0
    evi = satellite_response.evi or 0.0
    cards: list[OpportunityCard] = []

    if satellite_response.ndre_status == "nutrient_issue":
        cards.append(
            OpportunityCard(
                id="nutrient-recovery",
                title="Nutrient Recovery Opportunity",
                description="NDRE indicates nutrient pressure, so the strongest opportunity is to restore chlorophyll activity before pushing growth.",
                full_description=(
                    f"Block {block.lanslu or block.id} is returning NDRE {ndre:.3f}, below the canonical nutrient threshold. "
                    "Correcting nutrient constraints first gives the block a better platform for later canopy and yield improvements."
                ),
                key_points=[
                    f"NDRE is {ndre:.3f}, below the nutrient issue threshold of 0.25.",
                    f"EVI is {evi:.3f}, which shows the current canopy response to that nutrient state.",
                    "Use this cycle to target tissue testing, fertigation timing, and weaker chlorophyll zones.",
                ],
                tags=["ndre", "nutrients", "recovery"],
                priority="high",
                driver_indices=["ndre", "evi"],
            )
        )
    else:
        cards.append(
            OpportunityCard(
                id="quality-lift",
                title="Quality Lift Opportunity",
                description="NDRE is holding in the normal range, which supports targeted quality programs and premium fruit management.",
                full_description=(
                    f"Block {block.lanslu or block.id} is returning NDRE {ndre:.3f}, which is inside the canonical nutrient band. "
                    "That keeps nutrient activity supportive for quality-focused canopy and fruit decisions."
                ),
                key_points=[
                    f"NDRE is {ndre:.3f}, so nutrient activity is not currently triggering a backend issue.",
                    "Use the next refresh cycle to confirm stability before committing more aggressively.",
                    "This is the right state for selective premium-management or varietal trial planning.",
                ],
                tags=["ndre", "quality", "premium"],
                priority="medium",
                driver_indices=["ndre", "evi"],
            )
        )

    if satellite_response.evi_status == "canopy_alert":
        cards.append(
            OpportunityCard(
                id="canopy-reset",
                title="Canopy Reset Opportunity",
                description="EVI is above the canopy alert line, creating an opportunity to rebalance vigour and improve light/air movement.",
                full_description=(
                    f"EVI is {evi:.3f}, above the canonical canopy alert threshold. "
                    "Reducing excess canopy pressure can improve fruit exposure, spray penetration, and block uniformity."
                ),
                key_points=[
                    f"EVI is {evi:.3f}, above the canopy alert threshold of 0.50.",
                    "Review shoot density, hedging, and canopy airflow in the strongest zones first.",
                    "Pair canopy action with the current NDRE result so the block is not pushed into nutrient imbalance.",
                ],
                tags=["evi", "canopy", "vigour"],
                priority="high",
                driver_indices=["ndre", "evi"],
            )
        )
    else:
        cards.append(
            OpportunityCard(
                id="canopy-efficiency",
                title="Canopy Efficiency Opportunity",
                description="EVI is not in canopy alert territory, which supports steady growth programs without corrective pruning pressure.",
                full_description=(
                    f"EVI is {evi:.3f}, so the block is not currently in a canopy alert state. "
                    "That makes it easier to focus on efficiency gains rather than corrective canopy reduction."
                ),
                key_points=[
                    f"EVI is {evi:.3f}, remaining at or below the 0.50 canopy alert threshold.",
                    "Use this state to protect uniform canopy development across the next composite cycle.",
                    "Combine canopy stability with NDRE strength when prioritizing blocks for premium management.",
                ],
                tags=["evi", "canopy", "efficiency"],
                priority="medium",
                driver_indices=["ndre", "evi"],
            )
        )

    cards.append(
        OpportunityCard(
            id="next-refresh-plan",
            title="Next Refresh Planning Opportunity",
            description="NDRE and EVI together can be used as the block-level watchlist for the next five-day Sentinel refresh.",
            full_description=(
                f"This block is currently reading NDRE {ndre:.3f} and EVI {evi:.3f}. "
                "Use those two indices together to decide whether the next cycle should focus on nutrient uplift, canopy control, or premium quality tracking."
            ),
            key_points=[
                f"NDRE driver state: {satellite_response.ndre_status}.",
                f"EVI driver state: {satellite_response.evi_status}.",
                "Track both indices together rather than treating growth and nutrient signals independently.",
            ],
            tags=["ndre", "evi", "planning"],
            priority="low",
            driver_indices=["ndre", "evi"],
        )
    )

    priority_rank = {"high": 0, "medium": 1, "low": 2}
    return sorted(cards, key=lambda card: priority_rank[card.priority])
