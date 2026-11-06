import api from './index'

/** 网盘平台能力与登录方式描述。 */
export interface NetdiskPlatformInfo {
  platform: string
  link_policy: string
  requires_account: boolean
  guest_supported: boolean
  max_concurrency: number
  cookie_required_keys: string[]
  supports_password_login: boolean
  supports_refresh: boolean
  login_url: string
}

/** 网盘账号的脱敏视图，凭据写入后不回显。 */
export interface NetdiskAccount {
  id: number
  platform: string
  name: string
  is_primary: boolean
  status: string
  expires_at: string | null
  last_checked_at: string | null
  masked: Record<string, string>
  nickname: string
  quota_used: number
  quota_total: number
  /** 最近一次传输速度采样（字节/秒），无采样为 0。 */
  speed: number
}

/** 单账号详情，包含仅超级管理员可读取的明文凭据。 */
export interface NetdiskAccountDetail extends NetdiskAccount {
  credential: Record<string, string>
}

/** 扫码登录会话。 */
export interface NetdiskQrFrame {
  image: string
  page_width: number
  page_height: number
}

export interface NetdiskQrInputRequest {
  kind: 'click' | 'drag' | 'type' | 'key' | 'scroll'
  x?: number
  y?: number
  x1?: number
  y1?: number
  x2?: number
  y2?: number
  text?: string
  key?: string
  delta_y?: number
}

export interface NetdiskQrSession {
  session_id: string
  platform: string
  status: string
  image: string
  page_image?: string
  vnc_path?: string | null
  expires_at: string | null
}

/** 扫码登录轮询状态。 */
export type NetdiskQrStatus = 'pending' | 'detected' | 'success' | 'failed' | 'expired'

interface NetdiskPlatformsPayload {
  platforms: NetdiskPlatformInfo[]
}

interface NetdiskAccountsPayload {
  accounts: NetdiskAccount[]
}

interface NetdiskAccountPayload {
  account: NetdiskAccount
}

/** 新增账号请求中的公共可选字段。 */
export interface NetdiskAccountBaseRequest {
  name?: string
  is_primary?: boolean
  account_id?: number
}

export interface NetdiskCookieAccountRequest extends NetdiskAccountBaseRequest {
  platform: string
  cookie: string
}

export interface NetdiskPasswordAccountRequest extends NetdiskAccountBaseRequest {
  platform: string
  username: string
  password: string
}

export interface NetdiskSmsSendRequest {
  platform: string
  phone: string
  account_id?: number
}

export interface NetdiskSmsLoginRequest extends NetdiskAccountBaseRequest {
  platform: string
  phone: string
  code: string
  verification_id: string
}

export interface NetdiskSmsSendResult {
  sms_verification_id: string
  sms_is_user: boolean
  sms_expires_in: number
}

export interface NetdiskQrStartRequest extends NetdiskAccountBaseRequest {
  platform: string
}

export interface NetdiskAccountUpdateRequest {
  name?: string
  is_primary?: boolean
  cookie?: string
}

/** 查询已支持的网盘平台及其登录能力。 */
export async function fetchNetdiskPlatforms(): Promise<NetdiskPlatformInfo[]> {
  const payload = await api.get<NetdiskPlatformsPayload, NetdiskPlatformsPayload>('netdisk/platforms', {
    feedback: 'silent',
  })
  return payload?.platforms ?? []
}

/** 查询网盘账号脱敏列表，可按平台过滤。 */
export async function fetchNetdiskAccounts(platform?: string): Promise<NetdiskAccount[]> {
  const payload = await api.get<NetdiskAccountsPayload, NetdiskAccountsPayload>('netdisk/accounts', {
    params: platform ? { platform } : undefined,
    feedback: 'silent',
  })
  return payload?.accounts ?? []
}

/** 查询单账号详情与明文凭据。 */
export async function fetchNetdiskAccount(accountId: number): Promise<NetdiskAccountDetail> {
  const payload = await api.get<NetdiskAccountPayload, NetdiskAccountPayload>(`netdisk/accounts/${accountId}`, {
    feedback: 'silent',
  })
  return payload.account as NetdiskAccountDetail
}

/** 粘贴 Cookie 新增账号。 */
export async function createNetdiskCookieAccount(payload: NetdiskCookieAccountRequest): Promise<NetdiskAccount> {
  const result = await api.post<NetdiskAccountPayload, NetdiskAccountPayload>('netdisk/accounts/cookie', payload, {
    feedback: 'silent',
  })
  return result.account
}

/** 从 CookieCloud 导入账号。 */
export async function importNetdiskCookieCloudAccount(
  payload: NetdiskAccountBaseRequest & { platform: string },
): Promise<NetdiskAccount> {
  const result = await api.post<NetdiskAccountPayload, NetdiskAccountPayload>(
    'netdisk/accounts/cookiecloud',
    payload,
    { feedback: 'silent' },
  )
  return result.account
}

/** 账号密码登录并保存账号。 */
export async function createNetdiskPasswordAccount(payload: NetdiskPasswordAccountRequest): Promise<NetdiskAccount> {
  const result = await api.post<NetdiskAccountPayload, NetdiskAccountPayload>('netdisk/accounts/password', payload, {
    feedback: 'silent',
  })
  return result.account
}

