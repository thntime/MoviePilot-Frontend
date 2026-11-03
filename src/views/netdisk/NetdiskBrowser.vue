<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useToast } from 'vue-toastification'
import { useDisplay } from 'vuetify'
import { formatBytes } from '@core/utils/formatters'
import { getApiBusinessErrorMessage } from '@/api/client'
import { fetchNetdiskAccounts, type NetdiskAccount } from '@/api/netdisk'
import {
  buildNetdiskStreamUrl,
  createNetdiskShare,
  deleteNetdiskFiles,
  fetchNetdiskFileCapabilities,
  fetchNetdiskFileList,
  fetchNetdiskFileQuota,
  moveNetdiskFiles,
  renameNetdiskFile,
  type NetdiskCapabilities,
  type NetdiskFileItem,
  type NetdiskQuota,
  type NetdiskShareResult,
} from '@/api/netdiskFiles'
import NetdiskBreadcrumb from '@/components/netdisk/NetdiskBreadcrumb.vue'
import NetdiskFileRow from '@/components/netdisk/NetdiskFileRow.vue'
import NetdiskMoveDialog from '@/components/netdisk/NetdiskMoveDialog.vue'
import NetdiskRenameDialog from '@/components/netdisk/NetdiskRenameDialog.vue'
import NetdiskShareDialog from '@/components/netdisk/NetdiskShareDialog.vue'
import type { NetdiskBreadcrumbItem } from '@/components/netdisk/types'
import NoDataFound from '@/components/states/NoDataFound.vue'

const { t } = useI18n()
const $toast = useToast()
const route = useRoute()
const display = useDisplay()

// 账号
const accounts = ref<NetdiskAccount[]>([])
const currentAccountId = ref<number | null>(null)

// 能力与空间
const capabilities = ref<NetdiskCapabilities>({})
const capabilitiesLoaded = ref(false)
const quota = ref<NetdiskQuota | null>(null)

// 目录与文件
const breadcrumb = ref<NetdiskBreadcrumbItem[]>([{ id: '', name: '' }])
const files = ref<NetdiskFileItem[]>([])
const loading = ref(false)
const loadError = ref<string | null>(null)
const loadErrorCode = ref('500')
const unauthorized = ref(false)

// 多选
const selected = ref<NetdiskFileItem[]>([])
const selectionMode = computed(() => selected.value.length > 0)

// 弹窗
const shareDialogVisible = ref(false)
const shareFiles = ref<NetdiskFileItem[]>([])
const shareLoading = ref(false)
const shareResult = ref<NetdiskShareResult | null>(null)

const moveDialogVisible = ref(false)
const moveFiles = ref<NetdiskFileItem[]>([])
const moveLoading = ref(false)

const renameDialogVisible = ref(false)
const renameFile = ref<NetdiskFileItem | null>(null)
const renameLoading = ref(false)

const currentParentId = computed(() => breadcrumb.value[breadcrumb.value.length - 1]?.id ?? '')

const currentAccount = computed(() => accounts.value.find(item => item.id === currentAccountId.value) ?? null)

const accountOptions = computed(() =>
  accounts.value.map(item => ({ title: `${item.platform} · ${item.name}`, value: item.id })),
)

const quotaPercent = computed(() => {
  if (!quota.value || !quota.value.total) return 0
  return Math.min(100, Math.round((quota.value.used / quota.value.total) * 100))
})

const sortedFiles = computed(() =>
  [...files.value].sort((a, b) => Number(b.is_dir) - Number(a.is_dir) || a.name.localeCompare(b.name)),
)

const allSelected = computed({
  get: () => sortedFiles.value.length > 0 && selected.value.length === sortedFiles.value.length,
  set: value => {
    selected.value = value ? [...sortedFiles.value] : []
  },
})

function isUnauthorizedError(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status
  if (status === 401 || status === 403) return true
  return businessErrorCode(error) === 'AUTH_EXPIRED'
}

/** 读取后端业务失败分类（HTTP 200 + success=false）。 */
function businessErrorCode(error: unknown): string | undefined {
  const payload = (error as { payload?: { data?: { code?: string } } })?.payload
  return payload?.data?.code
}

