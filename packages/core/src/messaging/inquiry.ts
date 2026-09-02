/** CXMSG-6: Airbnb inquiries arrive as system messages; parse what the card needs. */
export interface InquiryCard {
  checkIn: string | null;
  checkOut: string | null;
  guests: number | null;
  priceText: string | null;
  kind: "inquiry" | "reservation_request" | "alteration_request";
  deadline: string | null;
}

export function parseInquiry(body: string, receivedAtIso: string): InquiryCard {
  const dates = [...body.matchAll(/(\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]!);
  const guests = /(\d+)\s+guests?/i.exec(body);
  const price = /(?:total|price)[:\s]*([€$£]?\s?[\d.,]+\s?[A-Z]{0,3})/i.exec(body);
  const kind: InquiryCard["kind"] = /alteration/i.test(body)
    ? "alteration_request"
    : /reservation request|request to book/i.test(body)
      ? "reservation_request"
      : "inquiry";
  // Airbnb gives hosts 24 h to respond to inquiries and requests
  const deadline = new Date(Date.parse(receivedAtIso) + 24 * 3_600_000).toISOString();
  return {
    checkIn: dates[0] ?? null,
    checkOut: dates[1] ?? null,
    guests: guests ? Number(guests[1]) : null,
    priceText: price ? price[1]!.trim() : null,
    kind,
    deadline,
  };
}
