import {forecastEncounter} from "./encounter-forecast.mjs";

self.onmessage = ({data}) => {
  self.postMessage(forecastEncounter(data.sides, data.woundCap));
};
