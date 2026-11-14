/**
 * Webhook URL 加密存取
 *
 * Webhook URL 中的 key 参数为认证凭证，存储时用 AES-256-GCM 加密（复用 encryption.ts），
 * 与邮箱密码、AI API Key 的存储策略一致（见 CLAUDE.md「数据加密」）。
 *
 * 存量兼容：早期版本明文存储，读取时先尝试解密，解密失败视为明文旧数据，
 * 并自动加密写回（懒迁移，无需手工迁移脚本）。
 */

import { prisma } from '@/lib/prisma'
import { encrypt, decrypt } from '@/lib/services/encryption'
import {
  DEFAULT_CONFIG_KEY,
  WEBHOOK_URL_FIELD,
} from '@/lib/constants/webhook-fields'

/**
 * 解密存储的 Webhook URL；非密文（明文旧数据）时原样返回
 * @returns { url 解密后的 URL, encrypted 存储值是否为密文 }
 */
export function decryptWebhookUrl(stored: string): { url: string; encrypted: boolean } {
  try {
    const decrypted = decrypt(stored)
    if (decrypted.startsWith('https://')) {
      return { url: decrypted, encrypted: true }
    }
  } catch {
    // 非密文（明文旧数据），原样返回
  }
  return { url: stored, encrypted: false }
}

/**
 * 从数据库读取 Webhook URL（解密后返回）；未配置返回 null
 * 检测到明文旧数据时自动加密写回（懒迁移）
 */
export async function loadStoredWebhookUrl(): Promise<string | null> {
  const row = await prisma.webhookIntegration.findFirst({
    where: { configKey: DEFAULT_CONFIG_KEY, hrField: WEBHOOK_URL_FIELD },
  })
  if (!row?.transformConfig) return null

  const { url, encrypted } = decryptWebhookUrl(row.transformConfig)
  if (!encrypted) {
    // 明文旧数据 → 一次性加密迁移
    await prisma.webhookIntegration.update({
      where: { id: row.id },
      data: { transformConfig: encrypt(url) },
    })
  }
  return url
}

/**
 * 保存 Webhook URL（加密存储，upsert）
 */
export async function saveWebhookUrl(webhookUrl: string): Promise<void> {
  const existing = await prisma.webhookIntegration.findFirst({
    where: { configKey: DEFAULT_CONFIG_KEY, hrField: WEBHOOK_URL_FIELD },
  })

  const encrypted = encrypt(webhookUrl)
  if (existing) {
    await prisma.webhookIntegration.update({
      where: { id: existing.id },
      data: { transformConfig: encrypted },
    })
  } else {
    await prisma.webhookIntegration.create({
      data: {
        configKey: DEFAULT_CONFIG_KEY,
        hrField: WEBHOOK_URL_FIELD,
        transformConfig: encrypted,
        transformType: 'FIXED',
      },
    })
  }
}

/**
 * Webhook URL 脱敏（供前端回显）：key 参数仅保留后 4 位，避免完整凭证常驻页面
 */
export function maskWebhookUrl(url: string): string {
  try {
    const u = new URL(url)
    const key = u.searchParams.get('key')
    if (key) {
      u.searchParams.set('key', `****${key.slice(-4)}`)
    }
    return u.toString()
  } catch {
    return url
  }
}
