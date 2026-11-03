<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'
import { fetchNetdiskFileList, type NetdiskFileItem } from '@/api/netdiskFiles'
import NetdiskBreadcrumb from './NetdiskBreadcrumb.vue'
import type { NetdiskBreadcrumbItem } from './types'

const props = defineProps<{
  modelValue: boolean
  accountId: number
  moving: NetdiskFileItem[]
  loading: boolean
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'submit', targetId: string): void
}>()

const { t } = useI18n()
const $toast = useToast()

const dialogVisible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const breadcrumb = ref<NetdiskBreadcrumbItem[]>([{ id: '', name: '' }])
const dirs = ref<NetdiskFileItem[]>([])
const listLoading = ref(false)

const currentId = computed(() => breadcrumb.value[breadcrumb.value.length - 1]?.id ?? '')

const movingIds = computed(() => new Set(props.moving.map(item => item.file_id)))

async function loadDirs() {
  listLoading.value = true
  try {
    const files = await fetchNetdiskFileList(props.accountId, currentId.value || undefined)
    // 不能移动到自身或正在移动的目录内的一层（简化限制：只排除被移动目录本身）
    dirs.value = files.filter(item => item.is_dir && !movingIds.value.has(item.file_id))
  } catch (error) {
    $toast.error(t('netdisk.browser.move.loadFailed'))
    console.error(error)
  } finally {
    listLoading.value = false
  }
}

function enterDir(dir: NetdiskFileItem) {
  breadcrumb.value = [...breadcrumb.value, { id: dir.file_id, name: dir.name }]
}

function navigate(index: number) {
  breadcrumb.value = breadcrumb.value.slice(0, index + 1)
}

watch(breadcrumb, () => {
  if (dialogVisible.value) loadDirs()
})

watch(
  () => props.modelValue,
  value => {
    if (value) {
      breadcrumb.value = [{ id: '', name: '' }]
      loadDirs()
    }
  },
)
</script>

<template>
  <VDialog v-model="dialogVisible" max-width="560" persistent>
    <VCard>
      <VCardItem>
        <VCardTitle>{{ t('netdisk.browser.move.title') }}</VCardTitle>
        <VCardSubtitle>{{ t('netdisk.browser.move.subtitle', { count: props.moving.length }) }}</VCardSubtitle>
      </VCardItem>
      <VCardText>
        <NetdiskBreadcrumb :items="breadcrumb" @navigate="navigate" />
        <VDivider class="my-2" />
        <div style="min-block-size: 240px; max-block-size: 320px; overflow-y: auto">
          <VProgressLinear v-if="listLoading" indeterminate color="primary" class="mb-2" />
          <template v-if="dirs.length > 0">
            <VList density="compact">
              <VListItem
                v-for="dir in dirs"
                :key="dir.file_id"
                prepend-icon="mdi-folder-outline"
                :title="dir.name"
                append-icon="mdi-chevron-right"
                @click="enterDir(dir)"
              />
            </VList>
          </template>
          <div v-else-if="!listLoading" class="text-center text-medium-emphasis py-8">
            {{ t('netdisk.browser.move.empty') }}
          </div>
        </div>
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn variant="text" @click="dialogVisible = false">{{ t('common.cancel') }}</VBtn>
        <VBtn color="primary" :loading="props.loading" @click="emit('submit', currentId)">
          {{ t('netdisk.browser.move.confirmHere') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
