from services import home_data_providers


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


def test_weather_snapshot_parses_expected_fields(monkeypatch):
    payload = {
        "current": {
            "temperature_2m": 20.2,
            "weather_code": 1,
            "time": "2026-04-03T00:00:00Z",
        },
        "daily": {
            "temperature_2m_max": [24.4],
            "temperature_2m_min": [11.2],
        },
    }

    monkeypatch.setattr(
        home_data_providers.requests,
        "get",
        lambda *args, **kwargs: _FakeResponse(payload),
    )

    result = home_data_providers.get_weather_snapshot("f").as_dict()
    assert result["locationLabel"]
    assert result["temperatureF"] is not None
    assert result["highF"] is not None
    assert result["condition"] == "Mostly Clear"


def test_market_quote_crypto_parses_change(monkeypatch):
    payload = {
        "bitcoin": {
            "usd": 67234.21,
            "usd_24h_change": 3.44,
        }
    }

    monkeypatch.setattr(
        home_data_providers.requests,
        "get",
        lambda *args, **kwargs: _FakeResponse(payload),
    )

    quote = home_data_providers.get_market_quote("BTC", "crypto").as_dict()
    assert quote["symbol"] == "BTC"
    assert quote["assetType"] == "crypto"
    assert quote["price"] > 1000
    assert quote["changePercent24h"] == 3.44


def test_verse_provider_extracts_reference(monkeypatch):
    payload = {
        "verse": {
            "details": {
                "reference": "Proverbs 3:5-6",
                "text": "Trust in the Lord with all your heart.",
                "version": "NIV",
            }
        }
    }

    monkeypatch.setattr(
        home_data_providers.requests,
        "get",
        lambda *args, **kwargs: _FakeResponse(payload),
    )

    verse = home_data_providers.get_verse_of_day().as_dict()
    assert verse["reference"] == "Proverbs 3:5-6"
    assert "Trust in the Lord" in verse["text"]
