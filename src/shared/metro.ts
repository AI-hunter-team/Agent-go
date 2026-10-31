/** One physical envelope shared by the authored car, parked placement and boarding. */
export const METRO_PROFILE = {
  width: 3.6,
  widthFactor: 1.2,
  upperHeightFactor: 1.18,
  floor: 1.1,
  exteriorHalfWidth: 1.5465 * 1.2,
  interiorHalfWidth: 1.69,
  ceiling: 1.1 + (3.38 - 1.1) * 1.18,
  seatHeight: 0.46,
  platformGap: 0.16,
} as const;
