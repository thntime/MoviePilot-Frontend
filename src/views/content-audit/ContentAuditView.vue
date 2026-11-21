<script lang="ts" setup>
import type { ContentVerifyItem } from '@/api/types'
import { acceptContentVerify, contentVerifyList, deleteContentVerify } from '@/api/history'
import NoDataFound from '@/components/states/NoDataFound.vue'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

// 每页条数可选项
const PAGE_SIZES = [25, 50, 100]

// 当前页记录
const items = ref<ContentVerifyItem[]>([])
// 当前筛选条件下的记录总数
const total = ref(0)
// 待处理占用（字节）
const pendingSize = ref(0)
// 各状态记录数
const counts = ref<Record<string, number>>({})
// 证据得分满分，由接口给出
const scoreTotal = ref(0)
// 状态筛选，all 表示全部
const status = ref('all')
// 当前页码
const page = ref(1)
// 每页条数
const pageSize = ref(PAGE_SIZES[0])
// 正在处理的记录标识
const busyId = ref('')
// 是否已加载过
const loaded = ref(false)

// 状态筛选项：全部 + 各状态及其记录数
const statusOptions = computed(() => {
  const values = counts.value || {}
  const all = Object.values(values).reduce((sum, value) => sum + (Number(value) || 0), 0)
  return [
    { value: 'all', label: t('contentAudit.statusAll'), count: all },
    { value: 'reject', label: t('contentAudit.statusReject'), count: values.reject || 0 },
    { value: 'pass', label: t('contentAudit.statusPass'), count: values.pass || 0 },
    { value: 'skipped', label: t('contentAudit.statusSkipped'), count: values.skipped || 0 },
    { value: 'manual', label: t('contentAudit.statusManual'), count: values.manual || 0 },
    { value: 'deleted', label: t('contentAudit.statusDeleted'), count: values.deleted || 0 },
  ]
})

// 总页数
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
// 当前页第一条记录的序号
const pageStart = computed(() => (total.value === 0 ? 0 : (page.value - 1) * pageSize.value + 1))
// 当前页最后一条记录的序号
const pageEnd = computed(() => Math.min(page.value * pageSize.value, total.value))
// 是否处在某个状态筛选下
const filtered = computed(() => status.value !== 'all')

// 结论标签与配色
const verdictMeta: Record<string, { labelKey: string; color: string }> = {
  reject: { labelKey: 'contentAudit.statusReject', color: 'warning' },
  pass: { labelKey: 'contentAudit.statusPass', color: 'success' },
  skipped: { labelKey: 'contentAudit.statusSkipped', color: 'info' },
  manual: { labelKey: 'contentAudit.statusManual', color: 'primary' },
  deleted: { labelKey: 'contentAudit.statusDeleted', color: 'error' },
}

// 结论文案
function verdictLabel(decision: string): string {
  const meta = verdictMeta[decision] || verdictMeta.reject
  return t(meta.labelKey)
}

// 结论配色
function verdictColor(decision: string): string {
  return (verdictMeta[decision] || verdictMeta.reject).color
}

