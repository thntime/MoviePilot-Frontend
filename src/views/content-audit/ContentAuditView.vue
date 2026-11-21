<script lang="ts" setup>
import type { ContentVerifyItem } from '@/api/types'
import { acceptContentVerify, contentVerifyList, deleteContentVerify } from '@/api/history'
import NoDataFound from '@/components/states/NoDataFound.vue'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

// 待处理记录
const items = ref<ContentVerifyItem[]>([])
// 当前筛选条件下的记录总数
const total = ref(0)
// 待处理占用（字节）
const pendingSize = ref(0)
// 各状态记录数
const counts = ref<Record<string, number>>({})
// 状态筛选，all 表示全部
const status = ref('all')
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

// 切换状态筛选并重新读取
function selectStatus(value: unknown) {
  status.value = String(value || 'all')
  void fetchData()
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

// 读取内容校验记录
async function fetchData() {
  try {
    const data = await contentVerifyList({ page: 1, count: 200, status: status.value })
    items.value = data?.items || []
    total.value = data?.total || 0
    pendingSize.value = data?.pending_size || 0
    counts.value = data?.counts || {}
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

    <VTable v-if="items.length > 0" class="audit-table" density="compact">
      <thead>
        <tr>
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
            <div class="verdict-reason">{{ item.reason || '-' }}</div>
            <div class="media-meta">{{ t('contentAudit.confidence') }}{{ formatConfidence(item.confidence) }}</div>
          </td>
          <td>
            <div>{{ item.score }} / 12</div>
            <div class="media-meta">{{ item.hits?.length ? item.hits.join('、') : t('contentAudit.noHit') }}</div>
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

    <NoDataFound
      v-else-if="loaded"
      error-code="200"
      :error-title="t('contentAudit.emptyTitle')"
      :error-description="t('contentAudit.emptyDescription')"
    />
  </div>
</template>

<style lang="scss" scoped>
.content-audit-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.audit-stats {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.audit-filter {
  gap: 4px;
}

.audit-table {
  width: 100%;
}

.media-title {
  font-weight: 600;
}

.media-meta {
  font-size: 12px;
  opacity: 0.7;
}

.verdict-reason {
  max-width: 260px;
}

.path-cell {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  opacity: 0.8;
}

.audit-actions {
  display: flex;
  gap: 4px;
}
</style>
