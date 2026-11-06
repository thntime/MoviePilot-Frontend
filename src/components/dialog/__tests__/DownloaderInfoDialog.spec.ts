import DownloaderInfoDialog from '@/components/dialog/DownloaderInfoDialog.vue'
import type { DownloaderConf } from '@/api/types'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: { get: (...args: unknown[]) => mocks.apiGet(...args) },
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: vi.fn(), info: vi.fn() }),
}))

const netdiskDownloader: DownloaderConf = {
  name: 'Netdisk',
  type: 'netdisk',
  default: false,
  enabled: true,
  config: {},
  path_mapping: [],
}

/** 渲染网盘下载器配置弹窗并返回保存回调。 */
async function renderDialog(config: DownloaderConf['config'] = {}) {
  const downloader = { ...netdiskDownloader, config: { ...config } }
  const onChange = vi.fn()

  await renderWithProviders(DownloaderInfoDialog, {
    props: {
      modelValue: true,
      downloader,
      downloaders: [downloader],
      onChange,
    },
    global: { stubs: { VDialogCloseBtn: true } },
  })

  return { onChange }
}

describe('DownloaderInfoDialog 网盘转存优先', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset().mockResolvedValue([])
  })

  it('未配置时转存优先默认为关闭', async () => {
    await renderDialog()

    expect(await screen.findByLabelText('转存优先')).not.toBeChecked()
  })

  it('开启转存优先后保存回写 config.transfer_first', async () => {
    const { onChange } = await renderDialog()
    const transferFirstSwitch = await screen.findByLabelText('转存优先')

    await fireEvent.click(transferFirstSwitch)
    expect(transferFirstSwitch).toBeChecked()

    await fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ transfer_first: true }),
        }),
        'Netdisk',
      ),
    )
  })
})