/** 把业务错误分类映射为状态插画编号。 */
function errorCodeFor(error: unknown): string {
  switch (businessErrorCode(error)) {
    case 'AUTH_EXPIRED':
      return '401'
    case 'RATE_LIMITED':
      return '429'
    case 'UNSUPPORTED':
      return '403'
    default:
      return '500'
  }
}

// 初始化账号列表，支持 ?account_id= 深链
async function loadAccounts() {
  try {
    accounts.value = await fetchNetdiskAccounts()
    const queryId = Number(route.query.account_id)
    if (accounts.value.length > 0) {
      const fromQuery = accounts.value.find(item => item.id === queryId)
      currentAccountId.value = fromQuery?.id ?? accounts.value[0].id
    }
  } catch (error) {
    console.error(error)
    $toast.error(getApiBusinessErrorMessage(error) ?? t('netdisk.browser.loadFailed'))
  }
}

async function loadCapabilities() {
  if (currentAccountId.value == null) return
  capabilitiesLoaded.value = false
  capabilities.value = {}
  quota.value = null
  try {
    capabilities.value = await fetchNetdiskFileCapabilities(currentAccountId.value)
    capabilitiesLoaded.value = true
    if (capabilities.value.quota) {
      quota.value = await fetchNetdiskFileQuota(currentAccountId.value)
    }
  } catch (error) {
    capabilitiesLoaded.value = true
    if (isUnauthorizedError(error)) {
      unauthorized.value = true
      return
    }
    console.error(error)
  }
}

async function loadFiles() {
  if (currentAccountId.value == null) return
  loading.value = true
  loadError.value = null
  loadErrorCode.value = '500'
  try {
    files.value = await fetchNetdiskFileList(currentAccountId.value, currentParentId.value || undefined)
    unauthorized.value = false
  } catch (error) {
    if (isUnauthorizedError(error)) {
      unauthorized.value = true
    } else {
      loadError.value = getApiBusinessErrorMessage(error) ?? t('netdisk.browser.loadFailed')
      loadErrorCode.value = errorCodeFor(error)
    }
    console.error(error)
  } finally {
    loading.value = false
  }
}

async function refreshAll() {
  await loadCapabilities()
  if (capabilities.value.browse !== false && !unauthorized.value) await loadFiles()
}

watch(currentAccountId, value => {
  if (value == null) return
  breadcrumb.value = [{ id: '', name: '' }]
  selected.value = []
  refreshAll()
})

function navigateBreadcrumb(index: number) {
  breadcrumb.value = breadcrumb.value.slice(0, index + 1)
  selected.value = []
  loadFiles()
}

function openDir(file: NetdiskFileItem) {
  if (!file.is_dir) return
  breadcrumb.value = [...breadcrumb.value, { id: file.file_id, name: file.name }]
  selected.value = []
  loadFiles()
}

function toggleSelect(file: NetdiskFileItem) {
  const idx = selected.value.findIndex(item => item.file_id === file.file_id)
  if (idx >= 0) selected.value.splice(idx, 1)
  else selected.value.push(file)
}

function isSelected(file: NetdiskFileItem) {
  return selected.value.some(item => item.file_id === file.file_id)
}

function downloadFile(file: NetdiskFileItem) {
  if (currentAccountId.value == null) return
  window.open(buildNetdiskStreamUrl(currentAccountId.value, file), '_blank')
}

function onRowAction(action: 'download' | 'share' | 'rename' | 'move' | 'delete', file: NetdiskFileItem) {
  switch (action) {
    case 'download':
      downloadFile(file)
      break
    case 'share':
      shareFiles.value = [file]
      shareResult.value = null
      shareDialogVisible.value = true
      break
    case 'rename':
      renameFile.value = file
      renameDialogVisible.value = true
      break
    case 'move':
      moveFiles.value = [file]
      moveDialogVisible.value = true
      break
    case 'delete':
      confirmDelete([file])
      break
  }
}

