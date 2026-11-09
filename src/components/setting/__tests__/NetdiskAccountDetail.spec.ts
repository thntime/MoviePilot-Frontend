import type { NetdiskAccount, NetdiskPlatformInfo } from '@/api/netdisk'
import NetdiskAccountDetail from '@/components/setting/NetdiskAccountDetail.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  clear: vi.fn(),
  fetchAccount: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}))

vi.mock('@/api/netdisk', () => ({
  clearNetdiskRecycleBin: mocks.clear,
  deleteNetdiskAccount: vi.fn(),
  fetchNetdiskAccount: mocks.fetchAccount,
  probeNetdiskAccount: vi.fn(),
  refreshNetdiskAccount: vi.fn(),
  updateNetdiskAccount: vi.fn(),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ success: mocks.success, error: mocks.error, info: mocks.info }),
}))

vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => mocks.confirm }))
vi.mock('@/api/client', async importOriginal => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return { ...actual, getApiBusinessErrorMessage: () => undefined }
})

/** 构造详情组件所需的最小账号数据。 */
function account(overrides: Partial<NetdiskAccount> = {}): NetdiskAccount {
  return {
    id: 7,
    platform: '115',
    name: '115 主账号',
    is_primary: false,
    status: 'active',
    expires_at: null,
    last_checked_at: null,
    masked: {},
    nickname: '测试账号',
    quota_used: 1,
    quota_total: 10,
    speed: 0,
    ...overrides,
  }
}

/** 构造平台能力数据，默认声明支持回收站。 */
function platformInfo(overrides: Partial<NetdiskPlatformInfo> = {}): NetdiskPlatformInfo {
  return {
    platform: '115',
    link_policy: 'direct',
    requires_account: true,
    guest_supported: false,
    max_concurrency: 1,
    cookie_required_keys: [],
    supports_password_login: false,
    supports_refresh: true,
    recycle_bin: true,
    login_url: 'https://115.com',
    ...overrides,
  }
}

/** 渲染账号详情，可覆盖平台能力。 */
async function renderDetail(options: { recycleBin?: boolean } = {}) {
  return renderWithProviders(NetdiskAccountDetail, {
    props: {
      account: account(),
      platformInfo: platformInfo({ recycle_bin: options.recycleBin ?? true }),
    },
    global: { stubs: { NetdiskAccountFiles: true } },
  })
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.confirm.mockResolvedValue(true)
  mocks.fetchAccount.mockResolvedValue({ ...account(), credential: { cookie: 'cookie-value' } })
})

describe('NetdiskAccountDetail 清理回收站', () => {
  it('平台支持回收站时，在检测连通性之后展示清理按钮', async () => {
    await renderDetail()

    const probe = screen.getByText('检测连通性')
    const clear = screen.getByText('清理回收站')
    expect(probe.compareDocumentPosition(clear) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('平台不支持回收站时不展示清理按钮', async () => {
    await renderDetail({ recycleBin: false })

    expect(screen.queryByText('清理回收站')).toBeNull()
  })

  it('取消二次确认时不发起请求', async () => {
    mocks.confirm.mockResolvedValue(false)
    await renderDetail()

    await fireEvent.click(screen.getByText('清理回收站'))

    expect(mocks.confirm).toHaveBeenCalledTimes(1)
    expect(mocks.clear).not.toHaveBeenCalled()
    expect(mocks.success).not.toHaveBeenCalled()
    expect(mocks.error).not.toHaveBeenCalled()
  })

  it('确认后按 data.cleared 展示成功提示', async () => {
    mocks.clear.mockResolvedValue({ success: true, message: 'ok', data: { cleared: true } })
    await renderDetail()

    await fireEvent.click(screen.getByText('清理回收站'))

    await waitFor(() => expect(mocks.clear).toHaveBeenCalledWith(7))
    expect(mocks.success).toHaveBeenCalledWith('回收站已清理')
    expect(mocks.error).not.toHaveBeenCalled()
  })

  it('success 为真但未清空时展示失败提示', async () => {
    mocks.clear.mockResolvedValue({ success: true, message: 'limited', data: { cleared: false } })
    await renderDetail()

    await fireEvent.click(screen.getByText('清理回收站'))

    await waitFor(() => expect(mocks.clear).toHaveBeenCalledWith(7))
    expect(mocks.success).not.toHaveBeenCalled()
    expect(mocks.info).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalledWith('回收站未能完全清理，请稍后重试')
  })

  it('回收站本已为空时展示信息提示而不是失败提示', async () => {
    mocks.clear.mockResolvedValue({ success: true, message: '回收站已为空', data: { cleared: false } })
    await renderDetail()

    await fireEvent.click(screen.getByText('清理回收站'))

    await waitFor(() => expect(mocks.clear).toHaveBeenCalledWith(7))
    expect(mocks.info).toHaveBeenCalledWith('回收站已为空')
    expect(mocks.success).not.toHaveBeenCalled()
    expect(mocks.error).not.toHaveBeenCalled()
  })

  it('请求失败时展示失败提示', async () => {
    mocks.clear.mockRejectedValue(new Error('network'))
    await renderDetail()

    await fireEvent.click(screen.getByText('清理回收站'))

    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('回收站清理失败，请稍后重试'))
    expect(mocks.success).not.toHaveBeenCalled()
  })
})
