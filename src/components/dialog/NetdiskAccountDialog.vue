<script lang="ts" setup>
import type { PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'
import { useDisplay } from 'vuetify'
import {
  cancelNetdiskQrLogin,
  createNetdiskCookieAccount,
  createNetdiskPasswordAccount,
  confirmNetdiskQrLogin,
  createNetdiskQrTicket,
  createNetdiskSmsAccount,
  fetchNetdiskQrFrame,
  importNetdiskCookieCloudAccount,
  pollNetdiskQrLogin,
  sendNetdiskQrInput,
  sendNetdiskSmsCode,
  startNetdiskQrLogin,
  type NetdiskAccount,
  type NetdiskPlatformInfo,
  type NetdiskQrSession,
  type NetdiskQrStatus,
} from '@/api/netdisk'
import { getApiBusinessErrorMessage } from '@/api/client'
import { requiredValidator } from '@/@validators'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import { getNetdiskPlatformIcon, getNetdiskPlatformName } from '@/utils/netdisk'

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
const platformItems = computed(() =>
  props.platforms.map(item => ({
    title: getNetdiskPlatformName(t, item.platform),
    value: item.platform,
    props: { prependIcon: getNetdiskPlatformIcon(item.platform) },
  })),
)
const selectedPlatformName = computed(() => getNetdiskPlatformName(t, selectedPlatform.value))
const accountIdPayload = computed(() => (props.oper === 'edit' ? props.account?.id : undefined))

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
  qrSession.value?.page_image ? `data:image/jpeg;base64,${qrSession.value.page_image}` : ''
)
const showFullPage = ref(true)
const frameImage = ref('')
const frameWidth = ref(0)
const frameHeight = ref(0)
const frameRefreshing = ref(false)
const qrSocket = ref<WebSocket | null>(null)
// 最近一次收到实时画面的时间，用于判断实时流是否仍在出帧
let lastFrameAt = 0
const qrAccountName = ref('')
const qrConfirming = ref(false)
const frameImageEl = ref<HTMLImageElement | null>(null)
const keyboardInput = ref<HTMLInputElement | null>(null)
let typeBuffer = ''
let typeTimer: ReturnType<typeof setTimeout> | undefined
const qrDisplaySrc = computed(() => {
  if (showFullPage.value) return frameImage.value || qrPageImageSrc.value
  return qrImageSrc.value
})
// 139 使用 noVNC 嵌入真实 Chromium，用户直接在 canvas 上操作。
const vncFrameSrc = computed(() => {
  const path = qrSession.value?.vnc_path
  if (!path) return ''
  return `/novnc/vnc.html?autoconnect=true&resize=scale&reconnect=true&path=${encodeURIComponent(path)}`
})

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

/** 停止扫码轮询与倒计时。 */
function stopQrTimers() {
  if (qrPollTimer) clearInterval(qrPollTimer)
  if (qrCountdownTimer) clearInterval(qrCountdownTimer)
  qrPollTimer = undefined
  qrCountdownTimer = undefined
}

/** 停止扫码轮询并通知后端释放会话。 */
async function teardownQrSession() {
  stopQrTimers()
  if (smsTimer) clearInterval(smsTimer)
  const sessionId = qrSession.value?.session_id
  closeQrStream()
  qrSession.value = null
  frameImage.value = ''
  frameWidth.value = 0
  frameHeight.value = 0
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
      is_primary: isPrimary.value || undefined,
      account_id: accountIdPayload.value,
    })
    qrSession.value = session
    lastFrameAt = 0
    showFullPage.value = Boolean(session.page_image)
    frameImage.value = session.page_image ? `data:image/jpeg;base64,${session.page_image}` : ''
    frameWidth.value = 0
    frameHeight.value = 0
    if (!session.vnc_path) {
      void connectQrStream(session.session_id)
      void refreshQrFrame(session.session_id)
    }
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

/** 应用最新网页登录画面。 */
function applyQrFrame(frame: { image: string; page_width: number; page_height: number }) {
  if (frame.image) frameImage.value = `data:image/jpeg;base64,${frame.image}`
  frameWidth.value = frame.page_width || frameWidth.value
  frameHeight.value = frame.page_height || frameHeight.value
}

