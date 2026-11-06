import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'
import { getApiBusinessErrorMessage } from '@/api/client'
import {
  buildNetdiskStreamUrl,
  createNetdiskShare,
  deleteNetdiskFiles,
  fetchNetdiskFileCapabilities,
  fetchNetdiskFileList,
  moveNetdiskFiles,
  renameNetdiskFile,
  type NetdiskCapabilities,
  type NetdiskFileItem,
  type NetdiskShareResult,
} from '@/api/netdiskFiles'
import type { NetdiskBreadcrumbItem } from '@/components/netdisk/types'
import { useConfirm } from '@/composables/useConfirm'

/** 提供指定网盘账号的目录导航与文件操作状态。 */
export function useNetdiskFileBrowser(accountId: Ref<number>) {
  const { t } = useI18n()
  const $toast = useToast()
  const createConfirm = useConfirm()

  const capabilities = ref<NetdiskCapabilities>({})
  const capabilitiesLoaded = ref(false)
  const breadcrumb = ref<NetdiskBreadcrumbItem[]>([{ id: '', name: '' }])
  const files = ref<NetdiskFileItem[]>([])
  const loading = ref(false)
  const loadError = ref<string | null>(null)
  const loadErrorCode = ref('500')
  const unauthorized = ref(false)
  const selected = ref<NetdiskFileItem[]>([])

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
  const selectionMode = computed(() => selected.value.length > 0)
  const sortedFiles = computed(() =>
    [...files.value].sort((a, b) => Number(b.is_dir) - Number(a.is_dir) || a.name.localeCompare(b.name)),
  )
  const allSelected = computed({
    get: () => sortedFiles.value.length > 0 && selected.value.length === sortedFiles.value.length,
    set: value => {
      selected.value = value ? [...sortedFiles.value] : []
    },
  })

  /** 读取后端业务失败分类。 */
  function businessErrorCode(error: unknown): string | undefined {
    const payload = (error as { payload?: { data?: { code?: string } } })?.payload
    return payload?.data?.code
  }

  function isUnauthorizedError(error: unknown): boolean {
    const status = (error as { response?: { status?: number } })?.response?.status
    return status === 401 || status === 403 || businessErrorCode(error) === 'AUTH_EXPIRED'
  }

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

  async function loadCapabilities() {
    capabilitiesLoaded.value = false
    capabilities.value = {}
    try {
      capabilities.value = await fetchNetdiskFileCapabilities(accountId.value)
      capabilitiesLoaded.value = true
    } catch (error) {
      capabilitiesLoaded.value = true
      if (isUnauthorizedError(error)) unauthorized.value = true
      else console.error(error)
    }
  }

  async function loadFiles() {
    loading.value = true
    loadError.value = null
    loadErrorCode.value = '500'
    try {
      files.value = await fetchNetdiskFileList(accountId.value, currentParentId.value || undefined)
      unauthorized.value = false
    } catch (error) {
      if (isUnauthorizedError(error)) unauthorized.value = true
      else {
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

  watch(accountId, () => {
    breadcrumb.value = [{ id: '', name: '' }]
    selected.value = []
    unauthorized.value = false
    void refreshAll()
  }, { immediate: true })

  function navigateBreadcrumb(index: number) {
    breadcrumb.value = breadcrumb.value.slice(0, index + 1)
    selected.value = []
    void loadFiles()
  }

  function goParent() {
    if (breadcrumb.value.length > 1) navigateBreadcrumb(breadcrumb.value.length - 2)
  }

  function openDir(file: NetdiskFileItem) {
    if (!file.is_dir) return
    breadcrumb.value = [...breadcrumb.value, { id: file.file_id, name: file.name }]
    selected.value = []
    void loadFiles()
  }

  function toggleSelect(file: NetdiskFileItem) {
    const index = selected.value.findIndex(item => item.file_id === file.file_id)
    if (index >= 0) selected.value.splice(index, 1)
    else selected.value.push(file)
  }

  function isSelected(file: NetdiskFileItem) {
    return selected.value.some(item => item.file_id === file.file_id)
  }

  function downloadFile(file: NetdiskFileItem) {
    window.open(buildNetdiskStreamUrl(accountId.value, file), '_blank')
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

  async function confirmDelete(targets: NetdiskFileItem[]) {
    if (targets.length === 0) return
    const isConfirmed = await createConfirm({
      title: t('common.confirm'),
      content: t('netdisk.browser.deleteConfirm', { count: targets.length }),
    })
    if (!isConfirmed) return
    try {
      await deleteNetdiskFiles(accountId.value, targets)
      $toast.success(t('netdisk.browser.deleteSuccess'))
      selected.value = []
      await loadFiles()
    } catch (error) {
      $toast.error(getApiBusinessErrorMessage(error) ?? t('netdisk.browser.deleteFailed'))
    }
  }

  async function onShareSubmit(password: string, expiresIn: number) {
    if (shareFiles.value.length === 0) return
    shareLoading.value = true
    try {
      shareResult.value = await createNetdiskShare(accountId.value, shareFiles.value, password, expiresIn)
    } catch (error) {
      $toast.error(getApiBusinessErrorMessage(error) ?? t('netdisk.browser.share.failed'))
    } finally {
      shareLoading.value = false
    }
  }

  async function onMoveSubmit(targetId: string) {
    if (moveFiles.value.length === 0) return
    if (targetId === currentParentId.value) {
      $toast.info(t('netdisk.browser.move.sameDir'))
      return
    }
    moveLoading.value = true
    try {
      await moveNetdiskFiles(accountId.value, moveFiles.value, targetId)
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
    if (!renameFile.value) return
    renameLoading.value = true
    try {
      await renameNetdiskFile(accountId.value, renameFile.value, name)
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

  return {
    capabilities,
    capabilitiesLoaded,
    breadcrumb,
    loading,
    loadError,
    loadErrorCode,
    unauthorized,
    selected,
    selectionMode,
    sortedFiles,
    allSelected,
    shareDialogVisible,
    shareFiles,
    shareLoading,
    shareResult,
    moveDialogVisible,
    moveFiles,
    moveLoading,
    renameDialogVisible,
    renameFile,
    renameLoading,
    refreshAll,
    loadFiles,
    navigateBreadcrumb,
    goParent,
    openDir,
    toggleSelect,
    isSelected,
    onRowAction,
    confirmDelete,
    onShareSubmit,
    onMoveSubmit,
    onRenameSubmit,
    shareSelected,
    moveSelected,
  }
}
