import type { ComposerTranslation } from 'vue-i18n'

/**
 * 网盘平台标识集中管理：卡片徽标与筛选维度共用同一套展示名和配色，
 * 避免后端渠道名标签变化时平台信息丢失。
 */

// 已知网盘平台标识，前八项与徽标配色顺序一致；天翼云盘暂不支持取链，仅用于搜索结果显示。
export const NETDISK_PLATFORMS = ['quark', 'uc', 'pan139', 'pan123', 'pan115', 'guangya', 'baidu', 'xunlei', 'tianyi'] as const

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
  tianyi: 'chip-netdisk-tianyi',
}

// 平台图标集中维护，保证九个平台在控制台中具有稳定且不同的视觉标识。
const netdiskPlatformIcons: Record<string, string> = {
  quark: 'mdi-cloud-outline',
  uc: 'mdi-cloud-circle-outline',
  pan139: 'mdi-cellphone-arrow-down',
  pan123: 'mdi-numeric-1-box-multiple-outline',
  pan115: 'mdi-harddisk',
  guangya: 'mdi-weather-sunny',
  baidu: 'mdi-paw',
  xunlei: 'mdi-lightning-bolt-outline',
  tianyi: 'mdi-cloud-download-outline',
}

/** 返回平台图标，未知平台使用通用云盘图标。 */
export function getNetdiskPlatformIcon(platform: string | undefined): string {
  const canonical = canonicalNetdiskPlatform(platform)
  return (canonical && netdiskPlatformIcons[canonical]) || 'mdi-cloud-question-outline'
}

/** 按统一平台顺序排序，未知平台按标识排在末尾。 */
export function compareNetdiskPlatforms(a: string, b: string): number {
  const order = NETDISK_PLATFORMS as readonly string[]
  const ia = order.indexOf(canonicalNetdiskPlatform(a))
  const ib = order.indexOf(canonicalNetdiskPlatform(b))
  if (ia === -1 && ib === -1) return a.localeCompare(b)
  if (ia === -1) return 1
  if (ib === -1) return -1
  return ia - ib
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

// 分享链接前缀；未列出的平台（含天翼云盘）暂不支持由分享码拼接分享地址。
const netdiskShareUrlPrefixes: Record<string, string> = {
  xunlei: 'https://pan.xunlei.com/s/',
  uc: 'https://drive.uc.cn/s/',
  quark: 'https://pan.quark.cn/s/',
  pan115: 'https://115cdn.com/s/',
  baidu: 'https://pan.baidu.com/s/',
  guangya: 'https://www.guangyapan.com/s/',
}

/** 按平台前缀拼接分享地址；未知平台或空分享码返回空串。 */
export function buildNetdiskShareUrl(platform: string | undefined, shareCode: string | undefined): string {
  const canonical = canonicalNetdiskPlatform(platform)
  const prefix = canonical && netdiskShareUrlPrefixes[canonical]
  const code = String(shareCode || '').trim()
  if (!prefix || !code) return ''
  return `${prefix}${encodeURIComponent(code)}`
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

/** 单个网盘平台在仪表盘上的聚合状态。 */
export interface NetdiskPlatformSummary {
  platform: string
  total: number
  active: number
  /** success / warning / error */
  statusColor: 'success' | 'warning' | 'error'
  /** 全部账号 quota_total > 0 时的剩余空间之和，否则为 null。 */
  freeBytes: number | null
  /** 仅统计 speed > 0 的账号的平均速度（字节/秒），无采样为 null。 */
  avgSpeed: number | null
}

/** 按平台聚合网盘账号状态、剩余空间与平均速度，无账号的平台不出现在结果中。 */
export function summarizeNetdiskPlatforms(
  accounts: Array<{ platform: string; status: string; quota_used: number; quota_total: number; speed?: number }>,
): NetdiskPlatformSummary[] {
  const groups = new Map<
    string,
    { total: number; active: number; freeBytes: number; hasQuota: boolean; speedSum: number; speedCount: number }
  >()
  for (const account of accounts) {
    const platform = canonicalNetdiskPlatform(account.platform)
    if (!platform) continue
    let summary = groups.get(platform)
    if (!summary) {
      summary = { total: 0, active: 0, freeBytes: 0, hasQuota: false, speedSum: 0, speedCount: 0 }
      groups.set(platform, summary)
    }
    summary.total += 1
    if (account.status === 'active') summary.active += 1
    const quotaTotal = Number(account.quota_total) || 0
    if (quotaTotal > 0) {
      summary.hasQuota = true
      summary.freeBytes += Math.max(quotaTotal - (Number(account.quota_used) || 0), 0)
    }
    const speed = Number(account.speed) || 0
    if (speed > 0) {
      summary.speedSum += speed
      summary.speedCount += 1
    }
  }
  const result: NetdiskPlatformSummary[] = []
  for (const [platform, summary] of groups) {
    result.push({
      platform,
      total: summary.total,
      active: summary.active,
      statusColor: summary.active === summary.total ? 'success' : summary.active === 0 ? 'error' : 'warning',
      freeBytes: summary.hasQuota ? summary.freeBytes : null,
      avgSpeed: summary.speedCount > 0 ? summary.speedSum / summary.speedCount : null,
    })
  }
  result.sort((a, b) => compareNetdiskPlatforms(a.platform, b.platform))
  return result
}

/** 格式化网盘剩余空间：>=1TiB 用 T，否则用 G，保留两位小数且无空格；负数按 0 处理。 */
export function formatNetdiskFreeSpace(bytes: number): string {
  const safeBytes = Math.max(0, Number(bytes) || 0)
  if (safeBytes >= 1024 ** 4) return `${(safeBytes / 1024 ** 4).toFixed(2)}T`
  return `${(safeBytes / 1024 ** 3).toFixed(2)}G`
}

/** 格式化网盘传输速度：按 1024 进位，B/s 取整、KB/s 及以上保留一位小数，无采样返回 --。 */
export function formatNetdiskSpeed(bytesPerSecond: number): string {
  const safeSpeed = Number(bytesPerSecond) || 0
  if (safeSpeed <= 0) return '--'
  if (safeSpeed < 1024) return `${Math.round(safeSpeed)} B/s`
  if (safeSpeed < 1024 ** 2) return `${(safeSpeed / 1024).toFixed(1)} KB/s`
  if (safeSpeed < 1024 ** 3) return `${(safeSpeed / 1024 ** 2).toFixed(1)} MB/s`
  return `${(safeSpeed / 1024 ** 3).toFixed(1)} GB/s`
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
