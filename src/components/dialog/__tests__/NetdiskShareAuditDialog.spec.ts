import NetdiskShareAuditDialog from '@/components/dialog/NetdiskShareAuditDialog.vue'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { apiJson } from '@tests/support/msw/response'
import { http } from 'msw'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'

const API_BASE_URL = 'http://localhost/api/v1/'

const DialogStub = defineComponent({
  name: 'VDialog',
  props: {
    modelValue: { type: Boolean, default: true },
  },
  setup(props, { slots }) {
    return () => (props.modelValue ? h('div', { role: 'dialog' }, slots.default?.()) : null)
  },
})

const TextFieldStub = defineComponent({
  name: 'VTextField',
  props: {
    modelValue: { type: [String, Number], default: '' },
    label: String,
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('input', {
        'aria-label': props.label,
        'data-testid': (props as Record<string, unknown>)['data-testid'] as string | undefined,
        value: props.modelValue,
        onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
      })
  },
})

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

function auditResponse() {
  return {
    audit: {
      share_title: '示例分享',
      platform: 'quark',
      file_count: 12,
      total_bytes: 2048,
      truncated: false,
      unrecognized_files: 0,
      media: [
        {
          title: '示例剧',
          year: '2026',
          type: '电视剧',
          recognized: true,
          media_source: 'themoviedb',
          media_id: '9001',
          files: 12,
          total_bytes: 2048,
          seasons: [{ season: 1, episodes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }],
          episodes: [],
          missing_episodes: [9, 10, 11, 12],
          existing_episodes: [1, 2, 3, 4, 5, 6, 7, 8],
          season_gaps: [
            { season: 1, missing_episodes: [9, 10, 11, 12], existing_episodes: [1, 2, 3, 4, 5, 6, 7, 8] },
          ],
          library_evidence: 'media_server',
          library_state: 'present',
          truncated: false,
        },
      ],
    },
  }
}

async function renderDialog() {
  return renderWithProviders(NetdiskShareAuditDialog, {
    props: { modelValue: true },
    global: { stubs: { VDialog: DialogStub, VTextField: TextFieldStub } },
  })
}

describe('NetdiskShareAuditDialog', () => {
  it('audits a pasted share link and shows the season gap', async () => {
    const submitted = vi.fn()
    server.use(
      http.post(new URL('netdisk/share/audit', API_BASE_URL).href, async ({ request }) => {
        submitted(await request.json())
        return apiJson(auditResponse())
      }),
    )
    const user = userEvent.setup()
    await renderDialog()

    await user.type(screen.getByTestId('netdisk-audit-url'), 'https://pan.quark.cn/s/abc123')
    await user.click(screen.getByTestId('netdisk-audit-run'))

    await waitFor(() => expect(screen.getByText(/E09-E12/)).toBeInTheDocument())
    expect(submitted).toHaveBeenCalledWith({
      url: 'https://pan.quark.cn/s/abc123',
      password: '',
    })
    expect(screen.getByText(/示例剧/)).toBeInTheDocument()
    expect(screen.getByText(/已有 8 集|8 episodes/)).toBeInTheDocument()
  })

  it('keeps the audit button disabled until a link is pasted', async () => {
    await renderDialog()

    expect(screen.getByTestId('netdisk-audit-run')).toBeDisabled()
  })
})
