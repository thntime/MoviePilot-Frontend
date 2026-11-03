import api from './index'

/** 网盘文件平台能力开关；不支持的操作前端按此隐藏。 */
export interface NetdiskCapabilities {
  quota?: boolean
  browse?: boolean
  download?: boolean
  share?: boolean
  move?: boolean
  rename?: boolean
  delete?: boolean
}

export interface NetdiskQuota {
  used: number
  total: number
}

export interface NetdiskFileItem {
  file_id: string
  name: string
  size: number
  is_dir: boolean
  updated_at: string | null
  parent_id: string
}

export interface NetdiskShareResult {
  url: string
  password: string
  expires_at: string | null
}

interface CapabilitiesPayload {
  capabilities: NetdiskCapabilities
}

interface QuotaPayload {
  quota: NetdiskQuota
}

interface ListPayload {
  files: NetdiskFileItem[]
}

interface SharePayload {
  share: NetdiskShareResult
}

/** 查询账号文件能力。 */
export async function fetchNetdiskFileCapabilities(accountId: number): Promise<NetdiskCapabilities> {
  const payload = await api.get<CapabilitiesPayload, CapabilitiesPayload>(`netdisk/files/${accountId}/capabilities`, {
    feedback: 'silent',
  })
  return payload?.capabilities ?? {}
}

/** 查询账号空间用量；平台不支持 quota 时不要调用。 */
export async function fetchNetdiskFileQuota(accountId: number): Promise<NetdiskQuota> {
  const payload = await api.get<QuotaPayload, QuotaPayload>(`netdisk/files/${accountId}/quota`, {
    feedback: 'silent',
  })
  return payload?.quota ?? { used: 0, total: 0 }
}

/** 列出目录下的文件；parent_id 留空表示根目录。 */
export async function fetchNetdiskFileList(accountId: number, parentId?: string): Promise<NetdiskFileItem[]> {
  const payload = await api.get<ListPayload, ListPayload>(`netdisk/files/${accountId}/list`, {
    params: parentId ? { parent_id: parentId } : undefined,
    feedback: 'silent',
  })
  return payload?.files ?? []
}

/** 创建分享链接；password 可留空，expires_in 为天数（0 表示永久）。 */
export async function createNetdiskShare(
  accountId: number,
  files: NetdiskFileItem[],
  password: string,
  expiresIn: number,
): Promise<NetdiskShareResult> {
  const payload = await api.post<SharePayload, SharePayload>(
    `netdisk/files/${accountId}/share`,
    { files, password, expires_in: expiresIn },
    { feedback: 'silent' },
  )
  return payload.share
}

/** 批量移动文件到目标目录。 */
export function moveNetdiskFiles(accountId: number, files: NetdiskFileItem[], targetId: string): Promise<unknown> {
  return api.post(`netdisk/files/${accountId}/move`, { files, target_id: targetId }, { feedback: 'silent' })
}

/** 重命名单个文件/目录。 */
export function renameNetdiskFile(accountId: number, file: NetdiskFileItem, name: string): Promise<unknown> {
  return api.post(`netdisk/files/${accountId}/rename`, { file, name }, { feedback: 'silent' })
}

/** 批量删除文件。 */
export function deleteNetdiskFiles(accountId: number, files: NetdiskFileItem[]): Promise<unknown> {
  return api.post(`netdisk/files/${accountId}/delete`, { files }, { feedback: 'silent' })
}

/** 拼接浏览器直开的流式下载地址。 */
export function buildNetdiskStreamUrl(accountId: number, file: NetdiskFileItem): string {
  const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
  const query = `name=${encodeURIComponent(file.name)}&size=${file.size ?? 0}`
  return `${base}/netdisk/files/${accountId}/stream/${encodeURIComponent(file.file_id)}?${query}`
}
