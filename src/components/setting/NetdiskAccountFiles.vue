<script lang="ts" setup>
import { useDisplay } from 'vuetify'
import NetdiskBreadcrumb from '@/components/netdisk/NetdiskBreadcrumb.vue'
import NetdiskFileRow from '@/components/netdisk/NetdiskFileRow.vue'
import NetdiskMoveDialog from '@/components/netdisk/NetdiskMoveDialog.vue'
import NetdiskRenameDialog from '@/components/netdisk/NetdiskRenameDialog.vue'
import NetdiskShareDialog from '@/components/netdisk/NetdiskShareDialog.vue'
import NoDataFound from '@/components/states/NoDataFound.vue'
import { useNetdiskFileBrowser } from '@/composables/useNetdiskFileBrowser'

const { t } = useI18n()
const display = useDisplay()
const props = defineProps<{ accountId: number }>()
const browser = useNetdiskFileBrowser(toRef(props, 'accountId'))
</script>

<template>
  <section class="netdisk-account-files">
    <div class="d-flex align-center gap-2 mb-2">
      <div class="text-subtitle-1 font-weight-medium">{{ t('netdisk.browser.title') }}</div>
      <VSpacer />
      <VBtn icon="mdi-refresh" variant="text" size="small" :loading="browser.loading.value" @click="browser.refreshAll" />
    </div>

    <NoDataFound
      v-if="browser.unauthorized.value"
      error-code="403"
      :error-title="t('netdisk.browser.unauthorized')"
      :error-description="t('netdisk.browser.unauthorizedHint')"
    />
    <NoDataFound
      v-else-if="browser.capabilitiesLoaded.value && browser.capabilities.value.browse === false"
      error-code="403"
      :error-title="t('netdisk.browser.unsupported')"
      :error-description="t('netdisk.browser.unsupportedHint')"
    />
    <template v-else>
      <div class="d-flex align-center flex-wrap gap-2 mb-2">
        <VBtn
          icon="mdi-arrow-up"
          variant="text"
          size="small"
          :disabled="browser.breadcrumb.value.length <= 1"
          :aria-label="t('netdisk.browser.parent')"
          @click="browser.goParent"
        />
        <NetdiskBreadcrumb :items="browser.breadcrumb.value" @navigate="browser.navigateBreadcrumb" />
        <VSpacer />
        <template v-if="browser.selectionMode.value">
          <VBtn
            v-if="browser.capabilities.value.share !== false"
            size="small"
            variant="tonal"
            prepend-icon="mdi-share-variant-outline"
            @click="browser.shareSelected"
          >
            {{ t('netdisk.browser.actions.share') }}
          </VBtn>
          <VBtn
            v-if="browser.capabilities.value.move !== false"
            size="small"
            variant="tonal"
            prepend-icon="mdi-folder-move-outline"
            @click="browser.moveSelected"
          >
            {{ t('netdisk.browser.actions.move') }}
          </VBtn>
          <VBtn
            v-if="browser.capabilities.value.delete !== false"
            size="small"
            variant="tonal"
            color="error"
            prepend-icon="mdi-delete-outline"
            @click="browser.confirmDelete([...browser.selected.value])"
          >
            {{ t('netdisk.browser.actions.delete') }}
          </VBtn>
        </template>
      </div>

      <div v-if="display.mdAndUp.value" class="d-flex align-center gap-3 px-2 py-1 text-caption text-medium-emphasis">
        <VCheckboxBtn v-model="browser.allSelected.value" density="compact" />
        <div class="flex-grow-1">{{ t('netdisk.browser.columns.name') }}</div>
        <div class="netdisk-account-files__size">{{ t('netdisk.browser.columns.size') }}</div>
        <div class="netdisk-account-files__date">{{ t('netdisk.browser.columns.updatedAt') }}</div>
        <div class="netdisk-account-files__actions" />
      </div>
      <VDivider class="mb-1" />

      <LoadingBanner v-if="browser.loading.value" />
      <NoDataFound
        v-else-if="browser.loadError.value"
        :error-code="browser.loadErrorCode.value"
        :error-title="browser.loadError.value"
        :error-description="t('common.troubleshooting')"
      >
        <template #button>
          <VBtn color="primary" variant="tonal" @click="browser.loadFiles">{{ t('common.retry') }}</VBtn>
        </template>
      </NoDataFound>
      <NoDataFound
        v-else-if="browser.sortedFiles.value.length === 0"
        error-code="404"
        :error-title="t('netdisk.browser.empty')"
        :error-description="t('netdisk.browser.emptyHint')"
      />
      <div v-else>
        <NetdiskFileRow
          v-for="file in browser.sortedFiles.value"
          :key="file.file_id"
          :file="file"
          :selected="browser.isSelected(file)"
          :show-checkbox="browser.selectionMode.value || browser.isSelected(file) || display.mdAndUp.value"
          :capabilities="browser.capabilities.value"
          @toggle="browser.toggleSelect"
          @open="browser.openDir"
          @action="browser.onRowAction"
        />
      </div>
    </template>
  </section>

  <NetdiskShareDialog
    v-model="browser.shareDialogVisible.value"
    :files="browser.shareFiles.value"
    :loading="browser.shareLoading.value"
    :result="browser.shareResult.value"
    @submit="browser.onShareSubmit"
  />
  <NetdiskMoveDialog
    v-model="browser.moveDialogVisible.value"
    :account-id="accountId"
    :moving="browser.moveFiles.value"
    :loading="browser.moveLoading.value"
    @submit="browser.onMoveSubmit"
  />
  <NetdiskRenameDialog
    v-model="browser.renameDialogVisible.value"
    :file="browser.renameFile.value"
    :loading="browser.renameLoading.value"
    @submit="browser.onRenameSubmit"
  />
</template>

<style scoped>
.netdisk-account-files {
  padding-block-start: 20px;
  border-block-start: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.netdisk-account-files__size {
  inline-size: 7rem;
}

.netdisk-account-files__date {
  inline-size: 9rem;
}

.netdisk-account-files__actions {
  inline-size: 2.5rem;
}
</style>
