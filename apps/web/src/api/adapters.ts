/** The channels the connection wizard offers. Zod-free, so client components can import it cheaply. */
export const ADAPTERS = [
  "BookingCom",
  "AirBNB",
  "Expedia",
  "Agoda",
  "Vrbo",
  "GoogleHotelAds",
] as const;
