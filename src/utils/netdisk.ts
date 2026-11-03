import type { ComposerTranslation } from 'vue-i18n'

/**
 * 网盘平台标识集中管理：卡片徽标与筛选维度共用同一套展示名和配色，
 * 避免后端渠道名标签变化时平台信息丢失。
 */

// 已知网盘平台标识，顺序与徽标配色保持一致。
export const NETDISK_PLATFORMS = ['quark', 'uc', 'pan139', 'pan123', 'pan115', 'guangya', 'baidu', 'xunlei'] as const

// 历史后端使用 c139 标识中国移动云盘，展示时与 pan139 合并为同一平台。
const netdiskPlatformAliases: Record<string, string> = {
  c139: 'pan139',
}

/** 把平台别名收敛为展示用标识，空值返回空串。 */
function canonicalNetdiskPlatform(platform: string | undefined): string {
  if (!platform) return ''
  return netdiskPlatformAliases[platform] || platform
}

/** 网盘平台徽标的主色样式类，未知平台统一回退到中性色。 */
const netdiskPlatformStyles: Record<string, string> = {
  quark: 'chip-netdisk-quark',
  uc: 'chip-netdisk-uc',
  pan139: 'chip-netdisk-pan139',
  pan123: 'chip-netdisk-pan123',
  pan115: 'chip-netdisk-pan115',
  guangya: 'chip-netdisk-guangya',
  baidu: 'chip-netdisk-baidu',
  xunlei: 'chip-netdisk-xunlei',
}

/** 返回网盘平台的国际化展示名，未知平台回退显示原始标识，空值返回空串。 */
export function getNetdiskPlatformName(t: ComposerTranslation, platform: string | undefined): string {
  const canonical = canonicalNetdiskPlatform(platform)
  if (!canonical) return ''
  if ((NETDISK_PLATFORMS as readonly string[]).includes(canonical)) {
    return t(`torrent.netdiskPlatform.${canonical}`)
  }
  return canonical
}

/** 返回网盘平台徽标的样式类，未知平台使用默认中性配色。 */
export function getNetdiskChipClass(platform: string | undefined): string {
  const canonical = canonicalNetdiskPlatform(platform)
  return (canonical && netdiskPlatformStyles[canonical]) || 'chip-netdisk-unknown'
}

/** 网盘账号状态展示元信息：active 有效，expired 已过期，其余视为未验证。 */
export interface NetdiskStatusMeta {
  text: string
  color: string
  icon: string
}

export function getNetdiskStatusMeta(t: ComposerTranslation, status: string | undefined): NetdiskStatusMeta {
  switch (status) {
    case 'active':
      return { text: t('netdisk.status.active'), color: 'success', icon: 'mdi-check-circle-outline' }
    case 'expired':
      return { text: t('netdisk.status.expired'), color: 'error', icon: 'mdi-alert-circle-outline' }
    default:
      return { text: t('netdisk.status.unknown'), color: 'secondary', icon: 'mdi-help-circle-outline' }
  }
}

/** 网盘配额使用百分比，无总额时返回 0。 */
export function getNetdiskQuotaPercent(quotaUsed: number | undefined, quotaTotal: number | undefined): number {
  const total = Number(quotaTotal || 0)
  if (total <= 0) return 0
  return Math.min(100, Math.round((Number(quotaUsed || 0) / total) * 100))
}

/** 完整日期时间：账号检测与过期都精确到分钟，避免只显示月日造成误解。 */
export function formatNetdiskDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 账号最小形状：选中/回退逻辑只依赖这三个字段。 */
export interface NetdiskSelectableAccount {
  id: number
  platform: string
  is_primary: boolean
}

/**
 * 初始选中规则：优先 ?account_id= 匹配，其次主账号，其次列表第一个。
 * 列表为空或均不匹配时返回 null。
 */
export function resolveInitialNetdiskAccountId<T extends NetdiskSelectableAccount>(
  accounts: readonly T[],
  queryAccountId?: string | number | null,
): number | null {
  if (accounts.length === 0) return null
  if (queryAccountId != null && queryAccountId !== '') {
    const id = Number(queryAccountId)
    if (!Number.isNaN(id) && accounts.some(account => account.id === id)) return id
  }
  const primary = accounts.find(account => account.is_primary)
  if (primary) return primary.id
  return accounts[0].id
}

/**
 * 删除/失效后的回退选中：同平台下一个 → 同平台最后一个 → 跨平台按原索引就近。
 * 传入删除前的有序列表与被移除的账号 id，返回新的选中 id 或 null。
 */
export function resolveFallbackNetdiskAccountId<T extends NetdiskSelectableAccount>(
  accountsBefore: readonly T[],
  removedId: number,
): number | null {
  const index = accountsBefore.findIndex(account => account.id === removedId)
  if (index === -1) return accountsBefore[0]?.id ?? null
  const removed = accountsBefore[index]
  const remaining = accountsBefore.filter(account => account.id !== removedId)
  if (remaining.length === 0) return null
  // 同平台：优先原顺序中被删账号之后的下一个
  const samePlatformAfter = remaining.find(
    account => account.platform === removed.platform && accountsBefore.indexOf(account) > index,
  )
  if (samePlatformAfter) return samePlatformAfter.id
  // 同平台最后一个
  const samePlatform = remaining.filter(account => account.platform === removed.platform)
  if (samePlatform.length > 0) return samePlatform[samePlatform.length - 1].id
  // 跨平台：按原索引就近（先向后，再向前）
  const after = remaining.find(account => accountsBefore.indexOf(account) > index)
  if (after) return after.id
  return remaining[remaining.length - 1].id
}
