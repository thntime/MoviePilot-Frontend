<script lang="ts" setup>
import type { ContentVerifyItem } from '@/api/types'
import { acceptContentVerify, contentVerifyList, deleteContentVerify } from '@/api/history'
import NoDataFound from '@/components/states/NoDataFound.vue'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

// 待处理记录
const items = ref<ContentVerifyItem[]>([])
// 待处理总数
const total = ref(0)
// 待处理占用（字节）
const pendingSize = ref(0)
// 正在处理的记录标识
const busyId = ref('')
// 是否已加载过
const loaded = ref(false)

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

// 读取待处理记录
async function fetchData() {
  try {
    const data = await contentVerifyList({ page: 1, count: 200 })
    items.value = data?.items || []
    total.value = data?.total || 0
    pendingSize.value = data?.pending_size || 0
  } catch (error) {
    console.error(error)
  } finally {
    loaded.value = true
  }
}

// 人工放行：按原路径强制整理
async function handleAccept(item: ContentVerifyItem) {
  if (busyId.value) return
  busyId.value = item.id
  try {
    const result = await acceptContentVerify(item.id)
    if (result?.success) {
      items.value = items.value.filter(row => row.id !== item.id)
      total.value = Math.max(0, total.value - 1)
      pendingSize.value = Math.max(0, pendingSize.value - item.total_size)
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
      items.value = items.value.filter(row => row.id !== item.id)
      total.value = Math.max(0, total.value - 1)
      pendingSize.value = Math.max(0, pendingSize.value - item.total_size)
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
        {{ t('contentAudit.pendingCount', { count: total }) }}
      </VChip>
      <VChip color="info" variant="tonal" size="small">
        {{ t('contentAudit.pendingSize', { size: formatSize(pendingSize) }) }}
      </VChip>
    </div>

    <VTable v-if="items.length > 0" class="audit-table" density="compact">
      <thead>
        <tr>
          <th>{{ t('contentAudit.media') }}</th>
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
            <div class="audit-actions">
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
