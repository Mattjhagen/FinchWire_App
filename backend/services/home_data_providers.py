from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

import requests


class ProviderError(RuntimeError):
    pass


@dataclass
class WeatherSnapshot:
    locationLabel: str
    temperatureC: Optional[float]
    temperatureF: Optional[float]
    condition: str
    highC: Optional[float]
    lowC: Optional[float]
    observedAt: str

    def as_dict(self) -> Dict[str, object]:
        return {
            "locationLabel": self.locationLabel,
            "temperatureC": self.temperatureC,
            "temperatureF": self.temperatureF,
            "condition": self.condition,
            "highC": self.highC,
            "lowC": self.lowC,
            "highF": _c_to_f(self.highC),
            "lowF": _c_to_f(self.lowC),
            "observedAt": self.observedAt,
        }


@dataclass
class PriceWatchItem:
    symbol: str
    assetType: str
    displayName: str
    price: float
    currency: str
    change24h: Optional[float]
    changePercent24h: Optional[float]
    updatedAt: str

    def as_dict(self) -> Dict[str, object]:
        return {
            "symbol": self.symbol,
            "assetType": self.assetType,
            "displayName": self.displayName,
            "price": self.price,
            "currency": self.currency,
            "change24h": self.change24h,
            "changePercent24h": self.changePercent24h,
            "updatedAt": self.updatedAt,
        }


@dataclass
class VerseOfDay:
    reference: str
    text: str
    translation: Optional[str]
    fetchedAt: str

    def as_dict(self) -> Dict[str, object]:
        return {
            "reference": self.reference,
            "text": self.text,
            "translation": self.translation,
            "fetchedAt": self.fetchedAt,
        }


WEATHER_CODE_MAP = {
    0: "Clear",
    1: "Mostly Clear",
    2: "Partly Cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Fog",
    51: "Light Drizzle",
    53: "Drizzle",
    55: "Heavy Drizzle",
    61: "Light Rain",
    63: "Rain",
    65: "Heavy Rain",
    66: "Freezing Rain",
    67: "Heavy Freezing Rain",
    71: "Light Snow",
    73: "Snow",
    75: "Heavy Snow",
    80: "Rain Showers",
    81: "Rain Showers",
    82: "Heavy Rain Showers",
    95: "Thunderstorm",
    96: "Thunderstorm",
    99: "Thunderstorm",
}

CRYPTO_SYMBOL_TO_ID = {
    "BTC": "bitcoin",
    "ETH": "ethereum",
    "SOL": "solana",
    "DOGE": "dogecoin",
    "XRP": "ripple",
    "AVAX": "avalanche-2",
}

_weather_cache: Dict[str, Tuple[float, WeatherSnapshot]] = {}
_market_cache: Dict[str, Tuple[float, PriceWatchItem]] = {}
_verse_cache: Optional[Tuple[float, VerseOfDay]] = None


def _timeout_sec() -> int:
    raw = os.environ.get("FINCHWIRE_PROVIDER_TIMEOUT_SEC", "7").strip()
    try:
        timeout_value = int(raw)
        return max(2, min(timeout_value, 20))
    except Exception:
        return 7


def _c_to_f(value: Optional[float]) -> Optional[float]:
    if value is None:
        return None
    return round((float(value) * 9.0 / 5.0) + 32.0, 1)


def _round_or_none(value: Optional[float], digits: int = 1) -> Optional[float]:
    if value is None:
        return None
    return round(float(value), digits)


def _is_cache_valid(cached_at: float, ttl_seconds: int) -> bool:
    return (time.time() - cached_at) <= max(1, ttl_seconds)


def _safe_float(value: object) -> Optional[float]:
    try:
        parsed = float(value)  # type: ignore[arg-type]
    except Exception:
        return None
    if parsed != parsed:  # NaN check
        return None
    return parsed


def _get_config_value(config: Optional[Dict[str, object]], key: str, env_key: str, default: str = "") -> str:
    if config and key in config:
        raw = config.get(key)
        value = str(raw or "").strip()
        if value:
            return value
    env_value = str(os.environ.get(env_key, "") or "").strip()
    if env_value:
        return env_value
    return default


