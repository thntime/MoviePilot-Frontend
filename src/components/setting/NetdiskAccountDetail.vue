<script lang="ts" setup>
import type { PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'
import {
  clearNetdiskRecycleBin,
  fetchNetdiskAccount,
  type NetdiskAccount,
  type NetdiskAccountDetail,
  type NetdiskPlatformInfo,
} from '@/api/netdisk'
import { getApiBusinessErrorMessage } from '@/api/client'
import NetdiskAccountFiles from '@/components/setting/NetdiskAccountFiles.vue'
import { useConfirm } from '@/composables/useConfirm'
import { useNetdiskAccountActions } from '@/composables/useNetdiskAccountActions'
import { formatFileSize } from '@/@core/utils/formatters'
import {
  formatNetdiskDateTime,
  getNetdiskPlatformIcon,
  getNetdiskPlatformName,
  getNetdiskQuotaPercent,
  getNetdiskStatusMeta,
} from '@/utils/netdisk'

const { t } = useI18n()
const $toast = useToast()

const props = defineProps({
  account: {
    type: Object as PropType<NetdiskAccount>,
    required: true,
  },
  platformInfo: {
    type: Object as PropType<NetdiskPlatformInfo | undefined>,
    default: undefined,
  },
})

const emit = defineEmits(['update', 'edit'])

const createConfirm = useConfirm()

const accountRef = toRef(props, 'account')
const { probing, refreshing, settingPrimary, probeAccount, refreshAccount, setPrimary, deleteAccount } =
  useNetdiskAccountActions(accountRef, () => emit('update'))

const accountDetail = ref<NetdiskAccountDetail | null>(null)
const credentialLoading = ref(false)
const clearingRecycleBin = ref(false)

/** 选中账号变化时读取明文凭据，列表中的脱敏值不用于详情展示。 */
async function loadAccountDetail() {
  credentialLoading.value = true
  try {
    accountDetail.value = await fetchNetdiskAccount(props.account.id)
  } catch {
    accountDetail.value = null
  } finally {
    credentialLoading.value = false
  }
}

watch(() => props.account, loadAccountDetail, { immediate: true })

const statusMeta = computed(() => getNetdiskStatusMeta(t, props.account.status))
const quotaPercent = computed(() => getNetdiskQuotaPercent(props.account.quota_used, props.account.quota_total))
const quotaColor = computed(() => {
  if (quotaPercent.value >= 95) return 'error'
  if (quotaPercent.value >= 80) return 'warning'
  return 'primary'
})
const lastCheckedAtText = computed(() =>
  props.account.last_checked_at ? formatNetdiskDateTime(props.account.last_checked_at) : t('netdisk.never'),
)
const credentialText = computed(() => {
  const credential = accountDetail.value?.credential
  return credential?.cookie || credential?.token || ''
})

async function copyCredential() {
  if (!credentialText.value) return
  try {
    await navigator.clipboard.writeText(credentialText.value)
    $toast.success(t('netdisk.detail.copySuccess'))
  } catch {
    $toast.error(t('netdisk.detail.copyFailed'))
  }
}

/** 清空回收站（不可恢复）；success 为真时仍需检查 cleared 才能确认已清空。 */
async function clearRecycleBin() {
  if (clearingRecycleBin.value) return

  const isConfirmed = await createConfirm({
    type: 'warn',
    title: t('netdisk.actions.clearRecycleBin'),
    content: t('netdisk.clearRecycleBinConfirm'),
    confirmText: t('netdisk.actions.clearRecycleBin'),
  })
  if (!isConfirmed) return

  clearingRecycleBin.value = true
  try {
    const result = await clearNetdiskRecycleBin(props.account.id)
    if (result?.data?.cleared) {
      $toast.success(t('netdisk.clearRecycleBinSuccess'))
    } else {
      $toast.error(t('netdisk.clearRecycleBinIncomplete'))
    }
  } catch (error) {
    $toast.error(getApiBusinessErrorMessage(error) ?? t('netdisk.clearRecycleBinFailed'))
  } finally {
    clearingRecycleBin.value = false
  }
}
</script>

<template>
  <div class="netdisk-account-detail">
    <div class="d-flex flex-wrap align-center justify-space-between gap-2 mb-4">
      <div class="d-flex flex-wrap align-center gap-2">
        <VChip size="small" variant="tonal" color="primary" :prepend-icon="getNetdiskPlatformIcon(account.platform)">
          {{ getNetdiskPlatformName(t, account.platform) }}
        </VChip>
        <VChip size="small" variant="tonal" :color="statusMeta.color" :prepend-icon="statusMeta.icon">
          {{ statusMeta.text }}
        </VChip>
        <VChip v-if="account.is_primary" size="small" variant="tonal" color="warning" prepend-icon="mdi-star">
          {{ t('netdisk.primary') }}
        </VChip>
      </div>
      <div class="d-flex flex-wrap align-center gap-2">
        <VBtn variant="tonal" size="small" prepend-icon="mdi-wifi-check" :loading="probing" @click="probeAccount">
          {{ t('netdisk.actions.probe') }}
        </VBtn>
        <VBtn
          v-if="platformInfo?.recycle_bin"
          color="error"
          variant="tonal"
          size="small"
          prepend-icon="mdi-delete-sweep-outline"
          :loading="clearingRecycleBin"
          @click="clearRecycleBin"
        >
          {{ t('netdisk.actions.clearRecycleBin') }}
        </VBtn>
        <VBtn
          v-if="platformInfo?.supports_refresh"
          variant="tonal"
          size="small"
          prepend-icon="mdi-refresh"
          :loading="refreshing"
          @click="refreshAccount"
        >
          {{ t('netdisk.actions.refresh') }}
        </VBtn>
        <VBtn
          variant="tonal"
          size="small"
          prepend-icon="mdi-star-outline"
          :disabled="account.is_primary"
          :loading="settingPrimary"
          @click="setPrimary"
        >
          {{ t('netdisk.actions.setPrimary') }}
        </VBtn>
        <VBtn color="primary" variant="tonal" size="small" prepend-icon="mdi-file-edit-outline" @click="emit('edit')">
          {{ t('netdisk.actions.edit') }}
        </VBtn>
        <VBtn color="error" variant="tonal" size="small" prepend-icon="mdi-delete-outline" @click="deleteAccount">
          {{ t('netdisk.actions.delete') }}
        </VBtn>
      </div>
    </div>

    <VAlert v-if="account.status === 'expired'" variant="tonal" color="error" density="compact" class="mb-4">
      {{ t('netdisk.detail.expiredHint') }}
    </VAlert>

    <div class="netdisk-account-detail__summary mb-5">
      <section class="netdisk-account-detail__info">
        <div class="text-subtitle-1 font-weight-medium mb-3">{{ t('netdisk.detail.info') }}</div>
        <dl class="netdisk-account-detail__dl">
          <div class="netdisk-account-detail__row">
            <div class="netdisk-account-detail__field">
              <dt>{{ t('netdisk.detail.nickname') }}</dt>
              <dd>{{ account.nickname || t('netdisk.detail.none') }}</dd>
            </div>
            <div class="netdisk-account-detail__field">
              <dt>{{ t('netdisk.lastCheckedAt') }}</dt>
              <dd>{{ lastCheckedAtText }}</dd>
            </div>
          </div>
          <div class="netdisk-account-detail__row netdisk-account-detail__row--full">
            <div class="netdisk-account-detail__field">
              <dt>{{ t('netdisk.detail.credentials') }}</dt>
              <dd>
                <VTextField
                  v-if="credentialText"
                  :model-value="credentialText"
                  readonly
                  density="compact"
                  variant="outlined"
                  hide-details
                  class="netdisk-account-detail__credential-input"
                >
                  <template #append-inner>
                    <VBtn
                      size="small"
                      variant="text"
                      icon="mdi-content-copy"
                      :aria-label="t('netdisk.detail.copyCredential')"
                      @click="copyCredential"
                    />
                  </template>
                </VTextField>
                <VProgressCircular v-else-if="credentialLoading" indeterminate size="20" width="2" />
                <span v-else class="text-medium-emphasis">{{ t('netdisk.detail.none') }}</span>
              </dd>
            </div>
          </div>
        </dl>
      </section>

      <section class="netdisk-account-detail__storage">
        <div class="text-subtitle-1 font-weight-medium mb-3">{{ t('netdisk.detail.storage') }}</div>
        <template v-if="account.quota_total > 0">
          <VProgressLinear :model-value="quotaPercent" :color="quotaColor" height="10" rounded class="mb-3" />
          <div class="text-body-2">
            {{
              t('netdisk.detail.quotaUsage', {
                used: formatFileSize(account.quota_used),
                total: formatFileSize(account.quota_total),
                percent: quotaPercent,
              })
            }}
          </div>
          <div class="text-caption text-medium-emphasis mt-1">
            {{ t('netdisk.detail.quotaFree', { free: formatFileSize(Math.max(0, account.quota_total - account.quota_used)) }) }}
          </div>
        </template>
        <div v-else class="text-body-2 text-medium-emphasis">{{ t('netdisk.detail.storageUnknown') }}</div>
      </section>
    </div>

    <NetdiskAccountFiles :account-id="account.id" />
  </div>
</template>

<style lang="scss" scoped>
.netdisk-account-detail__summary {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(0, 3fr);
  gap: 24px;
}

.netdisk-account-detail__info,
.netdisk-account-detail__storage {
  min-inline-size: 0;
}

.netdisk-account-detail__dl {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  font-size: 0.875rem;

  dt {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    white-space: nowrap;
  }

  dd {
    min-inline-size: 0;
    margin: 0;
    overflow-wrap: anywhere;
  }
}

.netdisk-account-detail__row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.netdisk-account-detail__row--full {
  grid-template-columns: minmax(0, 1fr);
}

.netdisk-account-detail__field {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 10px 16px;
  align-items: start;
  min-inline-size: 0;
}

.netdisk-account-detail__credential-input {
  max-inline-size: 100%;

  :deep(input) {
    font-family: 'Roboto Mono', monospace;
    white-space: nowrap;
    overflow-x: auto;
    text-overflow: clip;
  }
}

@media (max-width: 959px) {
  .netdisk-account-detail__summary {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