function confirmDelete(targets: NetdiskFileItem[]) {
  if (targets.length === 0 || currentAccountId.value == null) return
  if (!window.confirm(t('netdisk.browser.deleteConfirm', { count: targets.length }))) return
  const accountId = currentAccountId.value
  deleteNetdiskFiles(accountId, targets)
    .then(() => {
      $toast.success(t('netdisk.browser.deleteSuccess'))
      selected.value = []
      loadFiles()
      if (capabilities.value.quota) loadCapabilities()
    })
    .catch(error => {
      $toast.error(getApiBusinessErrorMessage(error) ?? t('netdisk.browser.deleteFailed'))
    })
}

async function onShareSubmit(password: string, expiresIn: number) {
  if (currentAccountId.value == null || shareFiles.value.length === 0) return
  shareLoading.value = true
  try {
    shareResult.value = await createNetdiskShare(currentAccountId.value, shareFiles.value, password, expiresIn)
  } catch (error) {
    $toast.error(getApiBusinessErrorMessage(error) ?? t('netdisk.browser.share.failed'))
  } finally {
    shareLoading.value = false
  }
}

async function onMoveSubmit(targetId: string) {
  if (currentAccountId.value == null || moveFiles.value.length === 0) return
  if (targetId === currentParentId.value) {
    $toast.info(t('netdisk.browser.move.sameDir'))
    return
  }
  moveLoading.value = true
  try {
    await moveNetdiskFiles(currentAccountId.value, moveFiles.value, targetId)
    $toast.success(t('netdisk.browser.move.success'))
    moveDialogVisible.value = false
    selected.value = []
    await loadFiles()
  } catch (error) {
    $toast.error(getApiBusinessErrorMessage(error) ?? t('netdisk.browser.move.failed'))
  } finally {
    moveLoading.value = false
  }
}

async function onRenameSubmit(name: string) {
  if (currentAccountId.value == null || !renameFile.value) return
  renameLoading.value = true
  try {
    await renameNetdiskFile(currentAccountId.value, renameFile.value, name)
    $toast.success(t('netdisk.browser.rename.success'))
    renameDialogVisible.value = false
    await loadFiles()
  } catch (error) {
    $toast.error(getApiBusinessErrorMessage(error) ?? t('netdisk.browser.rename.failed'))
  } finally {
    renameLoading.value = false
  }
}

function shareSelected() {
  shareFiles.value = [...selected.value]
  shareResult.value = null
  shareDialogVisible.value = true
}

function moveSelected() {
  moveFiles.value = [...selected.value]
  moveDialogVisible.value = true
}

