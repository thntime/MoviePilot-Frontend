<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import type { DownloaderConf, Site } from '@/api/types'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import { numberValidator, requiredValidator } from '@/@validators'
import api from '@/api'
import { getApiBusinessErrorMessage } from '@/api/client'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

// 显示器宽度
const display = useDisplay()

// 输入参数
const props = defineProps({
  siteid: Number,
  oper: String,
})

// 注册事件
const emit = defineEmits(['save', 'remove', 'close'])

// 站点编辑表单数据（password 仅用于写入，读取接口不会返回）
type SiteForm = Site & { password?: string }

const siteForm = ref<SiteForm>({
  id: props.siteid ?? 0,
  url: '',
  rss: '',
  cookie: '',
  ua: '',
  pri: 0,
  is_active: true,
  limit_interval: 0,
  limit_seconds: 0,
  name: '',
  domain: '',
  downloader: '',
  kind: 'pt',
  auth_type: 'cookie',
  username: null,
  auth_refresh_interval: 300,
})

// 提示框
const $toast = useToast()

// 认证方式（cookie / api / auth）
const authType = ref<'cookie' | 'api' | 'auth'>('cookie')

// 是否为 CD 站点
const isCdSite = computed(() => siteForm.value.kind === 'cd')

// 站点类型选项
const kindItems = computed(() => [
  { title: t('site.kindOptions.pt'), value: 'pt' },
  { title: t('site.kindOptions.cd'), value: 'cd' },
])

// 超时提示：CD 站点默认 90 秒
const timeoutHint = computed(() => (isCdSite.value ? t('site.hints.timeoutCd') : t('site.hints.timeout')))

// 是否限流
const isLimit = ref(false)

// 认证方式变化时同步到提交字段
watch(authType, value => {
  siteForm.value.auth_type = value
})

// 状态下拉项
const statusItems = [
  { title: t('site.status.enabled'), value: true },
  { title: t('site.status.disabled'), value: false },
]

// 生成1到50的优先级下拉框选项
const priorityItems = ref(
  Array.from({ length: 100 }, (_, i) => i + 1).map(item => ({
    title: item,
    value: item,
  })),
)

// 下载器选项
const downloaderOptions = ref<{ title: string; value: string }[]>([])

async function loadDownloaderSetting() {
  try {
    const downloaders: DownloaderConf[] = await api.get('download/clients')
    downloaderOptions.value = [
      { title: t('common.default'), value: '' },
      ...downloaders.map((item: { name: any }) => ({
        title: item.name,
        value: item.name,
      })),
    ]
  } catch (error) {
    console.error(t('site.errors.loadDownloader'), error)
  }
}

// 查询站点信息
async function fetchSiteInfo() {
  try {
    siteForm.value = await api.get(`site/${props.siteid}`)
    siteForm.value.proxy = siteForm.value.proxy === 1
    siteForm.value.render = siteForm.value.render === 1
    siteForm.value.kind = siteForm.value.kind === 'cd' ? 'cd' : 'pt'
    // 兼容旧数据：无认证方式时按已有凭据推断
    const hasApiCredential = !!(siteForm.value.apikey || siteForm.value.token)
    if (siteForm.value.kind === 'cd') {
      authType.value = 'auth'
    } else if (siteForm.value.auth_type === 'api') {
      authType.value = 'api'
    } else if (!siteForm.value.auth_type && hasApiCredential) {
      authType.value = 'api'
    } else if (hasApiCredential && !siteForm.value.cookie) {
      authType.value = 'api'
    } else {
      authType.value = 'cookie'
    }
    siteForm.value.auth_type = authType.value
    if (!siteForm.value.auth_refresh_interval) siteForm.value.auth_refresh_interval = 300
    // 密码不会回显，留空表示不修改
    siteForm.value.password = ''
  } catch (error) {
    console.error(error)
  }
}

