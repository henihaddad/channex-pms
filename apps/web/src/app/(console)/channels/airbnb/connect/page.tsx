import { redirect } from "next/navigation";

/**
 * The link the assistant hands the host (MCP tool `connect_airbnb`, spec 07 CH-5): a console page,
 * so a lapsed session goes through sign-in first, then straight on to Airbnb's consent screen.
 * The start route checks the permission and binds the authorisation to this session.
 */
export default async function ConnectAirbnbPage({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string }>;
}) {
  const { propertyId } = await searchParams;
  const query = propertyId && /^[\w-]{1,64}$/.test(propertyId) ? `?propertyId=${propertyId}` : "";
  redirect(`/api/v1/channels/oauth/airbnb/start${query}`);
}