def get_weather_snapshot(unit: str = "f", config: Optional[Dict[str, object]] = None) -> WeatherSnapshot:
    provider = _get_config_value(config, "weather_provider", "FINCHWIRE_WEATHER_PROVIDER", "open_meteo").lower()
    location = _get_config_value(config, "weather_location", "FINCHWIRE_WEATHER_LOCATION", "Omaha, NE")
    lat = _safe_float(_get_config_value(config, "weather_lat", "FINCHWIRE_WEATHER_LAT", "41.2565"))
    lon = _safe_float(_get_config_value(config, "weather_lon", "FINCHWIRE_WEATHER_LON", "-95.9345"))
    weather_api_key = _get_config_value(config, "weather_api_key", "FINCHWIRE_WEATHER_API_KEY", "")

    cache_key = f"{provider}:{location}:{lat}:{lon}:{unit.lower()}"
    cached = _weather_cache.get(cache_key)
    if cached and _is_cache_valid(cached[0], ttl_seconds=600):
        return cached[1]

    if provider == "weatherapi":
        if not weather_api_key:
            raise ProviderError("Weather API key is required for weatherapi provider.")
        params = {
            "key": weather_api_key,
            "q": location,
            "days": 1,
            "aqi": "no",
            "alerts": "no",
        }
        try:
            response = requests.get(
                "https://api.weatherapi.com/v1/forecast.json",
                params=params,
                timeout=_timeout_sec(),
            )
            response.raise_for_status()
            payload = response.json()
        except Exception as exc:
            raise ProviderError(f"Weather provider unavailable: {exc}") from exc

        current = payload.get("current", {}) if isinstance(payload, dict) else {}
        day = (
            payload.get("forecast", {})
            .get("forecastday", [{}])[0]
            .get("day", {})
            if isinstance(payload, dict)
            else {}
        )

        temp_c = _safe_float(current.get("temp_c"))
        high_c = _safe_float(day.get("maxtemp_c"))
        low_c = _safe_float(day.get("mintemp_c"))

        snapshot = WeatherSnapshot(
            locationLabel=str(payload.get("location", {}).get("name") or location),
            temperatureC=_round_or_none(temp_c),
            temperatureF=_round_or_none(_safe_float(current.get("temp_f"))),
            condition=str(current.get("condition", {}).get("text") or "Unknown"),
            highC=_round_or_none(high_c),
            lowC=_round_or_none(low_c),
            observedAt=str(current.get("last_updated") or ""),
        )
        _weather_cache[cache_key] = (time.time(), snapshot)
        return snapshot

    if lat is None or lon is None:
        raise ProviderError("Weather coordinates are not configured correctly.")

    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,weather_code",
        "daily": "temperature_2m_max,temperature_2m_min",
        "forecast_days": 1,
        "timezone": "auto",
    }
    try:
        response = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params=params,
            timeout=_timeout_sec(),
        )
        response.raise_for_status()
        payload = response.json()
    except Exception as exc:
        raise ProviderError(f"Weather provider unavailable: {exc}") from exc

    current = payload.get("current", {}) if isinstance(payload, dict) else {}
    daily = payload.get("daily", {}) if isinstance(payload, dict) else {}

    temp_c = _safe_float(current.get("temperature_2m"))
    weather_code = int(_safe_float(current.get("weather_code")) or 0)
    high_values = daily.get("temperature_2m_max", []) if isinstance(daily, dict) else []
    low_values = daily.get("temperature_2m_min", []) if isinstance(daily, dict) else []

    high_c = _safe_float(high_values[0]) if isinstance(high_values, list) and high_values else None
    low_c = _safe_float(low_values[0]) if isinstance(low_values, list) and low_values else None

    snapshot = WeatherSnapshot(
        locationLabel=location,
        temperatureC=_round_or_none(temp_c),
        temperatureF=_round_or_none(_c_to_f(temp_c)),
        condition=WEATHER_CODE_MAP.get(weather_code, "Unknown"),
        highC=_round_or_none(high_c),
        lowC=_round_or_none(low_c),
        observedAt=str(current.get("time") or ""),
    )
    _weather_cache[cache_key] = (time.time(), snapshot)
    return snapshot


