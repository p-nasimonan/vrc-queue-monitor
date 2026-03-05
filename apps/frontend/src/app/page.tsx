import { fetchEventGroups, type EventGroup } from "@/lib/api";
import { EventList } from "@/components/EventList";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function Home() {
  let events: EventGroup[] = [];

  // サーバー側で実行時に env を読む（ConfigMap の値が正しく反映される）
  const siteName =
    process.env.NEXT_PUBLIC_SITE_NAME || config.siteName;

  try {
    events = await fetchEventGroups(config.displayDays);
  } catch (error) {
    console.error("Failed to fetch initial events:", error);
  }

  return <EventList initialEvents={events} siteName={siteName} />;
}
