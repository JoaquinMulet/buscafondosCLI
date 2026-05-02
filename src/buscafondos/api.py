import httpx
from typing import Optional

BASE_URL = "https://api.buscafondos.com"


class BuscaFondosClient:
    def __init__(self, base_url: str = BASE_URL):
        self.base_url = base_url
        self._client = httpx.Client(timeout=30.0)

    def _get(self, path: str, params: Optional[dict] = None):
        resp = self._client.get(f"{self.base_url}{path}", params=params)
        resp.raise_for_status()
        return resp.json()

    def health(self):
        return self._get("/health")

    def list_providers(self):
        return self._get("/api/asset_providers")

    def list_funds(self, provider_id: int):
        return self._get(f"/api/asset_providers/{provider_id}/conceptual_assets")

    def list_series(self, concept_id: int):
        return self._get(f"/api/conceptual_assets/{concept_id}/real_assets")

    def get_days(self, asset_id: int, from_date: Optional[str] = None):
        params = {"from_date": from_date} if from_date else None
        return self._get(f"/api/real_assets/{asset_id}/days", params=params)

    def get_expense_ratio(self, asset_id: int):
        return self._get(f"/api/real_assets/{asset_id}/expense_ratio")

    def get_risk_metrics(self, asset_id: int):
        return self._get(f"/api/real_assets/{asset_id}/risk_metrics")

    def get_expense_ratio_history(self, asset_id: int, from_date: Optional[str] = None):
        params = {"from_date": from_date} if from_date else None
        return self._get(f"/api/real_assets/{asset_id}/expense_ratio/history", params=params)

    def ranking(self, metric: str = "patrimony", date: Optional[str] = None):
        params = {"metric": metric}
        if date:
            params["date"] = date
        return self._get("/api/agf_stats/ranking", params=params)

    def evolution(
        self,
        administrators: list[str],
        metric: str = "patrimony",
        from_month: Optional[str] = None,
        to_month: Optional[str] = None,
    ):
        params = {"administrator": administrators, "metric": metric}
        if from_month:
            params["from_month"] = from_month
        if to_month:
            params["to_month"] = to_month
        return self._get("/api/agf_stats/evolution", params=params)

    def list_all_funds(self, category: Optional[str] = None, date: Optional[str] = None):
        params = {}
        if category:
            params["category"] = category
        if date:
            params["date"] = date
        return self._get("/api/all-funds", params=params)

    def cartera_resumen(self, run: str, month: Optional[str] = None):
        params = {"month": month} if month else None
        return self._get(f"/api/funds/{run}/cartera/resumen", params=params)

    def cartera_holdings(
        self, run: str, month: Optional[str] = None, market: str = "all"
    ):
        params = {"market": market}
        if month:
            params["month"] = month
        return self._get(f"/api/funds/{run}/cartera/holdings", params=params)

    def close(self):
        self._client.close()