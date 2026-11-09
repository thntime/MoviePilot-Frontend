<script lang="ts" setup>
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useToast } from 'vue-toastification'
import {
  checkAllNetdiskAccounts,
  fetchNetdiskAccounts,
  fetchNetdiskPlatforms,
  type NetdiskAccount,
  type NetdiskPlatformInfo,
} from '@/api/netdisk'
import NetdiskAccountCard from '@/components/cards/NetdiskAccountCard.vue'
import NetdiskAccountDetail from '@/components/setting/NetdiskAccountDetail.vue'
import NetdiskAccountList from '@/components/setting/NetdiskAccountList.vue'
import NetdiskPlatformGroup from '@/components/setting/NetdiskPlatformGroup.vue'
import NoDataFound from '@/components/states/NoDataFound.vue'
import { useAvailableHeight } from '@/composables/useAvailableHeight'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useSilentSettingRefresh } from '@/composables/useSilentSettingRefresh'
import {
  compareNetdiskPlatforms,
  resolveFallbackNetdiskAccountId,
  resolveInitialNetdiskAccountId,
} from '@/utils/netdisk'

// 国际化
const { t } = useI18n()

// 轻提示
const $toast = useToast()

// 响应式断点：桌面（md 及以上）使用主从布局，移动端保留卡片网格
const { mdAndUp } = useDisplay()

// 工作区高度：视口减去布局与卡片头占用，避免整页长滚动
const { availableHeight } = useAvailableHeight(112, 420)

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

const route = useRoute()

// 移动端平台分组默认全部展开；记录用户主动折叠的平台集合。
const mobileCollapsedPlatforms = ref(new Set<string>())

// 当前选中账号 id（仅桌面主从布局使用；移动端不自动进详情）
const selectedId = ref<number | null>(null)

// 是否已应用初始选中（query/主账号/第一个），避免后续刷新覆盖用户选择
const initialSelectionDone = ref(false)

function toggleMobilePlatform(platform: string) {
  const next = new Set(mobileCollapsedPlatforms.value)
  if (next.has(platform)) next.delete(platform)
  else next.add(platform)
  mobileCollapsedPlatforms.value = next
}

// 是否刷新过
const isRefreshed = ref(false)

// 是否加载中
const loading = ref(false)

// 一键检查按钮的加载态
const checking = ref(false)

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
  return [...groups.entries()].sort((a, b) => compareNetdiskPlatforms(a[0], b[0]))
})

// 平台能力速查
const platformInfoMap = computed(() => {
  const map: Record<string, NetdiskPlatformInfo> = {}
  for (const item of platforms.value) map[item.platform] = item
  return map
})

// 当前选中账号
const selectedAccount = computed(() => accounts.value.find(account => account.id === selectedId.value) ?? null)

/**
 * 刷新后维持选中：已有选中且仍存在则保持；不存在（被删除）按回退规则补选；
 * 首次刷新且桌面端时应用初始选中（query > 主账号 > 第一个）。
 *
 * @param snapshot - 刷新前的账号列表快照（用于删除回退计算）
 * @param pendingSelectId - 新增保存后待选中的新账号 id（id 差集计算结果）
 */
function reconcileSelection(snapshot: NetdiskAccount[], pendingSelectId: number | null = null) {
  if (pendingSelectId != null && accounts.value.some(account => account.id === pendingSelectId)) {
    selectedId.value = pendingSelectId
    initialSelectionDone.value = true
    return
  }
  if (selectedId.value != null) {
    if (accounts.value.some(account => account.id === selectedId.value)) return
    // 选中项被删除：先基于刷新前快照计算回退，再校验仍存在
    const fallback = resolveFallbackNetdiskAccountId(snapshot, selectedId.value)
    selectedId.value =
      fallback != null && accounts.value.some(account => account.id === fallback) ? fallback : null
    return
  }
  if (!initialSelectionDone.value && mdAndUp.value) {
    selectedId.value = resolveInitialNetdiskAccountId(accounts.value, route.query.account_id as string | undefined)
    initialSelectionDone.value = true
  }
}

// 加载平台与账号数据
async function fetchData(pendingSelectId: number | null = null) {
  if (loading.value) return
  loading.value = true
  if (!isRefreshed.value) loadError.value = false
  // 刷新前快照：删除回退与新增差集都基于它计算
  const snapshot = accounts.value
  try {
    const [platformList, accountList] = await Promise.all([fetchNetdiskPlatforms(), fetchNetdiskAccounts()])
    platforms.value = platformList
    accounts.value = accountList
    isRefreshed.value = true
    loadError.value = false
    reconcileSelection(snapshot, pendingSelectId)
  } catch (error) {
    console.error(error)
    if (!isRefreshed.value) loadError.value = true
  } finally {
    loading.value = false
  }
}

// 新增保存后：记录刷新前 id 集合，刷新后取差集新 id 选中
async function onAccountAdd() {
  const beforeIds = new Set(accounts.value.map(account => account.id))
  await fetchData()
  const added = accounts.value.find(account => !beforeIds.has(account.id))
  if (added) {
    selectedId.value = added.id
    initialSelectionDone.value = true
  }
}

// 编辑保存后刷新列表（差集为空，按 id 保持选中）
function onAccountSave() {
  fetchData()
}

