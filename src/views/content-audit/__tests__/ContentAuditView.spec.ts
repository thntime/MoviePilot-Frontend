import ContentAuditView from '@/views/content-audit/ContentAuditView.vue'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { apiJson } from '@tests/support/msw/response'
import { server } from '@tests/support/msw/server'
import { http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

const API_BASE_URL = 'http://localhost/api/v1/'

const SelectStub = defineComponent({
  name: 'VSelect',
  props: {
    modelValue: { type: [String, Number], default: '' },
    items: { type: Array, default: () => [] },
    label: { type: String, default: '' },
  },
  emits: ['update:modelValue'],
  setup(props, { emit, attrs }) {
    return () =>
      h(
        'select',
        {
          'aria-label': attrs['aria-label'] ?? props.label,
          onChange: (event: Event) =>
            emit('update:modelValue', (event.target as HTMLSelectElement).value),
        },
        props.items.map(item => h('option', { value: item }, String(item))),
      )
  },
})

interface AuditItem {
  id: string
  title: string
  decision: string
  total_size: number
  created_at: string
  [key: string]: unknown
}

function auditItem(overrides: Record<string, unknown> = {}): AuditItem {
  return {
    id: 'rec1',
    src: '/downloads/share/a.mkv',
    storage: 'local',
    title: '斗破苍穹',
    media_type: '电视剧',
    season: '1',
    episodes: 'E01-E02',
    score: 3,
    confidence: 0.91,
    reason: '文件名是另一部作品',
    hits: ['时长'],
    frames: [],
    file_count: 2,
    total_size: 2048,
    median_duration: 1300,
    platform: 'quark',
    share_code: 'abc123',
    download_hash: 'h1',
    created_at: '2026-11-21 00:00:00',
    updated_at: '2026-11-21 00:00:00',
    decision: 'reject',
    ...overrides,
  }
}

function countByDecision(items: AuditItem[]) {
  const counts: Record<string, number> = {
    reject: 0,
    pass: 0,
    manual: 0,
    deleted: 0,
    skipped: 0,
  }
  items.forEach(item => {
    const key = String(item.decision || 'reject')
    counts[key] = (counts[key] || 0) + 1
  })
  return counts
}

function listResponse(items: AuditItem[], total?: number) {
  const pending = items.filter(item => (item.decision || 'reject') === 'reject')
  return {
    items,
    total: total ?? items.length,
    pending_size: pending.reduce((sum: number, item) => sum + (item.total_size || 0), 0),
    counts: countByDecision(items),
    score_total: 11,
  }
}

describe('ContentAuditView', () => {
  it('renders pending records with verdict, time and score total from api', async () => {
    server.use(
      http.get(new URL('history/verify', API_BASE_URL).href, () => apiJson(listResponse([auditItem()]))),
    )

    renderWithProviders(ContentAuditView)

    await waitFor(() => expect(screen.getByText('斗破苍穹')).toBeInTheDocument())
    expect(screen.getByText('文件名是另一部作品')).toBeInTheDocument()
    expect(screen.getByTestId('audit-score-rec1')).toHaveTextContent('3 / 11')
    expect(screen.getByTestId('audit-time-rec1')).toHaveTextContent('2026-11-21 00:00:00')
    expect(screen.getByText('待处理 1 条')).toBeInTheDocument()
    expect(screen.getByTestId('audit-total')).toHaveTextContent('共 1 条')
    expect(screen.getByTestId('audit-verdict-rec1')).toHaveTextContent('待处理')
  })

  it('shows passed records with conclusion and no action buttons', async () => {
    const passed = auditItem({ id: 'rec2', title: '光阴之外', decision: 'pass', reason: '本地证据充分' })
    server.use(
      http.get(new URL('history/verify', API_BASE_URL).href, () => apiJson(listResponse([passed]))),
    )

    renderWithProviders(ContentAuditView)

    await waitFor(() => expect(screen.getByText('光阴之外')).toBeInTheDocument())
    expect(screen.getByTestId('audit-verdict-rec2')).toHaveTextContent('已通过')
    expect(screen.getByText('已通过 1 条')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '整理' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument()
  })

  it('filters records by status and sends the status parameter', async () => {
    const requests: string[] = []
    server.use(
      http.get(new URL('history/verify', API_BASE_URL).href, ({ request }) => {
        requests.push(request.url)
        return apiJson(listResponse([auditItem()]))
      }),
    )

    renderWithProviders(ContentAuditView)

    await waitFor(() => expect(screen.getByText('斗破苍穹')).toBeInTheDocument())
    await userEvent.click(screen.getByTestId('audit-filter-pass'))

    await waitFor(() => expect(requests.some(url => url.includes('status=pass'))).toBe(true))
  })

  it('requests the next page with the page parameter', async () => {
    const requests: string[] = []
    const rows = Array.from({ length: 25 }, (_, index) =>
      auditItem({ id: `rec${index}`, title: `资源 ${index}` }),
    )
    server.use(
      http.get(new URL('history/verify', API_BASE_URL).href, ({ request }) => {
        requests.push(request.url)
        return apiJson(listResponse(rows, 60))
      }),
    )

    renderWithProviders(ContentAuditView)

    await waitFor(() => expect(screen.getByText('资源 0')).toBeInTheDocument())
    expect(screen.getByTestId('audit-page-info')).toHaveTextContent('第 1–25 条 / 共 60 条')
    const pager = document.querySelector('.v-pagination') as HTMLElement | null
    expect(pager).not.toBeNull()
    const pageButton = Array.from(pager?.querySelectorAll('button') ?? []).find(
      button => button.textContent?.trim() === '2',
    )
    expect(pageButton).toBeTruthy()
    await userEvent.click(pageButton as HTMLElement)

    await waitFor(() => expect(requests.some(url => url.includes('page=2'))).toBe(true))
  })

  it('requests a new page size when it changes', async () => {
    const requests: string[] = []
    server.use(
      http.get(new URL('history/verify', API_BASE_URL).href, ({ request }) => {
        requests.push(request.url)
        return apiJson(listResponse([auditItem()]))
      }),
    )

    renderWithProviders(ContentAuditView, {
      global: { stubs: { VSelect: SelectStub } },
    })

    await waitFor(() => expect(screen.getByText('斗破苍穹')).toBeInTheDocument())
    await userEvent.selectOptions(screen.getByLabelText('每页条数'), '50')

    await waitFor(() => expect(requests.some(url => url.includes('count=50'))).toBe(true))
  })

  it('accepts a record and removes it from the list', async () => {
    const accepted = vi.fn()
    let calls = 0
    server.use(
      http.get(new URL('history/verify', API_BASE_URL).href, () => {
        calls += 1
        return apiJson(listResponse(calls === 1 ? [auditItem()] : []))
      }),
      http.post(new URL('history/verify/accept', API_BASE_URL).href, async ({ request }) => {
        accepted(await request.json())
        return apiJson({ success: true, message: '已整理' })
      }),
    )

    renderWithProviders(ContentAuditView)

    await waitFor(() => expect(screen.getByText('斗破苍穹')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: '整理' }))

    await waitFor(() => expect(accepted).toHaveBeenCalledWith({ id: 'rec1' }))
    await waitFor(() => expect(screen.queryByText('斗破苍穹')).not.toBeInTheDocument())
  })

  it('deletes a record and removes it from the list', async () => {
    const deleted = vi.fn()
    let calls = 0
    server.use(
      http.get(new URL('history/verify', API_BASE_URL).href, () => {
        calls += 1
        return apiJson(listResponse(calls === 1 ? [auditItem()] : []))
      }),
      http.post(new URL('history/verify/delete', API_BASE_URL).href, async ({ request }) => {
        deleted(await request.json())
        return apiJson({ success: true, message: '已删除本地文件' })
      }),
    )

    renderWithProviders(ContentAuditView)

    await waitFor(() => expect(screen.getByText('斗破苍穹')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: '删除' }))

    await waitFor(() => expect(deleted).toHaveBeenCalledWith({ id: 'rec1' }))
    await waitFor(() => expect(screen.queryByText('斗破苍穹')).not.toBeInTheDocument())
  })

  it('shows empty state when nothing is pending', async () => {
    server.use(
      http.get(new URL('history/verify', API_BASE_URL).href, () => apiJson(listResponse([]))),
    )

    renderWithProviders(ContentAuditView)

    await waitFor(() => expect(screen.getByText('没有待处理的内容')).toBeInTheDocument())
  })

  it('shows a status specific empty state when a filter has no records', async () => {
    server.use(
      http.get(new URL('history/verify', API_BASE_URL).href, () => apiJson(listResponse([]))),
    )

    renderWithProviders(ContentAuditView)

    await waitFor(() => expect(screen.getByTestId('audit-filter-pass')).toBeInTheDocument())
    await userEvent.click(screen.getByTestId('audit-filter-pass'))

    await waitFor(() => expect(screen.getByText('该状态下没有记录')).toBeInTheDocument())
  })
})
