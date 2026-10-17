'use client';
import { createContext, useContext, type ReactNode } from 'react';

export type MapSettings = { tileUrl: string; attribution: string; attributionUrl: string };
export const DEFAULT_MAP_SETTINGS: MapSettings = {
  tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '© OpenStreetMap contributors',
  attributionUrl: 'https://www.openstreetmap.org/copyright',
};
const MapSettingsContext = createContext<MapSettings>(DEFAULT_MAP_SETTINGS);
export function MapSettingsProvider({ value, children }: { value: MapSettings; children: ReactNode }) {
  return <MapSettingsContext.Provider value={value}>{children}</MapSettingsContext.Provider>;
}
export function useMapSettings() { return useContext(MapSettingsContext); }
