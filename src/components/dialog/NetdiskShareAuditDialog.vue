<template>
  <VDialog :model-value="modelValue" max-width="760" scrollable @update:model-value="emit('update:modelValue', $event)">
    <VCard>
      <VCardTitle class="d-flex align-center">
        <VIcon class="mr-2" icon="mdi-stethoscope" />
        {{ t('netdiskAudit.title') }}
        <VSpacer />
        <VBtn icon="mdi-close" variant="text" @click="close" />
      </VCardTitle>
      <VCardSubtitle>{{ t('netdiskAudit.subtitle') }}</VCardSubtitle>
      <VCardText>
        <VTextField
          v-model="url"
          data-testid="netdisk-audit-url"
          :label="t('netdiskAudit.url')"
          :placeholder="t('netdiskAudit.urlPlaceholder')"
          variant="underlined"
          density="comfortable"
          prepend-inner-icon="mdi-link"
          clearable
        />
        <VTextField
          v-model="password"
          data-testid="netdisk-audit-password"
          :label="t('netdiskAudit.password')"
          variant="underlined"
          density="comfortable"
          prepend-inner-icon="mdi-key-outline"
          class="mt-2"
        />
        <div class="d-flex align-center mt-3">
          <VBtn
            data-testid="netdisk-audit-run"
            color="primary"
            :loading="loading"
            :disabled="!url.trim()"
            prepend-icon="mdi-stethoscope"
            @click="runAudit"
          >
            {{ t('netdiskAudit.run') }}
          </VBtn>
          <VSpacer />
          <VBtn variant="text" @click="reset">{{ t('netdiskAudit.reset') }}</VBtn>
        </div>

        <VAlert
          v-if="error"
          data-testid="netdisk-audit-error"
          class="mt-3"
          density="compact"
          type="error"
          variant="tonal"
        >
          {{ error }}
        </VAlert>
        <VAlert v-if="report && !report.media.length" class="mt-3" density="compact" type="warning" variant="tonal">
          {{ t('netdiskAudit.empty') }}
        </VAlert>

        <VCard v-for="(media, index) in report?.media ?? []" :key="index" class="mt-3" variant="outlined">
          <VCardText>
            <div class="text-subtitle-1">
              {{ media.title || t('netdiskAudit.unrecognized') }}
              <span v-if="media.year" class="text-medium-emphasis">（{{ media.year }}）</span>
            </div>
            <div class="text-caption text-medium-emphasis">
              {{ media.type || t('netdiskAudit.unknownType') }} ·
              {{ t('netdiskAudit.fileCount', { count: media.files }) }} ·
              {{ formatNetdiskFreeSpace(media.total_bytes) }}
            </div>

            <template v-if="media.recognized && media.type === '电影'">
              <div class="mt-2">
                {{ media.library_state === 'present' ? t('netdiskAudit.moviePresent') : t('netdiskAudit.unconfirmed') }}
              </div>
            </template>
            <template v-else-if="media.recognized">
              <div class="mt-2">{{ t('netdiskAudit.existing', { count: media.existing_episodes.length }) }}</div>
              <div v-if="media.season_gaps.length" class="mt-1">
                <div v-for="gap in media.season_gaps" :key="gap.season" class="d-flex align-center flex-wrap ga-2 mt-1">
                  <span>
                    {{
                      t('netdiskAudit.seasonGap', {
                        season: gap.season,
                        episodes: formatEpisodeRanges(gap.missing_episodes),
                      })
                    }}
                  </span>
                  <VBtn
                    size="x-small"
                    variant="tonal"
                    prepend-icon="mdi-content-copy"
                    @click="copyEpisodes(gap.missing_episodes)"
                  >
                    {{ t('netdiskAudit.copy') }}
                  </VBtn>
                </div>
              </div>
              <div v-else-if="media.library_evidence === 'none'" class="mt-1">
                {{ t('netdiskAudit.unconfirmed') }}
              </div>
              <div v-else class="mt-1">{{ t('netdiskAudit.complete') }}</div>
            </template>
            <div v-else class="mt-2">{{ t('netdiskAudit.unrecognized') }}</div>

            <div v-if="media.truncated" class="mt-1 text-caption text-warning">
              {{ t('netdiskAudit.truncated') }}
            </div>
          </VCardText>
        </VCard>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'
