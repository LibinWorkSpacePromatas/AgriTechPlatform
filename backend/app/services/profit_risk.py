from __future__ import annotations

from app.schemas.satellite import SatelliteAlert


def filter_profit_risk_alerts(alerts: list[SatelliteAlert]) -> list[SatelliteAlert]:
    return [alert for alert in alerts if alert.metric == "lai"]
