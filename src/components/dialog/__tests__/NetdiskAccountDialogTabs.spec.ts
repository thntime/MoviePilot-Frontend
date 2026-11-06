import { screen } from '@testing-library/vue'
import { describe, expect, it, vi } from 'vitest'
import NetdiskAccountDialog from '@/components/dialog/NetdiskAccountDialog.vue'
import { renderWithProviders } from '@tests/support/render'

vi.mock('@/api/netdisk', () => ({
  cancelNetdiskQrLogin: vi.fn(), confirmNetdiskQrLogin: vi.fn(), createNetdiskCookieAccount: vi.fn(),
  createNetdiskPasswordAccount: vi.fn(), createNetdiskQrTicket: vi.fn(), createNetdiskSmsAccount: vi.fn(),
  fetchNetdiskQrFrame: vi.fn(), importNetdiskCookieCloudAccount: vi.fn(), pollNetdiskQrLogin: vi.fn(),
  sendNetdiskQrInput: vi.fn(), sendNetdiskSmsCode: vi.fn(), startNetdiskQrLogin: vi.fn(),
}))
vi.mock('@/api/nprogress', () => ({ doneNProgress: vi.fn(), startNProgress: vi.fn() }))
vi.mock('vue-toastification', () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn() }) }))
vi.mock('@/api/client', () => ({ getApiBusinessErrorMessage: () => undefined }))

const platforms = [{ platform: 'quark', supports_password_login: false }]

describe('NetdiskAccountDialog 登录方式', () => {
  it('新增模式下登录方式标签可见，且不被原生 template 元素包裹', async () => {
    await renderWithProviders(NetdiskAccountDialog, {
      props: { oper: 'add', platforms, platform: 'quark', modelValue: true },
    })
    for (const label of ['粘贴 Cookie', 'CookieCloud 导入', '网页登录']) {
      const el = screen.getByText(label)
      expect(el).toBeTruthy()
      // 防止无指令 <template> 被编译为原生 template 元素导致内容不渲染的回归
      expect(el.closest('template')).toBeNull()
    }
  })

  it('编辑模式下登录方式标签可见，且不被原生 template 元素包裹', async () => {
    await renderWithProviders(NetdiskAccountDialog, {
      props: {
        oper: 'edit',
        platforms,
        modelValue: true,
        account: { id: 1, platform: 'quark', name: '测试账号', is_primary: false },
      },
    })
    for (const label of ['粘贴 Cookie', 'CookieCloud 导入', '网页登录']) {
      const el = screen.getByText(label)
      expect(el).toBeTruthy()
      expect(el.closest('template')).toBeNull()
    }
  })
})
