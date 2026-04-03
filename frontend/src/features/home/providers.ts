import { apiService } from '../../services/api';
import { AssetType, PriceWatchItem, TemperatureUnit, VerseOfDay, WeatherSnapshot } from '../../types';

export interface WeatherProvider {
  getCurrentWeather(unit: TemperatureUnit): Promise<WeatherSnapshot>;
}

export interface MarketDataProvider {
  getQuote(symbol: string, assetType: AssetType): Promise<PriceWatchItem>;
}

export interface VerseProvider {
  getVerseOfDay(): Promise<VerseOfDay>;
}

class ApiWeatherProvider implements WeatherProvider {
  async getCurrentWeather(unit: TemperatureUnit): Promise<WeatherSnapshot> {
    return apiService.getHomeWeather(unit);
  }
}

class ApiMarketProvider implements MarketDataProvider {
  async getQuote(symbol: string, assetType: AssetType): Promise<PriceWatchItem> {
    return apiService.getHomeMarket(symbol, assetType);
  }
}

class ApiVerseProvider implements VerseProvider {
  async getVerseOfDay(): Promise<VerseOfDay> {
    return apiService.getVerseOfDay();
  }
}

export const homeProviders = {
  weather: new ApiWeatherProvider(),
  market: new ApiMarketProvider(),
  verse: new ApiVerseProvider(),
};
