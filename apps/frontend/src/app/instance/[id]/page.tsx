import { notFound } from "next/navigation";
import { fetchInstance, fetchMetrics } from "@/lib/api";
import { InstanceDetailView } from "@/components/InstanceDetailView";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function InstancePage({ params }: Props) {
  const { id } = await params;
  const instanceId = parseInt(id, 10);

  if (isNaN(instanceId)) {
    notFound();
  }

  let instance;
  let metrics;

  try {
    [instance, metrics] = await Promise.all([
      fetchInstance(instanceId),
      fetchMetrics(instanceId, 720), // 30日分
    ]);
  } catch {
    notFound();
  }

  return <InstanceDetailView instance={instance} metrics={metrics} />;
}
