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

/** Door centres in authored car coordinates, shared by modelling and boarding. */
export const METRO_DOOR_OFFSETS = {
  head: [-8, -4.45, -0.9, 2.65, 6.2],
  trailer: [-8.1, -4.05, 0, 4.05, 8.1],
} as const;