def get_market_quote(symbol: str, asset_type: str, config: Optional[Dict[str, object]] = None) -> PriceWatchItem:
    normalized_symbol = str(symbol or "").strip().upper()
    if not normalized_symbol:
        raise ProviderError("Market symbol is required.")
    normalized_asset = str(asset_type or "").strip().lower()
    if normalized_asset not in {"stock", "crypto"}:
        raise ProviderError("Market assetType must be stock or crypto.")
    market_provider = _get_config_value(config, "market_provider", "FINCHWIRE_MARKET_PROVIDER", "coingecko_yahoo").lower()
    market_api_key = _get_config_value(config, "market_api_key", "FINCHWIRE_MARKET_API_KEY", "")

    cache_key = f"{market_provider}:{normalized_asset}:{normalized_symbol}"
    cached = _market_cache.get(cache_key)
    if cached and _is_cache_valid(cached[0], ttl_seconds=90):
        return cached[1]

    if market_provider == "finnhub":
        if not market_api_key:
            raise ProviderError("Market API key is required for finnhub provider.")
        query_symbol = normalized_symbol
        if normalized_asset == "crypto":
            query_symbol = f"BINANCE:{normalized_symbol}USDT"

        try:
            response = requests.get(
                "https://finnhub.io/api/v1/quote",
                params={"symbol": query_symbol, "token": market_api_key},
                timeout=_timeout_sec(),
            )
            response.raise_for_status()
            payload = response.json()
        except Exception as exc:
            raise ProviderError(f"Market quote provider unavailable: {exc}") from exc

        price = _safe_float(payload.get("c")) if isinstance(payload, dict) else None
        if price is None:
            raise ProviderError(f"No market quote found for {normalized_symbol}.")

        quote = PriceWatchItem(
            symbol=normalized_symbol,
            assetType=normalized_asset,
            displayName=query_symbol if normalized_asset == "crypto" else normalized_symbol,
            price=round(price, 4 if price < 1 else 2),
            currency="USD",
            change24h=_round_or_none(_safe_float(payload.get("d")), 2),
            changePercent24h=_round_or_none(_safe_float(payload.get("dp")), 2),
            updatedAt=str(payload.get("t") or time.time()),
        )
        _market_cache[cache_key] = (time.time(), quote)
        return quote

    if normalized_asset == "crypto":
        coin_id = CRYPTO_SYMBOL_TO_ID.get(normalized_symbol, normalized_symbol.lower())
        params = {
            "ids": coin_id,
            "vs_currencies": "usd",
            "include_24hr_change": "true",
        }
        try:
            response = requests.get(
                "https://api.coingecko.com/api/v3/simple/price",
                params=params,
                timeout=_timeout_sec(),
            )
            response.raise_for_status()
            payload = response.json()
        except Exception as exc:
            raise ProviderError(f"Crypto quote provider unavailable: {exc}") from exc

        row = payload.get(coin_id) if isinstance(payload, dict) else None
        if not isinstance(row, dict):
            raise ProviderError(f"No crypto quote found for {normalized_symbol}.")
        price = _safe_float(row.get("usd"))
        change_pct = _safe_float(row.get("usd_24h_change"))
        if price is None:
            raise ProviderError(f"Crypto quote for {normalized_symbol} is missing price data.")
        quote = PriceWatchItem(
            symbol=normalized_symbol,
            assetType="crypto",
            displayName=coin_id.replace("-", " ").title(),
            price=round(price, 4 if price < 1 else 2),
            currency="USD",
            change24h=None,
            changePercent24h=_round_or_none(change_pct, 2),
            updatedAt=str(time.time()),
        )
        _market_cache[cache_key] = (time.time(), quote)
        return quote

    try:
        response = requests.get(
            "https://query1.finance.yahoo.com/v7/finance/quote",
            params={"symbols": normalized_symbol},
            timeout=_timeout_sec(),
        )
        response.raise_for_status()
        payload = response.json()
    except Exception as exc:
        raise ProviderError(f"Stock quote provider unavailable: {exc}") from exc

    quote_response = payload.get("quoteResponse", {}) if isinstance(payload, dict) else {}
    result = quote_response.get("result", []) if isinstance(quote_response, dict) else []
    row = result[0] if isinstance(result, list) and result else None
    if not isinstance(row, dict):
        raise ProviderError(f"No stock quote found for {normalized_symbol}.")

    price = _safe_float(row.get("regularMarketPrice"))
    if price is None:
        raise ProviderError(f"Stock quote for {normalized_symbol} is missing price data.")

    quote = PriceWatchItem(
        symbol=normalized_symbol,
        assetType="stock",
        displayName=str(row.get("shortName") or row.get("longName") or normalized_symbol),
        price=round(price, 2),
        currency=str(row.get("currency") or "USD"),
        change24h=_round_or_none(_safe_float(row.get("regularMarketChange")), 2),
        changePercent24h=_round_or_none(_safe_float(row.get("regularMarketChangePercent")), 2),
        updatedAt=str(row.get("regularMarketTime") or time.time()),
    )
    _market_cache[cache_key] = (time.time(), quote)
    return quote


def get_verse_of_day() -> VerseOfDay:
    global _verse_cache
    if _verse_cache and _is_cache_valid(_verse_cache[0], ttl_seconds=6 * 60 * 60):
        return _verse_cache[1]

    try:
        response = requests.get(
            "https://beta.ourmanna.com/api/v1/get/",
            params={"format": "json"},
            timeout=_timeout_sec(),
        )
        response.raise_for_status()
        payload = response.json()
    except Exception as exc:
        logger.error(f"Verse provider failed: {exc}. Using fallback.")
        return VerseOfDay(
            reference="Jeremiah 29:11",
            text="For I know the plans I have for you,\" declares the Lord, \"plans to prosper you and not to harm you, plans to give you hope and a future.",
            translation="NIV",
            fetchedAt=str(time.time()),
        )

    details = (
        payload.get("verse", {}).get("details", {})
        if isinstance(payload, dict)
        else {}
    )
    reference = str(details.get("reference") or "").strip()
    text = str(details.get("text") or "").strip()
    translation = str(details.get("version") or "").strip() or None
    if not reference or not text:
        # Fallback to a core truth if provider fails
        return VerseOfDay(
            reference="Jeremiah 29:11",
            text="For I know the plans I have for you,\" declares the Lord, \"plans to prosper you and not to harm you, plans to give you hope and a future.",
            translation="NIV",
            fetchedAt=str(time.time()),
        )

    verse = VerseOfDay(
        reference=reference,
        text=text,
        translation=translation,
        fetchedAt=str(time.time()),
    )
    _verse_cache = (time.time(), verse)
    return verse