// 字节转可读大小
function formatSize(bytes: number): string {
  const value = Number(bytes) || 0
  if (value <= 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = value
  let index = 0
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
  return `${size.toFixed(size >= 100 || index === 0 ? 0 : 1)} ${units[index]}`
}

// 秒转可读时长
function formatDuration(seconds: number): string {
  const value = Number(seconds) || 0
  if (value <= 0) return '-'
  const minutes = Math.round(value / 60)
  if (minutes < 60) return t('contentAudit.minutes', { count: minutes })
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `${hours}${t('contentAudit.hourUnit')}${rest}${t('contentAudit.minuteUnit')}`
}

// 置信度展示
function formatConfidence(value: number): string {
  const ratio = Number(value) || 0
  return `${Math.round(ratio * 100)}%`
}

// 按当前筛选与分页读取记录
async function fetchData() {
  try {
    const data = await contentVerifyList({
      page: page.value,
      count: pageSize.value,
      status: status.value,
    })
    items.value = data?.items || []
    total.value = data?.total || 0
    pendingSize.value = data?.pending_size || 0
    counts.value = data?.counts || {}
    scoreTotal.value = data?.score_total || 0
  } catch (error) {
    console.error(error)
  } finally {
    loaded.value = true
  }
}

// 处理完一条记录后按当前筛选重读，保证计数与列表一致
async function refreshAfterAction() {
  await fetchData()
}

// 切换状态筛选：回到第一页再读
function selectStatus(value: unknown) {
  status.value = String(value || 'all')
  page.value = 1
  void fetchData()
}

// 翻页
function changePage(value: number) {
  page.value = Math.max(1, Number(value) || 1)
  void fetchData()
}

// 切换每页条数：回到第一页再读
function changePageSize(value: number) {
  pageSize.value = Number(value) || PAGE_SIZES[0]
  page.value = 1
  void fetchData()
}

// 人工放行：按原路径强制整理
async function handleAccept(item: ContentVerifyItem) {
  if (busyId.value) return
  busyId.value = item.id
  try {
    const result = await acceptContentVerify(item.id)
    if (result?.success) {
      await refreshAfterAction()
    }
  } catch (error) {
    console.error(error)
  } finally {
    busyId.value = ''
  }
}

// 删除本地副本
async function handleDelete(item: ContentVerifyItem) {
  if (busyId.value) return
  busyId.value = item.id
  try {
    const result = await deleteContentVerify(item.id)
    if (result?.success) {
      await refreshAfterAction()
    }
  } catch (error) {
    console.error(error)
  } finally {
    busyId.value = ''
  }
}

onMounted(fetchData)
</script>

<template>
  <div class="content-audit-page">
    <VPageContentTitle :title="t('navItems.contentAudit')" class="my-0" />

    <div class="audit-stats">
      <VChip color="warning" variant="tonal" size="small">
        {{ t('contentAudit.pendingCount', { count: counts.reject || 0 }) }}
      </VChip>
      <VChip color="success" variant="tonal" size="small">
        {{ t('contentAudit.passedCount', { count: counts.pass || 0 }) }}
      </VChip>
      <VChip color="info" variant="tonal" size="small">
        {{ t('contentAudit.pendingSize', { size: formatSize(pendingSize) }) }}
      </VChip>
      <VChip variant="tonal" size="small" data-testid="audit-total">
        {{ t('contentAudit.totalCount', { count: total }) }}
      </VChip>
    </div>

    <VChipGroup
      :model-value="status"
      class="audit-filter"
      mandatory
      filter
      @update:model-value="selectStatus"
    >
      <VChip
        v-for="option in statusOptions"
        :key="option.value"
        :value="option.value"
        size="small"
        variant="tonal"
        :data-testid="`audit-filter-${option.value}`"
      >
        {{ option.label }} {{ option.count }}
      </VChip>
    </VChipGroup>

    <VCard v-if="items.length > 0" class="audit-table-card">
      <div class="audit-table-wrap">
        <VTable class="audit-table">
          <thead>
            <tr>
              <th class="col-time">{{ t('contentAudit.time') }}</th>
              <th>{{ t('contentAudit.media') }}</th>
              <th>{{ t('contentAudit.conclusion') }}</th>
              <th>{{ t('contentAudit.verdict') }}</th>
              <th>{{ t('contentAudit.evidence') }}</th>
              <th>{{ t('contentAudit.files') }}</th>
              <th>{{ t('contentAudit.path') }}</th>
              <th>{{ t('contentAudit.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.id" :data-testid="`audit-row-${item.id}`">
              <td class="col-time" :data-testid="`audit-time-${item.id}`">
                {{ item.created_at || '-' }}
              </td>
              <td>
                <div class="media-title">{{ item.title || '-' }}</div>
                <div class="media-meta">
                  {{ item.media_type || '-' }}
                  <span v-if="item.season"> · S{{ item.season }}</span>
                  <span v-if="item.episodes"> · {{ item.episodes }}</span>
                </div>
              </td>
              <td>
                <VChip
                  size="small"
                  variant="tonal"
                  :color="verdictColor(item.decision)"
                  :data-testid="`audit-verdict-${item.id}`"
                >
                  {{ verdictLabel(item.decision) }}
                </VChip>
              </td>
              <td>
                <div class="verdict-reason" :title="item.reason">{{ item.reason || '-' }}</div>
                <div class="media-meta">
                  {{ t('contentAudit.confidence') }}{{ formatConfidence(item.confidence) }}
                </div>
              </td>
              <td>
                <div :data-testid="`audit-score-${item.id}`">{{ item.score }} / {{ scoreTotal }}</div>
                <div class="media-meta">
                  {{ item.hits?.length ? item.hits.join('、') : t('contentAudit.noHit') }}
                </div>
              </td>
              <td>
                <div>{{ t('contentAudit.fileCount', { count: item.file_count }) }}</div>
                <div class="media-meta">
                  {{ formatSize(item.total_size) }} · {{ formatDuration(item.median_duration) }}
                </div>
              </td>
              <td class="path-cell" :title="item.src">{{ item.src }}</td>
              <td>
                <div v-if="item.decision === 'reject'" class="audit-actions">
                  <VBtn
                    size="small"
                    variant="text"
                    color="primary"
                    :loading="busyId === item.id"
                    :aria-label="t('contentAudit.accept')"
                    @click="handleAccept(item)"
                  >
                    {{ t('contentAudit.accept') }}
                  </VBtn>
                  <VBtn
                    size="small"
                    variant="text"
                    color="error"
                    :loading="busyId === item.id"
                    :aria-label="t('contentAudit.delete')"
                    @click="handleDelete(item)"
                  >
                    {{ t('contentAudit.delete') }}
                  </VBtn>
                </div>
                <span v-else class="media-meta">{{ t('contentAudit.noAction') }}</span>
              </td>
            </tr>
          </tbody>
        </VTable>
      </div>
    </VCard>

    <footer v-if="items.length > 0" class="audit-footer">
      <VSelect
        :model-value="pageSize"
        :items="PAGE_SIZES"
        density="compact"
        variant="solo"
        flat
        rounded="pill"
        hide-details
        class="audit-page-size-select"
        data-testid="audit-page-size"
        :aria-label="t('common.itemsPerPage')"
        @update:model-value="changePageSize"
      />
      <span class="audit-page-info" data-testid="audit-page-info">
        {{ t('contentAudit.pageInfo', { start: pageStart, end: pageEnd, total }) }}
      </span>
      <VPagination
        :model-value="page"
        :length="pageCount"
        :total-visible="7"
        show-first-last-page
        :aria-label="t('contentAudit.pagination')"
        @update:model-value="changePage"
      />
    </footer>

    <NoDataFound
      v-else-if="loaded"
      error-code="200"
      :error-title="filtered ? t('contentAudit.emptyFilteredTitle') : t('contentAudit.emptyTitle')"
      :error-description="
        filtered ? t('contentAudit.emptyFilteredDescription') : t('contentAudit.emptyDescription')
      "
    />
  </div>
</template>

<style lang="scss" scoped>
.content-audit-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.audit-stats {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.audit-filter {
  gap: 4px;
}

.audit-table-card {
  overflow: hidden;
  border: var(--app-surface-border);
  background: var(--app-grouped-list-background);
  box-shadow: var(--app-card-rest-shadow);
}

.audit-table-wrap {
  width: 100%;
  overflow: auto;
  max-height: 68vh;
}

.audit-table {
  width: 100%;
  min-width: 1080px;
}

.audit-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgb(var(--v-table-header-background));
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.audit-table td,
.audit-table th {
  padding: 12px 16px;
  vertical-align: middle;
}

.audit-table tbody td {
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}

.audit-table tbody tr {
  transition: background-color 160ms ease;
}

.audit-table tbody tr:hover {
  background: var(--app-grouped-list-hover-background);
}

.audit-table tbody tr:last-child td {
  border-bottom: 0;
}

.col-time {
  width: 170px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.media-title {
  font-weight: 600;
  line-height: 1.45;
}

.media-meta {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  line-height: 1.5;
}

.verdict-reason {
  display: -webkit-box;
  overflow: hidden;
  max-width: 360px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.55;
}

.path-cell {
  max-width: 320px;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audit-actions {
  display: flex;
  gap: 4px;
  white-space: nowrap;
}

.audit-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.audit-page-size-select {
  flex: 0 0 108px;
}

.audit-page-size-select :deep(.v-field) {
  border: 0 !important;
  border-radius: var(--app-vuetify-rounded-pill);
  background: var(--app-search-input-background) !important;
  box-shadow: none !important;
  min-block-size: 42px;
}

.audit-page-size-select :deep(.v-field__outline),
.audit-page-size-select :deep(.v-field__overlay) {
  display: none;
}

.audit-page-info {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.8rem;
}

.audit-footer :deep(.v-pagination) {
  margin-inline-start: auto;
}

.audit-footer :deep(.v-pagination__item),
.audit-footer :deep(.v-pagination__first),
.audit-footer :deep(.v-pagination__prev),
.audit-footer :deep(.v-pagination__next),
.audit-footer :deep(.v-pagination__last) {
  margin-block: 0;
}
</style>
