import type { SceneAPI } from '../components/placeform/scene';
import type { Map } from 'maplibre-gl';
declare global {
  interface Window {
    __PLACEFORM_SCENE?: SceneAPI;
    __PLACEFORM_MAP?: { map: Map };
  }
}
export {};
