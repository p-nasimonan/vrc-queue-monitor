import { fetchEventGroups, type EventGroup } from "@/lib/api";
import { EventTable } from "@/components/EventTable";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function TablePage() {
  let events: EventGroup[] = [];

  const siteName =
    process.env.NEXT_PUBLIC_SITE_NAME || config.siteName;

  try {
    events = await fetchEventGroups(config.displayDays);
  } catch (error) {
    console.error("Failed to fetch initial events:", error);
  }

  return <EventTable initialEvents={events} siteName={siteName} />;
}
