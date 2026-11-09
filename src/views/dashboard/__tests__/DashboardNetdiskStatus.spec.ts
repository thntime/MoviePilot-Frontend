import DashboardNetdiskStatus from '@/views/dashboard/DashboardNetdiskStatus.vue'
import { renderWithProviders } from '@tests/support/render'
import { waitFor } from '@testing-library/vue'
import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface RefreshRegistration {
  id: string
  callback: () => Promise<void>
  interval: number
  immediate: boolean
}

const mocks = vi.hoisted(() => ({
  fetchNetdiskAccounts: vi.fn(),
  checkAllNetdiskAccounts: vi.fn(),
  refreshRegistrations: [] as RefreshRegistration[],
}))

vi.mock('@/api/netdisk', () => ({
  fetchNetdiskAccounts: (...args: unknown[]) => mocks.fetchNetdiskAccounts(...args),
  checkAllNetdiskAccounts: (...args: unknown[]) => mocks.checkAllNetdiskAccounts(...args),
}))

vi.mock('@/composables/useBackground', () => ({
  useBackground: () => ({
    useDataRefresh: (id: string, callback: () => Promise<void>, interval: number, immediate: boolean) => {
      mocks.refreshRegistrations.push({ id, callback, interval, immediate })
      // 模拟 immediate=true：挂载后立即执行一次加载
      void callback()

      return { loading: ref(false), refresh: callback, stop: vi.fn() }
    },
  }),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))

describe('DashboardNetdiskStatus 自动刷新', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.refreshRegistrations.length = 0
    mocks.fetchNetdiskAccounts.mockResolvedValue([])
    mocks.checkAllNetdiskAccounts.mockResolvedValue({
      checked: 0,
      active: 0,
      expired: 0,
      failed: 0,
      accounts: [],
    })
  })

  it('挂载只拉取一次账号，并注册 30 分钟刷新且不触发主动检查', async () => {
    await renderWithProviders(DashboardNetdiskStatus)

    await waitFor(() => expect(mocks.fetchNetdiskAccounts).toHaveBeenCalledOnce())

    expect(mocks.refreshRegistrations).toHaveLength(1)
    const [registration] = mocks.refreshRegistrations
    expect(registration.id).toBe('dashboard-netdisk-status')
    expect(registration.interval).toBe(30 * 60 * 1000)
    expect(registration.immediate).toBe(true)

    expect(mocks.checkAllNetdiskAccounts).not.toHaveBeenCalled()
  })
})
