/**
 * 崩溃循环检测器
 *
 * 持久化队列恢复状态到文件，跨进程重启保留
 * 如果短时间内反复恢复孤儿任务（说明处理时会崩溃），标记为 ERROR 阻断循环
 */

const CRASH_LOOP_THRESHOLD = 3        // 短时间内恢复超过 3 次判定为崩溃循环
const CRASH_LOOP_WINDOW_MS = 120_000  // 2 分钟窗口
const CRASH_STATE_EXPIRE_MS = 300_000 // 5 分钟后自动过期重置

interface CrashState {
  lastRecoveryTime: number
  recoveryCount: number
}

function getStateFilePath(queueName: string): string {
  return `${process.cwd()}/data/.crash-state-${queueName}.json`
}

export function readCrashState(queueName: string): CrashState {
  try {
    const fs = require('fs')
    const filePath = getStateFilePath(queueName)
    if (!fs.existsSync(filePath)) return { lastRecoveryTime: 0, recoveryCount: 0 }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    // 过期重置
    if (Date.now() - data.lastRecoveryTime > CRASH_STATE_EXPIRE_MS) {
      return { lastRecoveryTime: 0, recoveryCount: 0 }
    }
    return data
  } catch {
    return { lastRecoveryTime: 0, recoveryCount: 0 }
  }
}

export function writeCrashState(queueName: string, state: CrashState): void {
  try {
    const fs = require('fs')
    const dir = require('path').dirname(getStateFilePath(queueName))
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(getStateFilePath(queueName), JSON.stringify(state))
  } catch {
    // 写入失败不影响主流程
  }
}

/**
 * 检测是否处于崩溃循环
 * @returns true 表示检测到崩溃循环，应跳过恢复
 */
export function isCrashLoop(queueName: string): boolean {
  const state = readCrashState(queueName)
  const now = Date.now()
  const timeSinceLastRecovery = now - state.lastRecoveryTime
  return (
    timeSinceLastRecovery < CRASH_LOOP_WINDOW_MS &&
    state.recoveryCount >= CRASH_LOOP_THRESHOLD
  )
}

/**
 * 记录一次恢复尝试
 * @returns true 表示检测到崩溃循环（已记录但应跳过恢复）
 */
export function recordRecovery(queueName: string): boolean {
  const state = readCrashState(queueName)
  const now = Date.now()
  const timeSinceLastRecovery = now - state.lastRecoveryTime

  const newCount =
    timeSinceLastRecovery < CRASH_LOOP_WINDOW_MS ? state.recoveryCount + 1 : 1

  writeCrashState(queueName, {
    lastRecoveryTime: now,
    recoveryCount: newCount,
  })

  return newCount >= CRASH_LOOP_THRESHOLD && timeSinceLastRecovery < CRASH_LOOP_WINDOW_MS
}

/**
 * 重置崩溃循环状态（恢复正常后调用）
 */
export function resetCrashState(queueName: string): void {
  writeCrashState(queueName, { lastRecoveryTime: 0, recoveryCount: 0 })
}
