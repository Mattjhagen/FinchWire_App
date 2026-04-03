import { HomeTilePreferences, HomeTileType } from '../../types';

export const HOME_TILE_ORDER: HomeTileType[] = ['weather', 'market', 'verse'];

export const HOME_TILE_LABELS: Record<HomeTileType, string> = {
  weather: 'Weather',
  market: 'Market Watch',
  verse: 'Verse of the Day',
};

export const normalizeTilePreferences = (
  input?: Partial<HomeTilePreferences> | null
): HomeTilePreferences => {
  const order = Array.isArray(input?.order)
    ? input.order.filter((type): type is HomeTileType => HOME_TILE_ORDER.includes(type))
    : HOME_TILE_ORDER;
  const mergedOrder = Array.from(new Set([...order, ...HOME_TILE_ORDER])).filter((type): type is HomeTileType =>
    HOME_TILE_ORDER.includes(type)
  );

  return {
    weather: Boolean(input?.weather ?? true),
    market: Boolean(input?.market ?? true),
    verse: Boolean(input?.verse ?? true),
    order: mergedOrder,
  };
};