/** 关闭实时画面连接。 */
function closeQrStream() {
  if (qrSocket.value) {
    qrSocket.value.close()
    qrSocket.value = null
  }
}

/** 建立 CDP 实时画面连接，失败时保留 HTTP 轮询。 */
async function connectQrStream(sessionId: string) {
  closeQrStream()
  try {
    const { ticket } = await createNetdiskQrTicket(sessionId)
    const base = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '')
    const url = new URL(`${base}/netdisk/accounts/qr/${sessionId}/ws?ticket=${encodeURIComponent(ticket)}`, location.origin)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(url)
    qrSocket.value = socket
    socket.onmessage = event => {
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'frame') {
          lastFrameAt = Date.now()
          applyQrFrame({ image: message.data, page_width: message.width, page_height: message.height })
        } else if (message.type === 'status') {
          qrStatus.value = message.status
          if (message.message) qrErrorMessage.value = message.message
          if (message.status === 'detected') {
            if (message.account_name) qrAccountName.value = message.account_name
            qrErrorMessage.value = ''
            if (qrCountdownTimer) clearInterval(qrCountdownTimer)
            qrCountdownTimer = undefined
          }
          if (message.status === 'failed' || message.status === 'expired') {
            stopQrTimers()
          }
        }
      } catch {
        // 忽略无法解析的帧消息。
      }
    }
    socket.onclose = () => {
      if (qrSocket.value === socket) qrSocket.value = null
      lastFrameAt = 0
      if (qrSession.value) void refreshQrFrame(qrSession.value.session_id)
    }
  } catch {
    // 实时连接不可用时继续使用 HTTP 画面轮询。
  }
}

/** 发送页面事件：优先走实时连接，否则回退 HTTP。 */
function sendPageEvent(event: {
  kind: 'mouse' | 'drag' | 'text' | 'key'
  x?: number
  y?: number
  x1?: number
  y1?: number
  x2?: number
  y2?: number
  text?: string
  key?: string
}) {
  const socket = qrSocket.value
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(event))
    return
  }
  if (event.kind === 'drag') {
    void sendQrInput({ kind: 'drag', x1: event.x1, y1: event.y1, x2: event.x2, y2: event.y2 })
  } else if (event.kind === 'mouse') {
    void sendQrInput({ kind: 'click', x: event.x, y: event.y })
  } else if (event.kind === 'text') {
    void sendQrInput({ kind: 'type', text: event.text })
  } else {
    void sendQrInput({ kind: 'key', key: event.key })
  }
}

/** 主动刷新网页登录画面。 */
async function refreshQrFrame(sessionId: string) {
  if (qrSession.value?.vnc_path) return
  // 实时流仍在出帧时跳过 HTTP 截图；超过 2.5 秒没有帧说明画面已停滞，回退轮询。
  if (qrSocket.value?.readyState === WebSocket.OPEN && Date.now() - lastFrameAt < 2500) return
  if (frameRefreshing.value) return
  frameRefreshing.value = true
  try {
    applyQrFrame(await fetchNetdiskQrFrame(sessionId))
  } catch {
    // 画面刷新失败不打断轮询，下一次继续。
  } finally {
    frameRefreshing.value = false
  }
}

/** 把页面操作转发到后端并应用返回画面。 */
async function sendQrInput(payload: {
  kind: 'click' | 'drag' | 'type' | 'key' | 'scroll'
  x?: number
  y?: number
  x1?: number
  y1?: number
  x2?: number
  y2?: number
  text?: string
  key?: string
  delta_y?: number
}) {
  if (!qrSession.value) return
  frameRefreshing.value = true
  try {
    applyQrFrame(await sendNetdiskQrInput(qrSession.value.session_id, payload))
  } catch (error) {
    $toast.error(getApiBusinessErrorMessage(error) ?? t('netdisk.addFailed'))
  } finally {
    frameRefreshing.value = false
  }
}

let dragStart: { x: number; y: number } | null = null
let dragMoved = false

/** 把指针位置换算成页面坐标。 */
function framePoint(event: PointerEvent): { x: number; y: number } | null {
  const image = frameImageEl.value
  if (!image || !frameWidth.value || !frameHeight.value) return null
  const rect = image.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * frameWidth.value,
    y: ((event.clientY - rect.top) / rect.height) * frameHeight.value,
  }
}

