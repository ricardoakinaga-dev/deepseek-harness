/** Locale-owned copy for the optional Codex login control. */
export const NS = 'codex-login'

/** Simplified Chinese dictionary and key source. */
export const zh = {
  signIn: '使用 ChatGPT 登录',
  signOut: '退出登录',
  checking: '正在检查登录状态…',
  signedIn: '已连接 ChatGPT 账号',
  signedOut: '未连接 ChatGPT 账号',
  unavailable: '此配置未提供 Codex 登录。',
  saveFirst: '请先保存此提供方，不填写 API 密钥，然后登录。',
  keyOverride: '此提供方设置了 API 密钥，它会优先于 ChatGPT 登录凭据。请先移除 API 密钥。',
  busy: '另一个窗口正在登录。',
  continue: '在浏览器中继续登录',
  copyCode: '如果浏览器无法返回 DSH，请在下方粘贴授权代码或回调 URL。',
  code: '授权代码或回调 URL',
  submit: '提交代码',
  cancel: '取消',
  cancelled: '登录已取消。',
  failed: '登录失败，请重试。',
  callbackBusy: '本机 1455 端口已被占用。请关闭占用该端口的程序后重试。',
  loadFailed: '无法读取登录状态。',
  signOutFailed: '无法退出登录。',
  deviceCode: '验证码：{code}',
} satisfies Record<string, string>

/** Dictionary key union. */
export type Key = keyof typeof zh

/** English dictionary checked against the Chinese key set. */
export const en = {
  signIn: 'Sign in with ChatGPT',
  signOut: 'Sign out',
  checking: 'Checking sign-in status…',
  signedIn: 'ChatGPT account connected',
  signedOut: 'ChatGPT account not connected',
  unavailable: 'Codex sign-in is not available in this profile.',
  saveFirst: 'Save this provider without an API key, then sign in.',
  keyOverride: 'An API key is configured and takes precedence over ChatGPT login. Remove the API key first.',
  busy: 'Sign-in is in progress in another window.',
  continue: 'Continue sign-in in your browser',
  copyCode: 'If the browser cannot return to DSH, paste the authorization code or redirect URL below.',
  code: 'Authorization code or redirect URL',
  submit: 'Submit code',
  cancel: 'Cancel',
  cancelled: 'Sign-in cancelled.',
  failed: 'Sign-in failed. Try again.',
  callbackBusy: 'Port 1455 is already in use on this computer. Free it and try again.',
  loadFailed: 'Could not read sign-in status.',
  signOutFailed: 'Could not sign out.',
  deviceCode: 'Verification code: {code}',
} satisfies Record<Key, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Codex authorization copy. */
    'codex-login': Key
  }
}
