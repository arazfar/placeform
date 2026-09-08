import type { SceneAPI } from '../components/placeform/scene';
import type { Map } from 'maplibre-gl';
import type { TerraDraw } from 'terra-draw';
declare global {
  interface Window {
    __PLACEFORM_SCENE?: SceneAPI;
    __PLACEFORM_MAP?: { map: Map; draw: TerraDraw };
  }
}
export {};
