import api from '@/api'
import type { ContentVerifyPage } from '@/api/types'

/** 清空全部旧整理记录；后端会保留持久失败任务，且不会删除任何文件。 */
export async function clearLegacyTransferHistory(): Promise<void> {
  await api.delete<null>('history/transfer/all', { feedback: 'silent' })
}

// 查询待处理的下载内容校验记录
export async function contentVerifyList(params: { page?: number; count?: number } = {}) {
  return await api.get<ContentVerifyPage>('history/verify', { params })
}

// 人工放行一条内容校验记录
export async function acceptContentVerify(id: string) {
  return await api.post<{ success: boolean; message: string }>('history/verify/accept', { id })
}

// 删除一条内容校验记录的本地文件
export async function deleteContentVerify(id: string) {
  return await api.post<{ success: boolean; message: string }>('history/verify/delete', { id })
}
