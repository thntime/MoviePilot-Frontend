<script lang="ts" setup>
import type { PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NetdiskAccount } from '@/api/netdisk'
import NetdiskPlatformGroup from '@/components/setting/NetdiskPlatformGroup.vue'
import { formatNetdiskFreeSpace, getNetdiskPlatformName, getNetdiskQuotaPercent, getNetdiskStatusMeta } from '@/utils/netdisk'

// 国际化
const { t } = useI18n()

// 输入参数
const props = defineProps({
  // 按平台分组后的账号（保持父级排序）
  groupedAccounts: {
    type: Array as PropType<Array<[string, NetdiskAccount[]]>>,
    required: true,
  },
  // 当前选中账号 id
  selectedId: {
    type: Number as PropType<number | null>,
    default: null,
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['select'])

// 平台默认全部展开；记录用户主动折叠的平台集合，搜索时临时展开匹配分组。
const collapsedPlatforms = ref(new Set<string>())
const search = ref('')

// 账号较多或正在搜索时才显示搜索框
const showSearch = computed(() => {
  const total = props.groupedAccounts.reduce((sum, [, list]) => sum + list.length, 0)
  return total >= 8 || search.value.trim() !== ''
})

// 过滤后的分组；搜索不改变当前选中
const filteredGroups = computed<Array<[string, NetdiskAccount[]]>>(() => {
  const keyword = search.value.trim().toLowerCase()
  if (!keyword) return props.groupedAccounts
  const result: Array<[string, NetdiskAccount[]]> = []
  for (const [platform, list] of props.groupedAccounts) {
    const platformName = getNetdiskPlatformName(t, platform).toLowerCase()
    const matched = list.filter(account => {
      return account.nickname.toLowerCase().includes(keyword) || platformName.includes(keyword)
    })
    if (matched.length > 0) result.push([platform, matched])
  }
  return result
})

function isExpanded(platform: string): boolean {
  return search.value.trim() !== '' || !collapsedPlatforms.value.has(platform)
}

function togglePlatform(platform: string) {
  const next = new Set(collapsedPlatforms.value)
  if (next.has(platform)) next.delete(platform)
  else next.add(platform)
  collapsedPlatforms.value = next
}

function selectAccount(account: NetdiskAccount) {
  emit('select', account.id)
}
</script>

<template>
  <div class="netdisk-account-list d-flex flex-column">
    <div v-if="showSearch" class="px-3 pt-3 pb-2 shrink-0">
      <VTextField
        v-model="search"
        :placeholder="t('netdisk.list.search')"
        prepend-inner-icon="mdi-magnify"
        density="compact"
        variant="outlined"
        hide-details
        clearable
        :aria-label="t('netdisk.list.search')"
      />
    </div>
    <div class="netdisk-console__scroll flex-grow-1" role="listbox" :aria-label="t('netdisk.list.label')">
      <template v-for="[platform, list] in filteredGroups" :key="platform">
        <NetdiskPlatformGroup
          :platform="platform"
          :accounts="list"
          :expanded="isExpanded(platform)"
          @toggle="togglePlatform(platform)"
        />
        <VListItem
          v-for="account in isExpanded(platform) ? list : []"
          :key="account.id"
          :active="account.id === selectedId"
          class="netdisk-account-list__item"
          role="option"
          :aria-selected="account.id === selectedId"
          @click="selectAccount(account)"
        >
          <template #prepend>
            <span
              class="netdisk-account-list__status-dot"
              :class="`bg-${getNetdiskStatusMeta(t, account.status).color}`"
            />
            <span class="d-sr-only">{{ getNetdiskStatusMeta(t, account.status).text }}</span>
          </template>
          <VListItemTitle class="d-flex align-center gap-1">
            <span class="text-truncate" :title="account.nickname || getNetdiskPlatformName(t, account.platform)">
              {{ account.nickname || getNetdiskPlatformName(t, account.platform) }}
            </span>
            <VIcon
              v-if="account.is_primary"
              icon="mdi-star"
              color="warning"
              size="14"
              class="shrink-0"
              :aria-label="t('netdisk.primary')"
            />
          </VListItemTitle>
          <VListItemSubtitle v-if="account.quota_total > 0" class="d-flex align-center gap-2 mt-1">
            <VProgressLinear
              :model-value="getNetdiskQuotaPercent(account.quota_used, account.quota_total)"
              height="4"
              rounded
              class="flex-grow-1"
            />
            <span class="text-caption text-medium-emphasis shrink-0">
              {{ getNetdiskQuotaPercent(account.quota_used, account.quota_total) }}%
            </span>
            <!-- 剩余空间：负值按 0 处理，与平台分组的汇总口径一致 -->
            <span class="text-caption text-medium-emphasis shrink-0">
              {{ t('netdisk.detail.quotaFree', { free: formatNetdiskFreeSpace(Math.max(account.quota_total - account.quota_used, 0)) }) }}
            </span>
          </VListItemSubtitle>
          <VListItemSubtitle v-else class="mt-1">
            {{ getNetdiskStatusMeta(t, account.status).text }}
          </VListItemSubtitle>
        </VListItem>
      </template>
      <div v-if="filteredGroups.length === 0" class="pa-4 text-center text-medium-emphasis text-body-2">
        <div>{{ t('netdisk.list.searchEmpty') }}</div>
        <VBtn variant="text" size="small" class="mt-1" @click="search = ''">
          {{ t('netdisk.list.clearSearch') }}
        </VBtn>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.netdisk-account-list {
  min-block-size: 0;
  block-size: 100%;
  border-inline-end: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.netdisk-account-list__item {
  margin-block: 2px;
}

.netdisk-account-list__status-dot {
  display: inline-block;
  inline-size: 8px;
  block-size: 8px;
  border-radius: 50%;
}
</style>
