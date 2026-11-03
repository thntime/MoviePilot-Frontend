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
