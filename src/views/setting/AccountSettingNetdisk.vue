<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import {
  fetchNetdiskAccounts,
  fetchNetdiskPlatforms,
  type NetdiskAccount,
  type NetdiskPlatformInfo,
} from '@/api/netdisk'
import NetdiskAccountCard from '@/components/cards/NetdiskAccountCard.vue'
import NoDataFound from '@/components/states/NoDataFound.vue'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useSilentSettingRefresh } from '@/composables/useSilentSettingRefresh'

// 国际化
const { t } = useI18n()

const props = defineProps({
  active: {
    type: Boolean,
    default: true,
  },
})

// 新增/编辑账号弹窗按需加载
const NetdiskAccountDialog = defineAsyncComponent(() => import('@/components/dialog/NetdiskAccountDialog.vue'))

// 平台能力列表
const platforms = ref<NetdiskPlatformInfo[]>([])

// 账号列表
const accounts = ref<NetdiskAccount[]>([])

// 是否刷新过
const isRefreshed = ref(false)

// 是否加载中
const loading = ref(false)

// 首次加载失败时保留独立错误态，避免把网络异常显示成空列表
const loadError = ref(false)

// 按平台分组的账号；只展示有账号的平台
const groupedAccounts = computed(() => {
  const groups = new Map<string, NetdiskAccount[]>()
  for (const account of accounts.value) {
    const list = groups.get(account.platform) ?? []
    list.push(account)
    groups.set(account.platform, list)
  }
  const order = platforms.value.map(item => item.platform)
  return [...groups.entries()].sort((a, b) => {
    const ia = order.indexOf(a[0])
    const ib = order.indexOf(b[0])
    if (ia === -1 && ib === -1) return a[0].localeCompare(b[0])
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  })
})

// 平台能力速查
const platformInfoMap = computed(() => {
  const map: Record<string, NetdiskPlatformInfo> = {}
  for (const item of platforms.value) map[item.platform] = item
  return map
})

// 加载平台与账号数据
async function fetchData(refresh = false) {
  if (loading.value) return
  loading.value = true
  if (!isRefreshed.value) loadError.value = false
  try {
    const [platformList, accountList] = await Promise.all([fetchNetdiskPlatforms(), fetchNetdiskAccounts()])
    platforms.value = platformList
    accounts.value = accountList
    isRefreshed.value = true
    loadError.value = false
  } catch (error) {
    console.error(error)
    if (!isRefreshed.value) loadError.value = true
  } finally {
    loading.value = false
  }
}

// 打开新增账号弹窗
function openAddDialog() {
  openSharedDialog(
    NetdiskAccountDialog,
    { oper: 'add', platforms: platforms.value },
    { save: onAccountSave, close: () => {} },
    { closeOn: ['close', 'save'] },
  )
}

// 打开编辑账号弹窗
function openEditDialog(account: NetdiskAccount) {
  openSharedDialog(
    NetdiskAccountDialog,
    { oper: 'edit', account, platforms: platforms.value },
    { save: onAccountSave, close: () => {} },
    { closeOn: ['close', 'save'] },
  )
}

// 账号变更后刷新列表
function onAccountSave() {
  fetchData(true)
}

onMounted(() => {
  fetchData()
})

useSilentSettingRefresh(() => fetchData(true), {
  active: computed(() => props.active),
})
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>{{ t('netdisk.title') }}</VCardTitle>
          <VCardSubtitle>{{ t('netdisk.description') }}</VCardSubtitle>
          <template #append>
            <VBtn color="primary" prepend-icon="mdi-cloud-plus-outline" @click="openAddDialog">
              {{ t('netdisk.actions.add') }}
            </VBtn>
          </template>
        </VCardItem>
        <VCardText>
          <LoadingBanner v-if="!isRefreshed && !loadError" />
          <template v-else-if="groupedAccounts.length > 0">
            <div v-for="[platform, list] in groupedAccounts" :key="platform" class="mb-6">
              <div class="d-flex align-center gap-2 mb-3">
                <VIcon icon="mdi-cloud-outline" color="primary" />
                <span class="text-h6">{{ platform }}</span>
                <VChip v-if="platformInfoMap[platform]" size="x-small" variant="tonal" color="info">
                  {{ t('netdisk.maxConcurrency', { count: platformInfoMap[platform].max_concurrency }) }}
                </VChip>
              </div>
              <div class="grid gap-4 grid-site-card">
                <NetdiskAccountCard
                  v-for="account in list"
                  :key="account.id"
                  :account="account"
                  @update="fetchData(true)"
                  @edit="openEditDialog(account)"
                />
              </div>
            </div>
          </template>
          <NoDataFound
            v-else-if="loadError"
            error-code="500"
            :error-title="t('common.serverConnectionFailed')"
            :error-description="t('common.troubleshooting')"
          >
            <template #button>
              <VBtn color="primary" variant="tonal" @click="fetchData(true)">
                {{ t('common.retry') }}
              </VBtn>
            </template>
          </NoDataFound>
          <NoDataFound
            v-else
            error-code="404"
            :error-title="t('netdisk.noAccounts')"
            :error-description="t('netdisk.noAccountsHint')"
          />
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>
