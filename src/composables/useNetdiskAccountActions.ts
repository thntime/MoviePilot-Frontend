import type { Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'
import {
  deleteNetdiskAccount,
  probeNetdiskAccount,
  refreshNetdiskAccount,
  updateNetdiskAccount,
  type NetdiskAccount,
} from '@/api/netdisk'
import { getApiBusinessErrorMessage } from '@/api/client'
import { useConfirm } from '@/composables/useConfirm'

/**
 * 网盘账号的探测/刷新/设主/删除动作，设置卡片与详情面板共用。
 *
 * @param account - 响应式账号引用（卡片里用 toRef(props, 'account')）
 * @param onUpdate - 数据变化后的回调，通常是刷新账号列表
 */
export function useNetdiskAccountActions(account: Ref<NetdiskAccount>, onUpdate: () => void) {
  const { t } = useI18n()
  const $toast = useToast()
  const createConfirm = useConfirm()

  const probing = ref(false)
  const refreshing = ref(false)
  const settingPrimary = ref(false)

  // 检测连通性
  async function probeAccount() {
    if (probing.value) return
    probing.value = true
    try {
      await probeNetdiskAccount(account.value.id)
      $toast.success(t('netdisk.probeSuccess', { name: account.value.name }))
    } catch (error) {
      $toast.error(getApiBusinessErrorMessage(error) ?? t('netdisk.probeFailed', { name: account.value.name }))
    } finally {
      probing.value = false
      onUpdate()
    }
  }

  // 刷新令牌
  async function refreshAccount() {
    if (refreshing.value) return
    refreshing.value = true
    try {
      await refreshNetdiskAccount(account.value.id)
      $toast.success(t('netdisk.refreshSuccess', { name: account.value.name }))
    } catch (error) {
      $toast.error(getApiBusinessErrorMessage(error) ?? t('netdisk.refreshFailed', { name: account.value.name }))
    } finally {
      refreshing.value = false
      onUpdate()
    }
  }

  // 设为主账号
  async function setPrimary() {
    if (settingPrimary.value || account.value.is_primary) return
    settingPrimary.value = true
    try {
      await updateNetdiskAccount(account.value.id, { is_primary: true })
      $toast.success(t('netdisk.setPrimarySuccess', { name: account.value.name }))
      onUpdate()
    } catch (error) {
      $toast.error(getApiBusinessErrorMessage(error) ?? t('netdisk.setPrimaryFailed', { name: account.value.name }))
    } finally {
      settingPrimary.value = false
    }
  }

  // 删除账号（二次确认）
  async function deleteAccount() {
    const isConfirmed = await createConfirm({
      title: t('common.confirm'),
      content: t('netdisk.deleteConfirm', { name: account.value.name }),
    })
    if (!isConfirmed) return

    try {
      await deleteNetdiskAccount(account.value.id)
      $toast.success(t('netdisk.deleteSuccess', { name: account.value.name }))
      onUpdate()
    } catch (error) {
      $toast.error(getApiBusinessErrorMessage(error) ?? t('netdisk.deleteFailed', { name: account.value.name }))
    }
  }

  return {
    probing,
    refreshing,
    settingPrimary,
    probeAccount,
    refreshAccount,
    setPrimary,
    deleteAccount,
  }
}