// 切换站点类型时重置不兼容字段，避免提交残留值
function handleKindChange(value: 'pt' | 'cd') {
  siteForm.value.kind = value
  if (value === 'cd') {
    authType.value = 'auth'
    siteForm.value.rss = ''
    siteForm.value.cookie = ''
    siteForm.value.ua = ''
    siteForm.value.token = ''
    siteForm.value.apikey = ''
    siteForm.value.render = false
    siteForm.value.downloader = ''
    isLimit.value = false
    siteForm.value.limit_interval = 0
    siteForm.value.limit_count = 0
    siteForm.value.limit_seconds = 0
    if (!siteForm.value.auth_refresh_interval) siteForm.value.auth_refresh_interval = 300
  } else {
    if (authType.value === 'auth') authType.value = 'cookie'
    siteForm.value.username = null
    siteForm.value.password = ''
  }
  siteForm.value.auth_type = authType.value
}

// 生成提交数据：密码仅在填写时携带，CD 站点固定 AUTH 认证
function buildSitePayload(): SiteForm {
  const payload: SiteForm = { ...siteForm.value }
  const isCd = payload.kind === 'cd'
  payload.kind = isCd ? 'cd' : 'pt'
  payload.auth_type = isCd ? 'auth' : authType.value === 'api' ? 'api' : 'cookie'
  payload.auth_refresh_interval = isCd ? Number(payload.auth_refresh_interval) || 300 : 300
  payload.username = isCd ? payload.username?.trim() || null : null
  if (isCd) {
    // CD 站点不使用 PT 专属字段
    payload.rss = ''
    payload.cookie = ''
    payload.ua = ''
    payload.token = ''
    payload.apikey = ''
    payload.render = false
    payload.downloader = ''
    payload.limit_interval = 0
    payload.limit_count = 0
    payload.limit_seconds = 0
  }
  if (!isCd || !payload.password) delete payload.password
  return payload
}

// 调用API 新增站点
async function addSite() {
  if (!siteForm.value?.url) return
  if (isCdSite.value && (!siteForm.value.name?.trim() || !siteForm.value.username?.trim() || !siteForm.value.password?.trim())) {
    $toast.warning(t('site.messages.cdFieldsRequired'))
    return
  }
  startNProgress()
  try {
    await api.post('site/', buildSitePayload(), { feedback: 'silent' })
    $toast.success(t('site.messages.addSuccess'))
    emit('save')
  } catch (error) {
    const message = getApiBusinessErrorMessage(error)
    $toast.error(message ? `${t('site.messages.addFailed')}：${message}` : t('site.messages.addFailed'))
    console.error(error)
  }
  doneNProgress()
}

// 调用API更新站点信息
async function updateSiteInfo() {
  if (isCdSite.value && (!siteForm.value.name?.trim() || !siteForm.value.username?.trim())) {
    $toast.warning(t('site.messages.cdFieldsRequired'))
    return
  }
  startNProgress()
  try {
    const payload = buildSitePayload()
    if (!isCdSite.value && isLimit.value) {
      payload.limit_interval = payload.limit_interval || 0
      payload.limit_count = payload.limit_count || 0
      payload.limit_seconds = payload.limit_seconds || 0
    } else {
      payload.limit_interval = 0
      payload.limit_count = 0
      payload.limit_seconds = 0
    }
    await api.put('site/', payload, { feedback: 'silent' })
    $toast.success(`${siteForm.value?.name} ${t('site.messages.updateSuccess')}`)
    emit('save')
  } catch (error) {
    const message = getApiBusinessErrorMessage(error)
    $toast.error(
      message
        ? `${siteForm.value?.name} ${t('site.messages.updateFailed')}：${message}`
        : `${siteForm.value?.name} ${t('site.messages.updateFailed')}！`,
    )
    console.error(error)
  }
  doneNProgress()
}

onMounted(async () => {
  if (props.oper !== 'add') {
    await fetchSiteInfo()
    if (siteForm.value.limit_interval || siteForm.value.limit_count || siteForm.value.limit_seconds)
      isLimit.value = true
  }
  await loadDownloaderSetting()
})
</script>