/** 按下：记录拖拽起点。 */
function handleFramePointerDown(event: PointerEvent) {
  // 阻止默认的焦点转移：否则点击截图后焦点会落到图片/body，
  // 隐藏输入框失焦，后续键盘输入就进不到网页里。
  event.preventDefault()
  keyboardInput.value?.focus()
  if (!showFullPage.value) return
  const point = framePoint(event)
  if (!point) return
  dragStart = point
  dragMoved = false
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
}

/** 移动：超过阈值后标记为拖拽。 */
function handleFramePointerMove(event: PointerEvent) {
  if (!dragStart) return
  const point = framePoint(event)
  if (!point) return
  if (Math.abs(point.x - dragStart.x) + Math.abs(point.y - dragStart.y) > 8) {
    dragMoved = true
  }
}

/** 指针被系统取消时丢弃本次拖拽。 */
function handleFramePointerCancel() {
  dragStart = null
  dragMoved = false
}

/** 抬起：拖拽发送 drag，普通点击发送 click。 */
function handleFramePointerUp(event: PointerEvent) {
  if (!dragStart) return
  const start = dragStart
  dragStart = null
  const point = framePoint(event)
  if (!point) return
  if (dragMoved) {
    sendPageEvent({ kind: 'drag', x1: start.x, y1: start.y, x2: point.x, y2: point.y })
  } else {
    sendPageEvent({ kind: 'mouse', x: point.x, y: point.y })
  }
}

/** 直接键盘输入：合并短时间内的字符后转发。 */
function handleHiddenInput(event: Event) {
  const input = event.target as HTMLInputElement
  const value = input.value
  input.value = ''
  if (!value) return
  typeBuffer += value
  if (typeTimer) clearTimeout(typeTimer)
  typeTimer = setTimeout(() => {
    const text = typeBuffer
    typeBuffer = ''
    if (text) sendPageEvent({ kind: 'text', text })
  }, 120)
}

/** 特殊键直接转发。 */
function handleHiddenKey(event: KeyboardEvent) {
  const keys = ['Enter', 'Tab', 'Backspace', 'Escape', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
  if (!keys.includes(event.key)) return
  event.preventDefault()
  sendPageEvent({ kind: 'key', key: event.key })
}

/** 滚轮转发为页面滚动。 */
function handleFrameWheel(event: WheelEvent) {
  if (!showFullPage.value) return
  void sendQrInput({ kind: 'scroll', delta_y: event.deltaY })
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
    // detected 后仍保留画面刷新，直到用户保存或取消；状态轮询到此为止。
    if (!qrSession.value?.vnc_path) void refreshQrFrame(sessionId)
    if (qrStatus.value === 'detected') return
    let result: Awaited<ReturnType<typeof pollNetdiskQrLogin>>
    try {
      result = await pollNetdiskQrLogin(sessionId)
    } catch {
      return
    }
    qrStatus.value = result.status
    if (result.message) qrErrorMessage.value = result.message
    if (result.status === 'detected') {
      qrStatus.value = 'detected'
      qrAccountName.value = result.account_name || qrAccountName.value
      qrErrorMessage.value = ''
      if (qrCountdownTimer) clearInterval(qrCountdownTimer)
      qrCountdownTimer = undefined
    } else if (result.status === 'success') {
      stopQrTimers()
      qrSession.value = null
      $toast.success(t('netdisk.qr.loginSuccess'))
      emit('save')
    } else if (result.status === 'failed' || result.status === 'expired') {
      stopQrTimers()
    }
  }, 2500)
}

