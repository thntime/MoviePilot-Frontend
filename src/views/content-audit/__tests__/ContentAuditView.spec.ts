import ContentAuditView from '@/views/content-audit/ContentAuditView.vue'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { apiJson } from '@tests/support/msw/response'
import { server } from '@tests/support/msw/server'
import { http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

const API_BASE_URL = 'http://localhost/api/v1/'

function auditItem(overrides: Record<string, unknown> = {}) {
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

function listResponse(items: unknown[]) {
  return {
    items,
    total: items.length,
    pending_size: items.reduce((sum: number, item: any) => sum + (item.total_size || 0), 0),
  }
}

describe('ContentAuditView', () => {
  it('renders pending records with verdict and evidence', async () => {
    server.use(
      http.get(new URL('history/verify', API_BASE_URL).href, () => apiJson(listResponse([auditItem()]))),
    )

    renderWithProviders(ContentAuditView)

    await waitFor(() => expect(screen.getByText('斗破苍穹')).toBeInTheDocument())
    expect(screen.getByText('文件名是另一部作品')).toBeInTheDocument()
    expect(screen.getByText('3 / 12')).toBeInTheDocument()
    expect(screen.getByText('待处理 1 条')).toBeInTheDocument()
  })

  it('accepts a record and removes it from the list', async () => {
    const accepted = vi.fn()
    server.use(
      http.get(new URL('history/verify', API_BASE_URL).href, () => apiJson(listResponse([auditItem()]))),
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
    server.use(
      http.get(new URL('history/verify', API_BASE_URL).href, () => apiJson(listResponse([auditItem()]))),
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
})
