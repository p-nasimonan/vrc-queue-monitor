/**
 * デザインシステムのユーティリティ関数
 */

/**
 * 数値を色に変換するヘルパー
 */
export function getQueueStatusColor(queueSize: number, capacity: number) {
  const ratio = queueSize / capacity;
  
  if (ratio === 0) return "vrc.success";
  if (ratio < 0.5) return "vrc.primary";
  if (ratio < 1) return "vrc.warning";
  return "vrc.error";
}

/**
 * ユーザー数の比率から色を取得
 */
export function getCapacityColor(currentUsers: number, capacity: number) {
  const ratio = currentUsers / capacity;
  
  if (ratio < 0.5) return "vrc.success";
  if (ratio < 0.8) return "vrc.primary";
  if (ratio < 0.95) return "vrc.warning";
  return "vrc.error";
}

/**
 * ステータステキストの取得
 */
export function getInstanceStatus(currentUsers: number, capacity: number, queueSize: number) {
  if (currentUsers >= capacity && queueSize > 0) return "満員・待機列あり";
  if (currentUsers >= capacity) return "満員";
  if (currentUsers > capacity * 0.8) return "混雑";
  if (currentUsers > capacity * 0.5) return "やや混雑";
  return "空いています";
}
