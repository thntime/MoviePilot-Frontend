<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import type { NetdiskFileItem } from '@/api/netdiskFiles'

const props = defineProps<{
  modelValue: boolean
  file: NetdiskFileItem | null
  loading: boolean
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'submit', name: string): void
}>()

const { t } = useI18n()

const name = ref('')

const dialogVisible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const valid = computed(() => {
  const trimmed = name.value.trim()
  return trimmed.length > 0 && trimmed !== props.file?.name
})

watch(
  () => props.modelValue,
  value => {
    if (value) name.value = props.file?.name ?? ''
  },
)

function submit() {
  if (valid.value) emit('submit', name.value.trim())
}
</script>

<template>
  <VDialog v-model="dialogVisible" max-width="480" persistent>
    <VCard>
      <VCardItem>
        <VCardTitle>{{ t('netdisk.browser.rename.title') }}</VCardTitle>
      </VCardItem>
      <VCardText>
        <VTextField
          v-model="name"
          :label="t('netdisk.browser.rename.name')"
          autofocus
          @keydown.enter="submit"
        />
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn variant="text" @click="dialogVisible = false">{{ t('common.cancel') }}</VBtn>
        <VBtn color="primary" :loading="props.loading" :disabled="!valid" @click="submit">
          {{ t('common.confirm') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