onMounted(loadAccounts)
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>{{ t('netdisk.browser.title') }}</VCardTitle>
          <VCardSubtitle>{{ t('netdisk.browser.description') }}</VCardSubtitle>
          <template #append>
            <VBtn
              icon="mdi-refresh"
              variant="tonal"
              :loading="loading"
              :disabled="currentAccountId == null"
              @click="refreshAll"
            />
          </template>
        </VCardItem>
        <VCardText>
          <!-- 账号选择 + 空间 -->
          <div class="d-flex flex-wrap align-center gap-4 mb-4">
            <VSelect
              v-model="currentAccountId"
              :items="accountOptions"
              :label="t('netdisk.browser.account')"
              density="comfortable"
              hide-details
              style="max-inline-size: 320px; min-inline-size: 240px"
            />
            <div v-if="quota" class="flex-grow-1" style="min-inline-size: 200px; max-inline-size: 420px">
              <VProgressLinear :model-value="quotaPercent" height="8" rounded color="primary" />
              <div class="text-caption text-medium-emphasis mt-1">
                {{ t('netdisk.browser.quota', { used: formatBytes(quota.used), total: formatBytes(quota.total) }) }}
              </div>
            </div>
          </div>

          <!-- 无权限 -->
          <NoDataFound
            v-if="unauthorized"
            error-code="403"
            :error-title="t('netdisk.browser.unauthorized')"
            :error-description="t('netdisk.browser.unauthorizedHint')"
          />

          <!-- 平台不支持浏览 -->
          <NoDataFound
            v-else-if="capabilitiesLoaded && capabilities.browse === false"
            error-code="403"
            :error-title="t('netdisk.browser.unsupported')"
            :error-description="t('netdisk.browser.unsupportedHint')"
          />

          <template v-else-if="currentAccountId != null">
            <!-- 面包屑 + 批量操作 -->
            <div class="d-flex align-center flex-wrap gap-2 mb-2">
              <NetdiskBreadcrumb :items="breadcrumb" @navigate="navigateBreadcrumb" />
              <VSpacer />
              <template v-if="selectionMode">
                <VBtn
                  v-if="capabilities.share !== false"
                  size="small"
                  variant="tonal"
                  prepend-icon="mdi-share-variant-outline"
                  @click="shareSelected"
                >
                  {{ t('netdisk.browser.actions.share') }}
                </VBtn>
                <VBtn
                  v-if="capabilities.move !== false"
                  size="small"
                  variant="tonal"
                  prepend-icon="mdi-folder-move-outline"
                  @click="moveSelected"
                >
                  {{ t('netdisk.browser.actions.move') }}
                </VBtn>
                <VBtn
                  v-if="capabilities.delete !== false"
                  size="small"
                  variant="tonal"
                  color="error"
                  prepend-icon="mdi-delete-outline"
                  @click="confirmDelete([...selected])"
                >
                  {{ t('netdisk.browser.actions.delete') }}
                </VBtn>
              </template>
            </div>

            <!-- 表头（桌面端） -->
            <div v-if="display.mdAndUp.value" class="d-flex align-center gap-3 px-2 py-1 text-caption text-medium-emphasis">
              <VCheckboxBtn v-model="allSelected" density="compact" />
              <div class="flex-grow-1">{{ t('netdisk.browser.columns.name') }}</div>
              <div style="inline-size: 7rem">{{ t('netdisk.browser.columns.size') }}</div>
              <div style="inline-size: 9rem">{{ t('netdisk.browser.columns.updatedAt') }}</div>
              <div style="inline-size: 2.5rem" />
            </div>
            <div v-else class="d-flex align-center px-2 py-1">
              <VCheckboxBtn v-model="allSelected" density="compact" />
              <span class="text-caption text-medium-emphasis">{{ t('netdisk.browser.selected', { count: selected.length }) }}</span>
            </div>
            <VDivider class="mb-1" />

            <LoadingBanner v-if="loading" />
            <NoDataFound
              v-else-if="loadError"
              :error-code="loadErrorCode"
              :error-title="loadError"
              :error-description="t('common.troubleshooting')"
            >
              <template #button>
                <VBtn color="primary" variant="tonal" @click="loadFiles">{{ t('common.retry') }}</VBtn>
              </template>
            </NoDataFound>
            <NoDataFound
              v-else-if="sortedFiles.length === 0"
              error-code="404"
              :error-title="t('netdisk.browser.empty')"
              :error-description="t('netdisk.browser.emptyHint')"
            />
            <div v-else>
              <NetdiskFileRow
                v-for="file in sortedFiles"
                :key="file.file_id"
                :file="file"
                :selected="isSelected(file)"
                :show-checkbox="selectionMode || isSelected(file) || display.mdAndUp.value"
                :capabilities="capabilities"
                @toggle="toggleSelect"
                @open="openDir"
                @action="onRowAction"
              />
            </div>
          </template>

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

  <NetdiskShareDialog
    v-model="shareDialogVisible"
    :files="shareFiles"
    :loading="shareLoading"
    :result="shareResult"
    @submit="onShareSubmit"
  />
  <NetdiskMoveDialog
    v-model="moveDialogVisible"
    :account-id="currentAccountId ?? 0"
    :moving="moveFiles"
    :loading="moveLoading"
    @submit="onMoveSubmit"
  />
  <NetdiskRenameDialog
    v-model="renameDialogVisible"
    :file="renameFile"
    :loading="renameLoading"
    @submit="onRenameSubmit"
  />
</template>