import { auditNetdiskShare } from '@/api/netdiskFiles'
import type { NetdiskShareAuditReport } from '@/api/netdiskFiles'
import { formatEpisodeRanges, formatNetdiskFreeSpace } from '@/utils/netdisk'

defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

// 分享体检的文案挂在组件局部字典里，避免改动全局 locale 文件。
const { t } = useI18n({
  messages: {
    'zh-CN': {
      netdiskAudit: {
        title: '分享体检',
        subtitle: '粘贴网盘分享链接，只读识别媒体并与媒体库比对缺口，不转存也不下载。',
        url: '分享链接',
        urlPlaceholder: '支持整段分享文案，提取码会自动识别',
        password: '提取码（可选）',
        run: '开始体检',
        reset: '清空',
        failed: '体检失败，请稍后重试',
        empty: '分享内没有可识别的视频文件',
        unrecognized: '未识别到媒体信息',
        unknownType: '类型未知',
        fileCount: '{count} 个文件',
        existing: '媒体库已有 {count} 集',
        seasonGap: '第 {season} 季缺 {episodes}',
        copy: '复制',
        copied: '已复制集号，可直接粘贴到集数框',
        copyFailed: '复制失败，请手动选中文本',
        unconfirmed: '媒体库证据不足，暂不判断缺集',
        complete: '媒体库已齐',
        moviePresent: '媒体库已有该片',
        truncated: '文件数超过上限，本次只体检了前一部分',
      },
    },
    'zh-TW': {
      netdiskAudit: {
        title: '分享體檢',
        subtitle: '貼上網盤分享連結，只讀辨識媒體並與媒體庫比對缺口，不轉存也不下載。',
        url: '分享連結',
        urlPlaceholder: '支援整段分享文案，提取碼會自動辨識',
        password: '提取碼（選填）',
        run: '開始體檢',
        reset: '清空',
        failed: '體檢失敗，請稍後重試',
        empty: '分享內沒有可辨識的影片檔案',
        unrecognized: '未辨識到媒體資訊',
        unknownType: '類型未知',
        fileCount: '{count} 個檔案',
        existing: '媒體庫已有 {count} 集',
        seasonGap: '第 {season} 季缺 {episodes}',
        copy: '複製',
        copied: '已複製集號，可直接貼到集數框',
        copyFailed: '複製失敗，請手動選取文字',
        unconfirmed: '媒體庫證據不足，暫不判斷缺集',
        complete: '媒體庫已齊',
        moviePresent: '媒體庫已有該片',
        truncated: '檔案數超過上限，本次只體檢了前一部分',
      },
    },
    'en-US': {
      netdiskAudit: {
        title: 'Share audit',
        subtitle: 'Paste a netdisk share link to identify the media and compare gaps against the library. Read-only.',
        url: 'Share link',
        urlPlaceholder: 'A whole share message works; the extraction code is detected automatically',
        password: 'Extraction code (optional)',
        run: 'Audit',
        reset: 'Clear',
        failed: 'Audit failed. Try again later',
        empty: 'No recognizable video files in this share',
        unrecognized: 'Media not recognized',
        unknownType: 'Unknown type',
        fileCount: '{count} files',
        existing: '{count} episodes in library',
        seasonGap: 'Season {season} missing {episodes}',
        copy: 'Copy',
        copied: 'Episodes copied; paste them into the episode field',
        copyFailed: 'Copy failed; select the text manually',
        unconfirmed: 'Library evidence unavailable; missing episodes not judged',
        complete: 'Library is complete',
        moviePresent: 'Movie already in library',
        truncated: 'File limit reached; only part of the share was audited',
      },
    },
  },
})

const $toast = useToast()

const url = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')
const report = ref<NetdiskShareAuditReport | null>(null)

function close() {
  emit('update:modelValue', false)
}

function reset() {
  url.value = ''
  password.value = ''
  error.value = ''
  report.value = null
}

async function runAudit() {
  const target = url.value.trim()
  if (!target || loading.value) return

  loading.value = true
  error.value = ''
  report.value = null
  try {
    report.value = await auditNetdiskShare({
      url: target,
      password: password.value.trim(),
    })
  } catch {
    error.value = t('netdiskAudit.failed')
  } finally {
    loading.value = false
  }
}

async function copyEpisodes(episodes: number[]) {
  const text = formatEpisodeRanges(episodes)
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    $toast.success(t('netdiskAudit.copied'))
  } catch {
    $toast.error(t('netdiskAudit.copyFailed'))
  }
}
</script>