// 一键检查所有账号有效性：成功后整体替换列表并提示汇总，失败保留原列表
async function checkAll() {
  if (checking.value) return
  checking.value = true
  try {
    const result = await checkAllNetdiskAccounts()
    accounts.value = result.accounts ?? []
    $toast.success(
      t('netdisk.check.done', {
        checked: result.checked,
        active: result.active,
        expired: result.expired,
        failed: result.failed,
      }),
    )
  } catch (error) {
    console.error(error)
    $toast.error(t('netdisk.check.failed'))
  } finally {
    checking.value = false
  }
}

// 打开新增账号弹窗
function openAddDialog() {
  openSharedDialog(
    NetdiskAccountDialog,
    { oper: 'add', platforms: platforms.value },
    { save: onAccountAdd, close: () => {} },
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

onMounted(() => {
  fetchData()
})

useSilentSettingRefresh(() => fetchData(), {
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
            <div class="d-flex gap-2">
              <VBtn
                variant="tonal"
                prepend-icon="mdi-check-circle-outline"
                :loading="checking"
                @click="checkAll"
              >
                {{ t('netdisk.actions.check') }}
              </VBtn>
              <VBtn color="primary" prepend-icon="mdi-cloud-plus-outline" @click="openAddDialog">
                {{ t('netdisk.actions.add') }}
              </VBtn>
            </div>
          </template>
        </VCardItem>
        <VCardText :class="mdAndUp ? 'pa-0' : ''">
          <LoadingBanner v-if="!isRefreshed && !loadError" />
          <template v-else-if="groupedAccounts.length > 0">
            <!-- 桌面：左侧账号列表 + 右侧详情 -->
            <div
              v-if="mdAndUp"
              class="netdisk-console"
              :style="{ blockSize: `${availableHeight}px` }"
            >
              <NetdiskAccountList
                :grouped-accounts="groupedAccounts"
                :selected-id="selectedId"
                @select="id => (selectedId = id)"
              />
              <div class="netdisk-console__detail netdisk-console__scroll">
                <NetdiskAccountDetail
                  v-if="selectedAccount"
                  :key="selectedAccount.id"
                  :account="selectedAccount"
                  :platform-info="platformInfoMap[selectedAccount.platform]"
                  @update="fetchData()"
                  @edit="openEditDialog(selectedAccount)"
                />
                <div v-else class="netdisk-console__empty">
                  <VIcon icon="mdi-account-box-outline" size="48" color="medium-emphasis" />
                  <div class="text-h6 mt-3">{{ t('netdisk.detail.selectTitle') }}</div>
                  <div class="text-body-2 text-medium-emphasis mt-1 mb-4">
                    {{ t('netdisk.detail.selectHint') }}
                  </div>
                  <VBtn color="primary" variant="tonal" prepend-icon="mdi-cloud-plus-outline" @click="openAddDialog">
                    {{ t('netdisk.actions.add') }}
                  </VBtn>
                </div>
              </div>
            </div>
            <!-- 移动端：平台分组 + 卡片网格 -->
            <template v-else>
              <div v-for="[platform, list] in groupedAccounts" :key="platform" class="mb-3">
                <NetdiskPlatformGroup
                  :platform="platform"
                  :accounts="list"
                  :expanded="!mobileCollapsedPlatforms.has(platform)"
                  @toggle="toggleMobilePlatform(platform)"
                />
                <div v-if="!mobileCollapsedPlatforms.has(platform)" class="grid gap-4 grid-site-card mt-3">
                  <NetdiskAccountCard
                    v-for="account in list"
                    :key="account.id"
                    :account="account"
                    :supports-refresh="platformInfoMap[account.platform]?.supports_refresh ?? false"
                    @update="fetchData()"
                    @edit="openEditDialog(account)"
                  />
                </div>
              </div>
            </template>
          </template>
          <NoDataFound
            v-else-if="loadError"
            error-code="500"
            :error-title="t('common.serverConnectionFailed')"
            :error-description="t('common.troubleshooting')"
          >
            <template #button>
              <VBtn color="primary" variant="tonal" @click="fetchData()">
                {{ t('common.retry') }}
              </VBtn>
            </template>
          </NoDataFound>
          <NoDataFound
            v-else
            error-code="404"
            :error-title="t('netdisk.noAccounts')"
            :error-description="t('netdisk.noAccountsHint')"
          >
            <template #button>
              <VBtn color="primary" prepend-icon="mdi-cloud-plus-outline" @click="openAddDialog">
                {{ t('netdisk.actions.add') }}
              </VBtn>
            </template>
          </NoDataFound>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>

<style lang="scss" scoped>
.netdisk-console {
  display: grid;
  grid-template-columns: 18rem 1fr;
  grid-template-rows: minmax(0, 1fr);
  gap: 1rem;
  overflow: hidden;

  @media (min-width: 1280px) {
    grid-template-columns: 20rem 1fr;
    gap: 1.5rem;
  }
}

:deep(.netdisk-console__scroll) {
  overflow-y: auto;
  min-block-size: 0;
  overscroll-behavior: contain;
}

.netdisk-console__detail {
  padding: 16px 24px;
}

.netdisk-console__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-block-size: 18rem;
  block-size: 100%;
  text-align: center;
  padding: 24px;
}
</style>