/** 确认保存已检测到的登录态。 */
async function confirmQrLogin() {
  if (!qrSession.value || qrConfirming.value) return
  qrConfirming.value = true
  try {
    await confirmNetdiskQrLogin(qrSession.value.session_id)
    $toast.success(t('netdisk.addSuccess'))
    stopQrTimers()
    closeQrStream()
    qrSession.value = null
    emit('save')
  } catch (error) {
    $toast.error(getApiBusinessErrorMessage(error) ?? t('netdisk.addFailed'))
  } finally {
    qrConfirming.value = false
  }
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
      is_primary: isPrimary.value || undefined,
      account_id: accountIdPayload.value,
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
      is_primary: isPrimary.value || undefined,
      account_id: accountIdPayload.value,
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
      is_primary: isPrimary.value || undefined,
      account_id: accountIdPayload.value,
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
      account_id: accountIdPayload.value,
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
      is_primary: isPrimary.value || undefined,
      account_id: accountIdPayload.value,
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

/** 关闭弹窗前清理扫码会话。 */
async function handleClose() {
  await teardownQrSession()
  emit('close')
}

onBeforeUnmount(() => {
  stopQrTimers()
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
        <VCardSubtitle>{{ selectedPlatformName }}</VCardSubtitle>
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
                :prepend-inner-icon="getNetdiskPlatformIcon(selectedPlatform)"
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

          <!-- 新增与编辑共用四种登录方式；编辑提交会携带 account_id。 -->
          <!-- 注意：此处不能使用无指令的 <template> 包裹，Vue 3.5 会将其编译为原生 template 元素导致内容不渲染。 -->
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
                    <VAlert
                      v-if="qrSession.vnc_path"
                      variant="tonal"
                      color="info"
                      density="compact"
                      :text="t('netdisk.qr.vncHint')"
                    />
                    <iframe
                      v-if="vncFrameSrc"
                      :src="vncFrameSrc"
                      class="qr-vnc-frame"
                      allow="clipboard-read; clipboard-write"
                    />
                    <template v-else>
                      <div
                        class="qr-page-capture"
                        @pointerdown="handleFramePointerDown"
                        @mousedown.prevent
                        @pointermove="handleFramePointerMove"
                        @pointerup="handleFramePointerUp"
                        @pointercancel="handleFramePointerCancel"
                        @wheel.prevent="handleFrameWheel"
                      >
                        <img
                          ref="frameImageEl"
                          :src="qrDisplaySrc"
                          alt=""
                          class="rounded-lg border qr-page-image"
                          draggable="false"
                          @dragstart.prevent
                        />
                        <input
                          v-if="showFullPage"
                          ref="keyboardInput"
                          class="qr-page-capture__input"
                          autocomplete="off"
                          autocapitalize="off"
                          spellcheck="false"
                          @input="handleHiddenInput"
                          @keydown="handleHiddenKey"
                        />
                      </div>
                      <p v-if="showFullPage" class="text-caption text-medium-emphasis">
                        {{ t('netdisk.qr.keyboardHint') }}
                      </p>
                      <VBtn
                        v-if="qrPageImageSrc"
                        size="small"
                        variant="text"
                        :prepend-icon="showFullPage ? 'mdi-qrcode' : 'mdi-monitor'"
                        @click="showFullPage = !showFullPage"
                      >
                        {{ showFullPage ? t('netdisk.qr.showQr') : t('netdisk.qr.showPage') }}
                      </VBtn>
                    </template>
                    <div class="d-flex align-center gap-2">
                      <VChip
                        size="small"
                        variant="tonal"
                        :color="
                          qrStatus === 'success' || qrStatus === 'detected'
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
                    <div v-if="qrStatus === 'detected'" class="d-flex flex-column align-center gap-2">
                      <div class="text-body-2">
                        {{
                          t('netdisk.qr.detected', {
                            name: qrAccountName || t('netdisk.qr.unknownAccount'),
                          })
                        }}
                      </div>
                      <VBtn
                        color="primary"
                        prepend-icon="mdi-content-save"
                        :loading="qrConfirming"
                        @click="confirmQrLogin"
                      >
                        {{ t('netdisk.qr.saveLogin') }}
                      </VBtn>
                    </div>
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
        </VForm>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped>
.qr-page-capture {
  position: relative;
  display: block;
  inline-size: 100%;
  max-inline-size: 100%;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.qr-page-image {
  display: block;
  inline-size: 100%;
  block-size: auto;
  cursor: crosshair;
}

.qr-vnc-frame {
  display: block;
  inline-size: 100%;
  aspect-ratio: 16 / 10;
  block-size: auto;
  min-block-size: 0;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
  background: #000;
}

.qr-page-capture__input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: crosshair;
  /* 输入层只负责接收键盘，不能拦截指针事件，否则拖拽会被输入框吞掉 */
  pointer-events: none;
}
</style>