/** 发送短信验证码。 */
export function sendNetdiskSmsCode(payload: NetdiskSmsSendRequest): Promise<NetdiskSmsSendResult> {
  return api.post<NetdiskSmsSendResult, NetdiskSmsSendResult>('netdisk/accounts/sms/send', payload, {
    feedback: 'silent',
  })
}

/** 短信验证码登录并保存账号。 */
export async function createNetdiskSmsAccount(payload: NetdiskSmsLoginRequest): Promise<NetdiskAccount> {
  const result = await api.post<NetdiskAccountPayload, NetdiskAccountPayload>('netdisk/accounts/sms/login', payload, {
    feedback: 'silent',
  })
  return result.account
}

/** 启动扫码登录，返回二维码会话。 */
export function startNetdiskQrLogin(payload: NetdiskQrStartRequest): Promise<NetdiskQrSession> {
  return api.post<NetdiskQrSession, NetdiskQrSession>('netdisk/accounts/qr', payload, { feedback: 'silent' })
}

export interface NetdiskQrTicket {
  ticket: string
}

/** 申请网页登录实时画面的一次性票据。 */
export function createNetdiskQrTicket(sessionId: string): Promise<NetdiskQrTicket> {
  return api.post<NetdiskQrTicket, NetdiskQrTicket>(
    `netdisk/accounts/qr/${sessionId}/ticket`,
    {},
    { feedback: 'silent' },
  )
}

/** 读取网页登录当前画面。 */
export function fetchNetdiskQrFrame(sessionId: string): Promise<NetdiskQrFrame> {
  return api.get<NetdiskQrFrame, NetdiskQrFrame>(`netdisk/accounts/qr/${sessionId}/frame`, {
    feedback: 'silent',
  })
}

/** 操作网页登录页面并返回最新画面。 */
export function sendNetdiskQrInput(
  sessionId: string,
  payload: NetdiskQrInputRequest,
): Promise<NetdiskQrFrame> {
  return api.post<NetdiskQrFrame, NetdiskQrFrame>(`netdisk/accounts/qr/${sessionId}/input`, payload, {
    feedback: 'silent',
  })
}

/** 轮询扫码登录状态；成功后账号已落库。 */
export interface NetdiskQrPollResult {
  status: NetdiskQrStatus
  message?: string
  account_name?: string
}

export async function pollNetdiskQrLogin(sessionId: string): Promise<NetdiskQrPollResult> {
  try {
    const payload = await api.get<NetdiskQrPollResult, NetdiskQrPollResult>(
      `netdisk/accounts/qr/${sessionId}`,
      { feedback: 'silent' },
    )
    return {
      status: payload?.status ?? 'pending',
      account_name: payload?.account_name,
    }
  } catch (error) {
    // 业务失败（扫码失败/过期）同样通过统一响应返回，转换为状态交给界面展示。
    const payload = (error as { payload?: { message?: string; data?: NetdiskQrPollResult } })?.payload
    return {
      status: payload?.data?.status ?? 'failed',
      message: payload?.message,
      account_name: payload?.data?.account_name,
    }
  }
}

/** 确认保存已检测到的网页登录态。 */
export async function confirmNetdiskQrLogin(sessionId: string): Promise<NetdiskAccount> {
  const result = await api.post<NetdiskAccountPayload, NetdiskAccountPayload>(
    `netdisk/accounts/qr/${sessionId}/confirm`,
    {},
    { feedback: 'silent' },
  )
  return result.account
}

/** 取消扫码登录会话。 */
export function cancelNetdiskQrLogin(sessionId: string): Promise<unknown> {
  return api.delete(`netdisk/accounts/qr/${sessionId}`, { feedback: 'silent' })
}

/** 更新账号名称、主账号标记或凭据。 */
export function updateNetdiskAccount(accountId: number, payload: NetdiskAccountUpdateRequest): Promise<NetdiskAccount> {
  return api
    .put<NetdiskAccountPayload, NetdiskAccountPayload>(`netdisk/accounts/${accountId}`, payload, {
      feedback: 'silent',
    })
    .then(result => result.account)
}

/** 删除网盘账号。 */
export function deleteNetdiskAccount(accountId: number): Promise<unknown> {
  return api.delete(`netdisk/accounts/${accountId}`, { feedback: 'silent' })
}

/** 检测账号登录态。 */
export function probeNetdiskAccount(accountId: number): Promise<unknown> {
  return api.post(`netdisk/accounts/${accountId}/probe`, undefined, { feedback: 'silent' })
}

/** 全部账号有效性检查的响应负载。 */
export interface NetdiskAccountsCheckPayload {
  accounts: NetdiskAccount[]
  checked: number
  active: number
  expired: number
  failed: number
}

/** 一键检查所有账号有效性并刷新配额，返回最新账号列表与汇总统计。 */
export async function checkAllNetdiskAccounts(): Promise<NetdiskAccountsCheckPayload> {
  return api.post<NetdiskAccountsCheckPayload, NetdiskAccountsCheckPayload>(
    'netdisk/accounts/check',
    undefined,
    { feedback: 'silent' },
  )
}

/** 刷新账号令牌。 */
export function refreshNetdiskAccount(accountId: number): Promise<unknown> {
  return api.post(`netdisk/accounts/${accountId}/refresh`, undefined, { feedback: 'silent' })
}