<template>
  <VDialog scrollable :close-on-back="false" eager max-width="45rem" :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VCardItem :class="props.oper === 'add' ? 'py-3' : 'py-2'">
        <template #prepend>
          <VIcon :icon="oper == 'add' ? 'mdi-web-plus' : 'mdi-web'" class="me-2" />
        </template>
        <VCardTitle>{{ `${props.oper === 'add' ? t('site.actions.add') : t('site.actions.edit')}` }}</VCardTitle>
        <VCardSubtitle>{{ siteForm.name }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn @click="emit('close')" />
      <VDivider />
      <VCardText>
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol cols="12" :md="isCdSite ? 3 : 4">
              <VSelect
                v-model="siteForm.kind"
                :items="kindItems"
                :label="t('site.fields.kind')"
                :hint="t('site.hints.kind')"
                persistent-hint
                prepend-inner-icon="mdi-shape-outline"
                @update:model-value="handleKindChange"
              />
            </VCol>
            <VCol v-if="isCdSite" cols="12" md="9">
              <VTextField
                v-model="siteForm.name"
                :label="t('site.fields.name')"
                :rules="[requiredValidator]"
                :hint="t('site.hints.name')"
                persistent-hint
                prepend-inner-icon="mdi-tag-outline"
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="12" md="6">
              <VTextField
                v-model="siteForm.url"
                :label="t('site.fields.url')"
                :rules="[requiredValidator]"
                :hint="t('site.hints.url')"
                persistent-hint
                prepend-inner-icon="mdi-web"
              />
            </VCol>
            <VCol cols="6" md="3">
              <VAutocomplete
                v-model="siteForm.pri"
                :label="t('site.fields.priority')"
                :items="priorityItems"
                :rules="[requiredValidator]"
                :hint="t('site.hints.priority')"
                persistent-hint
                prepend-inner-icon="mdi-priority-high"
              />
            </VCol>
            <VCol cols="6" md="3">
              <VSelect
                v-model="siteForm.is_active"
                :items="statusItems"
                :label="t('site.fields.status')"
                :hint="t('site.hints.status')"
                persistent-hint
                prepend-inner-icon="mdi-toggle-switch"
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol v-if="!isCdSite" cols="12" md="6">
              <VTextField
                v-model="siteForm.rss"
                :label="t('site.fields.rss')"
                :hint="t('site.hints.rss')"
                persistent-hint
                prepend-inner-icon="mdi-rss"
              />
            </VCol>
            <VCol cols="6" :md="isCdSite ? 6 : 3">
              <VTextField
                v-model="siteForm.timeout"
                :label="t('site.fields.timeout')"
                :hint="timeoutHint"
                :placeholder="isCdSite ? '90' : undefined"
                persistent-hint
                prepend-inner-icon="mdi-timer"
              />
            </VCol>
            <VCol v-if="!isCdSite" cols="6" md="3">
              <VAutocomplete
                v-model="siteForm.downloader"
                :label="t('site.fields.downloader')"
                :items="downloaderOptions"
                :hint="t('site.hints.downloader')"
                persistent-hint
                prepend-inner-icon="mdi-download"
              />
            </VCol>
          </VRow>
          <div class="mt-3 mb-2 text-subtitle-2">{{ t('site.fields.authType') }}</div>
          <VTabs v-model="authType" show-arrows class="v-tabs-pill">
            <VTab value="cookie" :disabled="isCdSite" selected-class="v-tab--selected">
              <div>
                <VIcon size="20" start icon="mdi-cookie" />
                {{ t('site.authOptions.cookie') }}
              </div>
            </VTab>
            <VTab value="api" :disabled="isCdSite" selected-class="v-tab--selected">
              <div>
                <VIcon size="20" start icon="mdi-api" />
                {{ t('site.authOptions.api') }}
              </div>
            </VTab>
            <VTab value="auth" :disabled="!isCdSite" selected-class="v-tab--selected">
              <div>
                <VIcon size="20" start icon="mdi-shield-account" />
                {{ t('site.authOptions.auth') }}
              </div>
            </VTab>
          </VTabs>
          <VWindow v-model="authType" class="my-3 disable-tab-transition" :touch="false">
            <VWindowItem value="cookie">
              <VRow>
                <VCol cols="12">
                  <VTextarea
                    v-model="siteForm.cookie"
                    :label="t('site.fields.cookie')"
                    :hint="t('site.hints.cookie')"
                    persistent-hint
                    prepend-inner-icon="mdi-cookie"
                  />
                </VCol>
                <VCol cols="12">
                  <VTextField
                    v-model="siteForm.ua"
                    :label="t('site.fields.userAgent')"
                    :hint="t('site.hints.userAgent')"
                    persistent-hint
                    prepend-inner-icon="mdi-web-box"
                  />
                </VCol>
              </VRow>
            </VWindowItem>
            <VWindowItem value="api">
              <VRow>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="siteForm.token"
                    :label="t('site.fields.authorization')"
                    :hint="t('site.hints.authorization')"
                    persistent-hint
                    prepend-inner-icon="mdi-key"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="siteForm.apikey"
                    :label="t('site.fields.apiKey')"
                    :hint="t('site.hints.apiKey')"
                    persistent-hint
                    prepend-inner-icon="mdi-api"
                  />
                </VCol>
              </VRow>
            </VWindowItem>
            <VWindowItem value="auth">
              <VRow>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="siteForm.username"
                    :label="t('site.fields.username')"
                    :rules="[requiredValidator]"
                    :hint="t('site.hints.username')"
                    persistent-hint
                    prepend-inner-icon="mdi-account"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="siteForm.password"
                    type="password"
                    autocomplete="new-password"
                    :label="t('site.fields.password')"
                    :hint="t('site.hints.password')"
                    persistent-hint
                    prepend-inner-icon="mdi-lock"
                  />
                </VCol>
              </VRow>
              <VRow>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="siteForm.auth_refresh_interval"
                    type="number"
                    :label="t('site.fields.authRefreshInterval')"
                    :hint="t('site.hints.authRefreshInterval')"
                    persistent-hint
                    prepend-inner-icon="mdi-refresh"
                  />
                </VCol>
              </VRow>
            </VWindowItem>
          </VWindow>
          <VRow v-if="!isCdSite">
            <VCol cols="12" md="4">
              <VSwitch v-model="isLimit" :label="t('site.fields.limitAccess')" />
            </VCol>
          </VRow>
          <VRow v-if="isLimit && !isCdSite">
            <VCol cols="12" md="4">
              <VTextField
                v-model="siteForm.limit_interval"
                :label="t('site.fields.limitInterval')"
                :rules="[numberValidator]"
                :hint="t('site.hints.limitInterval')"
                persistent-hint
                prepend-inner-icon="mdi-clock-outline"
              />
            </VCol>
            <VCol cols="12" md="4">
              <VTextField
                v-model="siteForm.limit_count"
                :label="t('site.fields.limitCount')"
                :rules="[numberValidator]"
                :hint="t('site.hints.limitCount')"
                persistent-hint
                prepend-inner-icon="mdi-counter"
              />
            </VCol>
            <VCol cols="12" md="4">
              <VTextField
                v-model="siteForm.limit_seconds"
                :label="t('site.fields.limitSeconds')"
                :rules="[numberValidator]"
                :hint="t('site.hints.limitSeconds')"
                persistent-hint
                prepend-inner-icon="mdi-timer-sand"
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="12" :md="isCdSite ? 12 : 6">
              <VSwitch
                v-model="siteForm.proxy"
                :label="t('site.fields.useProxy')"
                :hint="t('site.hints.useProxy')"
                persistent-hint
              />
            </VCol>
            <VCol v-if="!isCdSite" cols="12" md="6">
              <VSwitch
                v-model="siteForm.render"
                :label="t('site.fields.browserSimulation')"
                :hint="t('site.hints.browserSimulation')"
                persistent-hint
              />
            </VCol>
          </VRow>
        </VForm>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn
          v-if="props.oper === 'add'"
          color="primary"
          variant="flat"
          @click="addSite"
          prepend-icon="mdi-plus"
          class="px-5"
        >
          {{ t('site.actions.add') }}
        </VBtn>
        <VBtn
          v-else
          color="primary"
          variant="flat"
          @click="updateSiteInfo"
          prepend-icon="mdi-content-save"
          class="px-5"
        >
          {{ t('common.save') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
