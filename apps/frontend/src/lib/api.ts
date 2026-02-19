/**
 * Backend API Client
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// 型定義
export interface Instance {
  id: number;
  location: string;
  name: string;
  world_name: string;
  capacity: number;
  created_at: string;
  is_active: boolean;
}

export interface Metric {
  timestamp: string;
  instance_id: number;
  queue_size: number;
  current_users: number;
}

export interface InstanceWithMetrics extends Instance {
  metrics: Metric[];
}

export interface EventGroup {
  eventDate: string;
  startTime: string;
  endTime: string;
  instances: InstanceWithMetrics[];
}

// モックデータ（開発用）
function generateMockMetrics(instanceId: number, capacity: number, eventDate: Date): Metric[] {
  const metrics: Metric[] = [];
  const totalPoints = 60; // 5分×60 = 5時間分
  const fillUpEndPoint = Math.floor(totalPoints * 0.15); // 最初の15%で満員に

  for (let m = 0; m < totalPoints; m++) {
    const timestamp = new Date(eventDate);
    timestamp.setMinutes(timestamp.getMinutes() + m * 5);

    let currentUsers: number;
    let queueSize: number;

    if (m < fillUpEndPoint) {
      // フェーズ1: 参加者が増えていく（待機列なし）
      currentUsers = Math.floor(capacity * (m / fillUpEndPoint));
      queueSize = 0;
    } else {
      // フェーズ2: 満員固定、待機列だけ変動
      currentUsers = capacity;

      const afterFillRatio = (m - fillUpEndPoint) / (totalPoints - fillUpEndPoint);
      const peakQueue = Math.floor(capacity * 0.5);
      const queueCurve = Math.sin(afterFillRatio * Math.PI); // 山型
      const randomFactor = 0.85 + Math.sin(m * 1.7) * 0.1 + Math.cos(m * 0.9) * 0.05;

      queueSize = Math.max(0, Math.floor(peakQueue * queueCurve * randomFactor));
    }

    metrics.push({
      timestamp: timestamp.toISOString(),
      instance_id: instanceId,
      current_users: currentUsers,
      queue_size: queueSize,
    });
  }

  return metrics;
}

function generateMockData(): EventGroup[] {
  const now = new Date();
  const events: EventGroup[] = [];

  // 今日のイベント: 1時間前開始〜4時間後終了（必ずLIVE状態）
  const todayStart = new Date(now);
  todayStart.setHours(todayStart.getHours() - 1, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(todayEnd.getHours() + 4, 0, 0, 0);
  const todayDateStr = now.toISOString().split("T")[0];

  const todayInstances: InstanceWithMetrics[] = [];
  const todayCapacities = [80, 40, 60, 32];
  for (let i = 0; i < 4; i++) {
    const capacity = todayCapacities[i];
    todayInstances.push({
      id: i + 1,
      location: `wrld_xxxxx:${1000 + i}~region(jp)`,
      name: `Instance ${String.fromCharCode(65 + i)}`,
      world_name: "VRC Event World",
      capacity,
      created_at: todayStart.toISOString(),
      is_active: true,
      metrics: generateMockMetrics(i + 1, capacity, todayStart),
    });
  }
  events.push({
    eventDate: todayDateStr,
    startTime: todayStart.toISOString(),
    endTime: todayEnd.toISOString(),
    instances: todayInstances,
  });

  // 過去2日分のイベント（固定時間帯: 22:00〜翌2:00）
  for (let d = 1; d <= 2; d++) {
    const eventDate = new Date(now);
    eventDate.setDate(eventDate.getDate() - d);
    const dateStr = eventDate.toISOString().split("T")[0];

    const startTime = new Date(eventDate);
    startTime.setHours(22, 0, 0, 0);
    const endTime = new Date(eventDate);
    endTime.setDate(endTime.getDate() + 1);
    endTime.setHours(2, 0, 0, 0);

    const instances: InstanceWithMetrics[] = [];
    const capacities = [80, 40, 60];
    for (let i = 0; i < 3; i++) {
      const capacity = capacities[i];
      instances.push({
        id: d * 10 + i + 1,
        location: `wrld_xxxxx:${1000 + i}~region(jp)`,
        name: `Instance ${String.fromCharCode(65 + i)}`,
        world_name: "VRC Event World",
        capacity,
        created_at: startTime.toISOString(),
        is_active: true,
        metrics: generateMockMetrics(d * 10 + i + 1, capacity, startTime),
      });
    }

    events.push({
      eventDate: dateStr,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      instances,
    });
  }

  return events;
}

// API呼び出し関数
export async function fetchEventGroups(days: number = 30): Promise<EventGroup[]> {
  // モックモード
  if (process.env.NEXT_PUBLIC_USE_MOCK_API === "true") {
    return generateMockData();
  }

  try {
    const res = await fetch(`${API_URL}/api/event-groups?days=${days}`, {
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }

    return await res.json();
  } catch (error) {
    console.error("Failed to fetch event groups:", error);
    throw error;
  }
}

export async function fetchInstances(activeOnly: boolean = true): Promise<Instance[]> {
  if (process.env.NEXT_PUBLIC_USE_MOCK_API === "true") {
    return [];
  }

  try {
    const res = await fetch(`${API_URL}/api/instances?active_only=${activeOnly}`, {
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }

    return await res.json();
  } catch (error) {
    console.error("Failed to fetch instances:", error);
    throw error;
  }
}

export async function fetchMetrics(instanceId?: number, hours: number = 24): Promise<Metric[]> {
  if (process.env.NEXT_PUBLIC_USE_MOCK_API === "true") {
    return [];
  }

  try {
    let url = `${API_URL}/api/metrics?hours=${hours}`;
    if (instanceId) {
      url += `&instance_id=${instanceId}`;
    }

    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }

    return await res.json();
  } catch (error) {
    console.error("Failed to fetch metrics:", error);
    throw error;
  }
}

export async function checkApiHealth(): Promise<boolean> {
  if (process.env.NEXT_PUBLIC_USE_MOCK_API === "true") {
    return true;
  }

  try {
    const res = await fetch(`${API_URL}/`, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}
