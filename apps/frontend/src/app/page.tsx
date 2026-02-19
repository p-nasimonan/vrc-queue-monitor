import { fetchEventGroups, type EventGroup } from "@/lib/api";
import { EventList } from "@/components/EventList";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function Home() {
  let events: EventGroup[] = [];

  try {
    events = await fetchEventGroups(config.displayDays);
  } catch (error) {
    console.error("Failed to fetch initial events:", error);
  }

  return <EventList initialEvents={events} />;
}
