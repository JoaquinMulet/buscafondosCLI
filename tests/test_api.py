import pytest
from buscafondos.api import BuscaFondosClient


@pytest.fixture
def client():
    return BuscaFondosClient()


def test_health(client):
    data = client.health()
    assert data["status"] == "ok"
    assert "last_scraped_date" in data
    assert "total_records" in data


def test_list_providers(client):
    data = client.list_providers()
    assert "data" in data
    assert len(data["data"]) > 0


def test_list_all_funds(client):
    data = client.list_all_funds()
    assert "data" in data
    items = data["data"]
    assert len(items) > 0
    item = items[0]
    assert "run" in item
    assert "fundName" in item
    assert "tac" in item