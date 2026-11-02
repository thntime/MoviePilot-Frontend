<script lang="ts" setup>
import type { PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'
import { useDisplay } from 'vuetify'
import {
  cancelNetdiskQrLogin,
  createNetdiskCookieAccount,
  createNetdiskPasswordAccount,
  createNetdiskSmsAccount,
  importNetdiskCookieCloudAccount,
  pollNetdiskQrLogin,
  sendNetdiskSmsCode,
  startNetdiskQrLogin,
  updateNetdiskAccount,
  type NetdiskAccount,
  type NetdiskPlatformInfo,
  type NetdiskQrSession,
  type NetdiskQrStatus,
} from '@/api/netdisk'
import { getApiBusinessErrorMessage } from '@/api/client'
import { requiredValidator } from '@/@validators'
import { doneNProgress, startNProgress } from '@/api/nprogress'

// 国际化
const { t } = useI18n()

// 显示器宽度
const display = useDisplay()

// 提示框
const $toast = useToast()

// 输入参数
const props = defineProps({
  oper: {
    type: String as PropType<'add' | 'edit'>,
    default: 'add',
  },
  account: Object as PropType<NetdiskAccount>,
  platforms: {
    type: Array as PropType<NetdiskPlatformInfo[]>,
    default: () => [],
  },
  // 新增时预选的平台
  platform: String,
})

// 注册事件
const emit = defineEmits(['save', 'close'])

type LoginMethod = 'cookie' | 'cookiecloud' | 'password' | 'qr'

// 当前选择的平台与登录方式
const selectedPlatform = ref(props.account?.platform ?? props.platform ?? '')
const loginMethod = ref<LoginMethod>('cookie')

// 表单数据；凭据保存后不回显
const accountName = ref(props.account?.name ?? '')
const isPrimary = ref(props.account?.is_primary ?? false)
const cookieValue = ref('')
const username = ref('')
const password = ref('')
const showCookie = ref(false)
const showPassword = ref(false)
const smsMode = ref(false)
const smsPhone = ref('')
const smsCode = ref('')
const smsVerificationId = ref('')
const smsSending = ref(false)
const smsCountdown = ref(0)
let smsTimer: ReturnType<typeof setInterval> | undefined

// 提交状态
const submitting = ref(false)

// 平台选项
const platformItems = computed(() => props.platforms.map(item => ({ title: item.platform, value: item.platform })))

// 当前平台能力描述
const platformInfo = computed(() => props.platforms.find(item => item.platform === selectedPlatform.value))

// 扫码会话状态
const qrSession = ref<NetdiskQrSession | null>(null)
const qrStatus = ref<NetdiskQrStatus | ''>('')
const qrErrorMessage = ref('')
const qrRemainingSeconds = ref(0)
const qrStarting = ref(false)
let qrPollTimer: ReturnType<typeof setInterval> | undefined
let qrCountdownTimer: ReturnType<typeof setInterval> | undefined

const qrImageSrc = computed(() => (qrSession.value?.image ? `data:image/png;base64,${qrSession.value.image}` : ''))
const qrPageImageSrc = computed(() =>
  qrSession.value?.page_image ? `data:image/png;base64,${qrSession.value.page_image}` : ''
)
const showFullPage = ref(true)
const qrDisplaySrc = computed(() => (showFullPage.value && qrPageImageSrc.value ? qrPageImageSrc.value : qrImageSrc.value))

// 可用登录方式；账号密码仅在平台声明支持时展示
const loginMethods = computed<{ value: LoginMethod; title: string; icon: string }[]>(() => {
  const items: { value: LoginMethod; title: string; icon: string }[] = [
    { value: 'cookie', title: t('netdisk.methods.cookie'), icon: 'mdi-cookie' },
    { value: 'cookiecloud', title: t('netdisk.methods.cookiecloud'), icon: 'mdi-cloud-sync-outline' },
  ]
  if (platformInfo.value?.supports_password_login) {
    items.push({ value: 'password', title: t('netdisk.methods.password'), icon: 'mdi-account-key-outline' })
  }
  items.push({ value: 'qr', title: t('netdisk.methods.qr'), icon: 'mdi-qrcode' })
  return items
})

// 平台必填 Cookie 字段提示
const cookieRequiredKeysHint = computed(() => {
  const keys = platformInfo.value?.cookie_required_keys
  return keys && keys.length > 0 ? keys.join('、') : ''
})

// 切换平台时中断进行中的扫码会话，并回退到可用的登录方式
watch(selectedPlatform, () => {
  void teardownQrSession()
  if (loginMethod.value === 'password' && !platformInfo.value?.supports_password_login) {
    loginMethod.value = 'cookie'
  }
})

// 切换到其他登录方式时取消扫码
watch(loginMethod, value => {
  if (value !== 'qr') void teardownQrSession()
})

/** 停止扫码轮询并通知后端释放会话。 */
async function teardownQrSession() {
  if (qrPollTimer) clearInterval(qrPollTimer)
  if (qrCountdownTimer) clearInterval(qrCountdownTimer)
  if (smsTimer) clearInterval(smsTimer)
  qrPollTimer = undefined
  qrCountdownTimer = undefined
  const sessionId = qrSession.value?.session_id
  qrSession.value = null
  qrStatus.value = ''
  qrErrorMessage.value = ''
  if (sessionId) {
    try {
      await cancelNetdiskQrLogin(sessionId)
    } catch (error) {
      console.error(error)
    }
  }
}

/** 启动扫码登录并开始轮询。 */
async function startQrLogin() {
  if (!selectedPlatform.value || qrStarting.value) return
  qrStarting.value = true
  try {
    const session = await startNetdiskQrLogin({
      platform: selectedPlatform.value,
      name: accountName.value.trim() || undefined,
      is_primary: isPrimary.value || undefined,
    })
    qrSession.value = session
    showFullPage.value = Boolean(session.page_image)
    qrStatus.value = 'pending'
    qrErrorMessage.value = ''
    startQrCountdown(session.expires_at)
    startQrPolling(session.session_id)
  } catch (error) {
    $toast.error(getApiBusinessErrorMessage(error) ?? t('netdisk.qr.startFailed'))
  } finally {
    qrStarting.value = false
  }
}

/** 根据会话过期时间启动倒计时。 */
function startQrCountdown(expiresAt: string | null) {
  if (qrCountdownTimer) clearInterval(qrCountdownTimer)
  const updateRemaining = () => {
    if (!expiresAt) {
      qrRemainingSeconds.value = 0
      return
    }
    qrRemainingSeconds.value = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
  }
  updateRemaining()
  qrCountdownTimer = setInterval(updateRemaining, 1000)
}

/** 轮询扫码状态直到得出结果。 */
function startQrPolling(sessionId: string) {
  if (qrPollTimer) clearInterval(qrPollTimer)
  qrPollTimer = setInterval(async () => {
    const result = await pollNetdiskQrLogin(sessionId)
    qrStatus.value = result.status
    if (result.message) qrErrorMessage.value = result.message
    if (result.status === 'success') {
      if (qrPollTimer) clearInterval(qrPollTimer)
      if (qrCountdownTimer) clearInterval(qrCountdownTimer)
      qrPollTimer = undefined
      qrCountdownTimer = undefined
      qrSession.value = null
      $toast.success(t('netdisk.qr.loginSuccess'))
      emit('save')
    } else if (result.status === 'failed' || result.status === 'expired') {
      if (qrPollTimer) clearInterval(qrPollTimer)
      qrPollTimer = undefined
    }
  }, 2000)
}

/** 二维码失效后允许重新开始。 */
async function restartQrLogin() {
  await teardownQrSession()
  await startQrLogin()
}

/** 粘贴 Cookie 方式提交。 */
async function submitCookie() {
  if (!cookieValue.value.trim()) {
    $toast.warning(t('netdisk.cookieRequired'))
    return
  }
  submitting.value = true
  startNProgress()
  try {
    await createNetdiskCookieAccount({
      platform: selectedPlatform.value,
      cookie: cookieValue.value.trim(),
      name: accountName.value.trim() || undefined,
      is_primary: isPrimary.value || undefined,
    })
    $toast.success(t('netdisk.addSuccess'))
    emit('save')
  } catch (error) {
    $toast.error(getApiBusinessErrorMessage(error) ?? t('netdisk.addFailed'))
  } finally {
    submitting.value = false
    doneNProgress()
  }
}

/** CookieCloud 一键导入。 */
async function submitCookieCloud() {
  submitting.value = true
  startNProgress()
  try {
    await importNetdiskCookieCloudAccount({
      platform: selectedPlatform.value,
      name: accountName.value.trim() || undefined,
      is_primary: isPrimary.value || undefined,
    })
    $toast.success(t('netdisk.addSuccess'))
    emit('save')
  } catch (error) {
    $toast.error(getApiBusinessErrorMessage(error) ?? t('netdisk.addFailed'))
  } finally {
    submitting.value = false
    doneNProgress()
  }
}

/** 账号密码方式提交。 */
async function submitPassword() {
  if (!username.value.trim() || !password.value) {
    $toast.warning(t('netdisk.passwordFieldsRequired'))
    return
  }
  submitting.value = true
  startNProgress()
  try {
    await createNetdiskPasswordAccount({
      platform: selectedPlatform.value,
      username: username.value.trim(),
      password: password.value,
      name: accountName.value.trim() || undefined,
      is_primary: isPrimary.value || undefined,
    })
    $toast.success(t('netdisk.addSuccess'))
    emit('save')
  } catch (error) {
    $toast.error(getApiBusinessErrorMessage(error) ?? t('netdisk.addFailed'))
  } finally {
    submitting.value = false
    doneNProgress()
  }
}

/** 发送光鸭短信验证码。 */
async function sendSmsCode() {
  if (!smsPhone.value.trim()) {
    $toast.warning(t('netdisk.sms.phoneRequired'))
    return
  }
  smsSending.value = true
  try {
    const result = await sendNetdiskSmsCode({
      platform: selectedPlatform.value,
      phone: smsPhone.value.trim(),
    })
    smsVerificationId.value = result.sms_verification_id
    $toast.success(t('netdisk.sms.codeSent'))
    smsCountdown.value = 60
    if (smsTimer) clearInterval(smsTimer)
    smsTimer = setInterval(() => {
      smsCountdown.value -= 1
      if (smsCountdown.value <= 0 && smsTimer) clearInterval(smsTimer)
    }, 1000)
  } catch (error) {
    $toast.error(getApiBusinessErrorMessage(error) ?? t('netdisk.addFailed'))
  } finally {
    smsSending.value = false
  }
}

/** 短信验证码登录并保存账号。 */
async function submitSms() {
  if (!smsPhone.value.trim() || !smsCode.value.trim() || !smsVerificationId.value) {
    $toast.warning(t('netdisk.sms.verificationRequired'))
    return
  }
  submitting.value = true
  startNProgress()
  try {
    await createNetdiskSmsAccount({
      platform: selectedPlatform.value,
      phone: smsPhone.value.trim(),
      code: smsCode.value.trim(),
      verification_id: smsVerificationId.value,
      name: accountName.value.trim() || undefined,
      is_primary: isPrimary.value || undefined,
    })
    $toast.success(t('netdisk.addSuccess'))
    emit('save')
  } catch (error) {
    $toast.error(getApiBusinessErrorMessage(error) ?? t('netdisk.addFailed'))
  } finally {
    submitting.value = false
    doneNProgress()
  }
}

/** 保存编辑结果；凭据留空表示不修改。 */
async function submitEdit() {
  if (!props.account || !accountName.value.trim()) {
    $toast.warning(t('netdisk.nameRequired'))
    return
  }
  submitting.value = true
  startNProgress()
  try {
    await updateNetdiskAccount(props.account.id, {
      name: accountName.value.trim(),
      is_primary: isPrimary.value,
      cookie: cookieValue.value.trim() || undefined,
    })
    $toast.success(t('netdisk.updateSuccess', { name: accountName.value.trim() }))
    emit('save')
  } catch (error) {
    $toast.error(getApiBusinessErrorMessage(error) ?? t('netdisk.updateFailed', { name: accountName.value.trim() }))
  } finally {
    submitting.value = false
    doneNProgress()
  }
}

/** 关闭弹窗前清理扫码会话。 */
async function handleClose() {
  await teardownQrSession()
  emit('close')
}

onBeforeUnmount(() => {
  if (qrPollTimer) clearInterval(qrPollTimer)
  if (qrCountdownTimer) clearInterval(qrCountdownTimer)
  if (smsTimer) clearInterval(smsTimer)
  // 组件卸载时尽力取消会话；失败不影响关闭流程。
  if (qrSession.value?.session_id) {
    cancelNetdiskQrLogin(qrSession.value.session_id).catch(error => console.error(error))
  }
})
</script>

<template>
  <VDialog scrollable :close-on-back="false" eager max-width="56rem" :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VCardItem class="py-2">
        <template #prepend>
          <VIcon :icon="oper === 'add' ? 'mdi-cloud-plus-outline' : 'mdi-cloud-outline'" class="me-2" />
        </template>
        <VCardTitle>
          {{ oper === 'add' ? t('netdisk.actions.add') : t('netdisk.actions.edit') }}
        </VCardTitle>
        <VCardSubtitle>{{ oper === 'edit' ? account?.name : selectedPlatform }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn @click="handleClose" />
      <VDivider />
      <VCardText>
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol cols="12" md="6">
              <VSelect
                v-model="selectedPlatform"
                :items="platformItems"
                :label="t('netdisk.fields.platform')"
                :rules="[requiredValidator]"
                :disabled="oper === 'edit'"
                :hint="t('netdisk.hints.platform')"
                persistent-hint
                prepend-inner-icon="mdi-cloud-outline"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="accountName"
                :label="t('netdisk.fields.name')"
                :rules="oper === 'edit' ? [requiredValidator] : []"
                :hint="t('netdisk.hints.name')"
                persistent-hint
                prepend-inner-icon="mdi-tag-outline"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VSwitch
                v-model="isPrimary"
                :label="t('netdisk.fields.isPrimary')"
                :hint="t('netdisk.hints.isPrimary')"
                persistent-hint
              />
            </VCol>
          </VRow>

          <!-- 编辑模式：仅名称、主账号与可选凭据更新 -->
          <template v-if="oper === 'edit'">
            <VRow>
              <VCol cols="12">
                <VTextField
                  v-model="cookieValue"
                  :type="showCookie ? 'text' : 'password'"
                  autocomplete="new-password"
                  :label="t('netdisk.fields.cookie')"
                  :hint="t('netdisk.hints.cookieUpdate')"
                  persistent-hint
                  prepend-inner-icon="mdi-cookie"
                  :append-inner-icon="showCookie ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                  @click:append-inner="showCookie = !showCookie"
                />
              </VCol>
            </VRow>
            <div class="d-flex justify-end mt-4">
              <VBtn color="primary" prepend-icon="mdi-content-save" :loading="submitting" @click="submitEdit">
                {{ t('common.save') }}
              </VBtn>
            </div>
          </template>

          <!-- 新增模式：四种登录方式 -->
          <template v-else>
            <VTabs v-model="loginMethod" show-arrows class="v-tabs-pill mt-2">
              <VTab
                v-for="method in loginMethods"
                :key="method.value"
                :value="method.value"
                selected-class="v-tab--selected"
              >
                <div>
                  <VIcon size="20" start :icon="method.icon" />
                  {{ method.title }}
                </div>
              </VTab>
            </VTabs>
            <VWindow v-model="loginMethod" class="my-3 disable-tab-transition" :touch="false">
              <!-- 粘贴 Cookie -->
              <VWindowItem value="cookie">
                <VRow>
                  <VCol cols="12">
                    <VTextField
                      v-model="cookieValue"
                      :type="showCookie ? 'text' : 'password'"
                      autocomplete="new-password"
                      :label="t('netdisk.fields.cookie')"
                      :hint="
                        cookieRequiredKeysHint
                          ? t('netdisk.hints.cookieRequiredKeys', { keys: cookieRequiredKeysHint })
                          : t('netdisk.hints.cookie')
                      "
                      persistent-hint
                      prepend-inner-icon="mdi-cookie"
                      :append-inner-icon="showCookie ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                      @click:append-inner="showCookie = !showCookie"
                    />
                  </VCol>
                  <VCol cols="12">
                    <VAlert variant="tonal" color="info" density="compact" :text="t('netdisk.cookieSteps')" />
                  </VCol>
                </VRow>
                <div class="d-flex justify-end mt-2">
                  <VBtn
                    color="primary"
                    prepend-icon="mdi-content-save"
                    :loading="submitting"
                    :disabled="!selectedPlatform"
                    @click="submitCookie"
                  >
                    {{ t('common.save') }}
                  </VBtn>
                </div>
              </VWindowItem>

              <!-- CookieCloud 导入 -->
              <VWindowItem value="cookiecloud">
                <VAlert variant="tonal" color="info" density="compact" :text="t('netdisk.cookiecloudHint')" />
                <div class="d-flex justify-end mt-4">
                  <VBtn
                    color="primary"
                    prepend-icon="mdi-cloud-download-outline"
                    :loading="submitting"
                    :disabled="!selectedPlatform"
                    @click="submitCookieCloud"
                  >
                    {{ t('netdisk.actions.importCookieCloud') }}
                  </VBtn>
                </div>
              </VWindowItem>

              <!-- 账号密码 -->
              <VWindowItem value="password">
                <VBtnToggle
                  v-if="selectedPlatform === 'guangya'"
                  v-model="smsMode"
                  mandatory
                  density="comfortable"
                  class="mb-4"
                >
                  <VBtn :value="false" prepend-icon="mdi-lock">{{ t('netdisk.sms.modePassword') }}</VBtn>
                  <VBtn :value="true" prepend-icon="mdi-message-text">{{ t('netdisk.sms.modeSms') }}</VBtn>
                </VBtnToggle>
                <template v-if="!smsMode">
                  <VRow>
                    <VCol cols="12" md="6">
                      <VTextField
                        v-model="username"
                        :label="t('netdisk.fields.username')"
                        :rules="[requiredValidator]"
                        :hint="t('netdisk.hints.username')"
                        persistent-hint
                        prepend-inner-icon="mdi-account"
                      />
                    </VCol>
                    <VCol cols="12" md="6">
                      <VTextField
                        v-model="password"
                        :type="showPassword ? 'text' : 'password'"
                        autocomplete="new-password"
                        :label="t('netdisk.fields.password')"
                        :rules="[requiredValidator]"
                        :hint="t('netdisk.hints.password')"
                        persistent-hint
                        prepend-inner-icon="mdi-lock"
                        :append-inner-icon="showPassword ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                        @click:append-inner="showPassword = !showPassword"
                      />
                    </VCol>
                  </VRow>
                  <div class="d-flex justify-end mt-2">
                    <VBtn
                      color="primary"
                      prepend-icon="mdi-login"
                      :loading="submitting"
                      :disabled="!selectedPlatform"
                      @click="submitPassword"
                    >
                      {{ t('netdisk.actions.login') }}
                    </VBtn>
                  </div>
                </template>
                <template v-else>
                  <VRow>
                    <VCol cols="12" md="6">
                      <VTextField
                        v-model="smsPhone"
                        :label="t('netdisk.sms.phone')"
                        :rules="[requiredValidator]"
                        persistent-hint
                        prepend-inner-icon="mdi-cellphone"
                      />
                    </VCol>
                    <VCol cols="12" md="6">
                      <VTextField
                        v-model="smsCode"
                        :label="t('netdisk.sms.code')"
                        :rules="[requiredValidator]"
                        persistent-hint
                        prepend-inner-icon="mdi-message-text"
                      >
                        <template #append-inner>
                          <VBtn
                            size="small"
                            variant="text"
                            :loading="smsSending"
                            :disabled="smsCountdown > 0"
                            @click="sendSmsCode"
                          >
                            {{ smsCountdown > 0 ? `${smsCountdown}s` : t('netdisk.sms.sendCode') }}
                          </VBtn>
                        </template>
                      </VTextField>
                    </VCol>
                  </VRow>
                  <div class="d-flex justify-end mt-2">
                    <VBtn
                      color="primary"
                      prepend-icon="mdi-login"
                      :loading="submitting"
                      :disabled="!selectedPlatform"
                      @click="submitSms"
                    >
                      {{ t('netdisk.actions.login') }}
                    </VBtn>
                  </div>
                </template>
              </VWindowItem>

              <!-- 扫码登录 -->
              <VWindowItem value="qr">
                <div class="d-flex flex-column align-center gap-3 py-2">
                  <template v-if="qrSession">
                    <img
                      :src="qrDisplaySrc"
                      alt=""
                      class="rounded-lg border"
                      style="max-width: 100%; max-height: 60vh; object-fit: contain"
                    />
                    <VBtn
                      v-if="qrPageImageSrc"
                      size="small"
                      variant="text"
                      :prepend-icon="showFullPage ? 'mdi-qrcode' : 'mdi-monitor'"
                      @click="showFullPage = !showFullPage"
                    >
                      {{ showFullPage ? t('netdisk.qr.showQr') : t('netdisk.qr.showPage') }}
                    </VBtn>
                    <div class="d-flex align-center gap-2">
                      <VChip
                        size="small"
                        variant="tonal"
                        :color="
                          qrStatus === 'success'
                            ? 'success'
                            : qrStatus === 'failed' || qrStatus === 'expired'
                              ? 'error'
                              : 'info'
                        "
                      >
                        {{ t(`netdisk.qr.status.${qrStatus || 'pending'}`) }}
                      </VChip>
                      <span v-if="qrRemainingSeconds > 0 && qrStatus === 'pending'" class="text-caption">
                        {{ t('netdisk.qr.countdown', { seconds: qrRemainingSeconds }) }}
                      </span>
                    </div>
                    <div v-if="qrErrorMessage" class="text-caption text-error">{{ qrErrorMessage }}</div>
                    <div class="d-flex gap-2">
                      <VBtn
                        v-if="qrStatus === 'failed' || qrStatus === 'expired'"
                        variant="tonal"
                        prepend-icon="mdi-refresh"
                        @click="restartQrLogin"
                      >
                        {{ t('netdisk.qr.restart') }}
                      </VBtn>
                      <VBtn variant="text" @click="teardownQrSession">
                        {{ t('common.cancel') }}
                      </VBtn>
                    </div>
                  </template>
                  <template v-else>
                    <VAlert
                      variant="tonal"
                      color="info"
                      density="compact"
                      :text="
                        platformInfo?.login_url
                          ? t('netdisk.qr.hintWithUrl', { url: platformInfo.login_url })
                          : t('netdisk.qr.hint')
                      "
                    />
                    <VBtn
                      color="primary"
                      prepend-icon="mdi-qrcode"
                      :loading="qrStarting"
                      :disabled="!selectedPlatform"
                      @click="startQrLogin"
                    >
                      {{ t('netdisk.qr.start') }}
                    </VBtn>
                  </template>
                </div>
              </VWindowItem>
            </VWindow>
          </template>
        </VForm>
      </VCardText>
    </VCard>
  </VDialog>
</template>
