<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'
import type { NetdiskFileItem, NetdiskShareResult } from '@/api/netdiskFiles'

const props = defineProps<{
  modelValue: boolean
  files: NetdiskFileItem[]
  loading: boolean
  result: NetdiskShareResult | null
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'submit', password: string, expiresIn: number): void
}>()

const { t } = useI18n()
const $toast = useToast()

const password = ref('')
const expiresIn = ref(0)

const dialogVisible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const expiresOptions = computed(() => [
  { title: t('netdisk.browser.share.expires.forever'), value: 0 },
  { title: t('netdisk.browser.share.expires.oneDay'), value: 1 },
  { title: t('netdisk.browser.share.expires.sevenDays'), value: 7 },
  { title: t('netdisk.browser.share.expires.thirtyDays'), value: 30 },
])

const shareText = computed(() => {
  if (!props.result) return ''
  return props.result.password
    ? t('netdisk.browser.share.copyText', { url: props.result.url, password: props.result.password })
    : props.result.url
})

watch(
  () => props.modelValue,
  value => {
    if (value) {
      password.value = ''
      expiresIn.value = 0
    }
  },
)

async function copyShare() {
  try {
    await navigator.clipboard.writeText(shareText.value)
    $toast.success(t('netdisk.browser.share.copied'))
  } catch {
    $toast.error(t('netdisk.browser.share.copyFailed'))
  }
}

function submit() {
  emit('submit', password.value.trim(), expiresIn.value)
}
</script>

<template>
  <VDialog v-model="dialogVisible" max-width="520" persistent>
    <VCard>
      <VCardItem>
        <VCardTitle>{{ t('netdisk.browser.share.title') }}</VCardTitle>
        <VCardSubtitle>{{ t('netdisk.browser.share.subtitle', { count: props.files.length }) }}</VCardSubtitle>
      </VCardItem>
      <VCardText>
        <template v-if="!props.result">
          <VTextField
            v-model="password"
            :label="t('netdisk.browser.share.password')"
            :hint="t('netdisk.browser.share.passwordHint')"
            persistent-hint
            maxlength="8"
            class="mb-2"
          />
          <VSelect
            v-model="expiresIn"
            :items="expiresOptions"
            :label="t('netdisk.browser.share.expiresIn')"
          />
        </template>
        <template v-else>
          <VTextField
            :model-value="props.result.url"
            :label="t('netdisk.browser.share.url')"
            readonly
            class="mb-2"
          />
          <VTextField
            v-if="props.result.password"
            :model-value="props.result.password"
            :label="t('netdisk.browser.share.passwordLabel')"
            readonly
            class="mb-2"
          />
          <VAlert v-if="props.result.expires_at" type="info" variant="tonal" density="compact">
            {{ t('netdisk.browser.share.expireAt', { time: props.result.expires_at }) }}
          </VAlert>
        </template>
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn variant="text" @click="dialogVisible = false">{{ t('common.close') }}</VBtn>
        <VBtn v-if="!props.result" color="primary" :loading="props.loading" @click="submit">
          {{ t('netdisk.browser.share.create') }}
        </VBtn>
        <VBtn v-else color="primary" prepend-icon="mdi-content-copy" @click="copyShare">
          {{ t('netdisk.browser.share.copy') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
