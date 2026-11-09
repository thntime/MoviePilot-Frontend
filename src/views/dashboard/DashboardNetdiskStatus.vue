<script setup lang="ts">
import { useToast } from 'vue-toastification'
import { useI18n } from 'vue-i18n'
import { checkAllNetdiskAccounts, fetchNetdiskAccounts } from '@/api/netdisk'
import type { NetdiskAccount } from '@/api/netdisk'
import {
  formatNetdiskFreeSpace,
  formatNetdiskSpeed,
  getNetdiskPlatformIcon,
  getNetdiskPlatformName,
  summarizeNetdiskPlatforms,
} from '@/utils/netdisk'

const props = withDefaults(defineProps<{ allowRefresh?: boolean }>(), {
  allowRefresh: false,
})

const { t } = useI18n()
const $toast = useToast()

const accounts = ref<NetdiskAccount[]>([])
const loading = ref(false)

const platforms = computed(() => summarizeNetdiskPlatforms(accounts.value))

function statusLabel(color: 'success' | 'warning' | 'error'): string {
  if (color === 'success') return t('dashboard.netdiskStatus.allActive')
  if (color === 'warning') return t('dashboard.netdiskStatus.partialError')
  return t('dashboard.netdiskStatus.allError')
}

async function loadAccounts() {
  try {
    accounts.value = await fetchNetdiskAccounts()
  }
  catch {
    // 静默失败：仪表盘不阻塞，保留空状态
  }
}

async function refresh() {
  if (loading.value) return
  loading.value = true
  try {
    const result = await checkAllNetdiskAccounts()
    accounts.value = result.accounts ?? []
    $toast.success(
      t('dashboard.netdiskStatus.refreshResult', {
        checked: result.checked ?? 0,
        active: result.active ?? 0,
        failed: (result.expired ?? 0) + (result.failed ?? 0),
      }),
    )
  }
  catch {
    $toast.error(t('dashboard.netdiskStatus.refreshFailed'))
  }
  finally {
    loading.value = false
  }
}

onMounted(loadAccounts)
</script>

<template>
  <VCard class="dashboard-netdisk-card dashboard-grid-fill">
    <VCardItem class="dashboard-netdisk-heading">
      <VCardTitle>{{ t('dashboard.netdiskStatus.title') }}</VCardTitle>
      <template v-if="props.allowRefresh" #append>
        <VBtn
          icon
          variant="text"
          size="small"
          class="dashboard-grid-no-drag"
          :loading="loading"
          :aria-label="t('dashboard.netdiskStatus.refresh')"
          @click="refresh"
        >
          <VIcon icon="mdi-refresh" size="20" />
        </VBtn>
      </template>
    </VCardItem>
    <VCardText class="dashboard-netdisk-body">
      <div v-if="platforms.length === 0" class="dashboard-netdisk-empty text-caption">
        {{ t('dashboard.netdiskStatus.noAccounts') }}
      </div>
      <div v-else class="dashboard-netdisk-grid">
        <VTooltip
          v-for="item in platforms"
          :key="item.platform"
          :text="t('dashboard.netdiskStatus.accountSummary', { total: item.total, active: item.active })"
          location="top"
        >
          <template #activator="{ props: tooltipProps }">
            <div class="dashboard-netdisk-cell" v-bind="tooltipProps">
              <div class="dashboard-netdisk-row">
                <VIcon :icon="getNetdiskPlatformIcon(item.platform)" size="18" class="dashboard-netdisk-icon" />
                <span class="dashboard-netdisk-name">{{ getNetdiskPlatformName(t, item.platform) }}</span>
              </div>
              <div class="dashboard-netdisk-row dashboard-netdisk-meta">
                <span
                  class="dashboard-netdisk-dot"
                  :class="`bg-${item.statusColor}`"
                  :title="statusLabel(item.statusColor)"
                />
                <span class="text-caption dashboard-netdisk-space">
                  {{ item.freeBytes === null ? '--' : formatNetdiskFreeSpace(item.freeBytes) }}
                </span>
              </div>
              <div class="dashboard-netdisk-row dashboard-netdisk-speed">
                <VIcon icon="mdi-speedometer" size="12" />
                <span
                  class="text-caption"
                  :title="t('dashboard.netdiskStatus.averageSpeed')"
                >
                  {{ item.avgSpeed === null ? '--' : formatNetdiskSpeed(item.avgSpeed) }}
                </span>
              </div>
            </div>
          </template>
        </VTooltip>
      </div>
    </VCardText>
  </VCard>
</template>

<style scoped>
.dashboard-netdisk-card {
  display: flex;
  flex-direction: column;
  block-size: 100%;
}

.dashboard-netdisk-heading {
  padding-block: 0.8rem 0.2rem;
}

.dashboard-netdisk-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  padding-block: 0.25rem 0.8rem;
}

.dashboard-netdisk-empty {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.dashboard-netdisk-grid {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.35rem 0.5rem;
  align-content: center;
}

.dashboard-netdisk-cell {
  display: flex;
  min-inline-size: 0;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.15rem 0.1rem;
}

.dashboard-netdisk-row {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  gap: 0.3rem;
}

.dashboard-netdisk-icon {
  flex-shrink: 0;
  color: rgba(var(--v-theme-on-surface), 0.75);
}

.dashboard-netdisk-name {
  overflow: hidden;
  font-size: 0.72rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-netdisk-meta {
  gap: 0.35rem;
}

.dashboard-netdisk-dot {
  display: inline-block;
  flex-shrink: 0;
  border-radius: 50%;
  block-size: 8px;
  inline-size: 8px;
}

.dashboard-netdisk-space {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.7);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-netdisk-speed {
  gap: 0.2rem;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.55);
  white-space: nowrap;
}

@media (max-width: 740px) {
  .dashboard-netdisk-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
