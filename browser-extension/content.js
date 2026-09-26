// 仅观察 chatgpt.com 中用户亲自提交后的新回复；不读取或上传回复正文。
;(function () {
  if (window !== window.top) return

  let armedAt = 0
  let pending = null
  let previousUser = lastMessage('user')
  let scanTimer = null

  function lastMessage(role) {
    const nodes = document.querySelectorAll('[data-message-author-role="' + role + '"]')
    return nodes.length ? nodes[nodes.length - 1] : null
  }

  function isComposer(element) {
    return !!element && !!element.closest('textarea, [contenteditable="true"], #prompt-textarea')
  }

  function arm() { armedAt = Date.now() }

  document.addEventListener('submit', event => {
    if (event.target && event.target.querySelector('textarea, [contenteditable="true"], #prompt-textarea')) arm()
  }, true)
  document.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && isComposer(event.target)) arm()
  }, true)
  document.addEventListener('click', event => {
    const button = event.target && event.target.closest('button')
    if (!button) return
    const label = (button.getAttribute('aria-label') || '') + ' ' + (button.getAttribute('data-testid') || '')
    if (/send|发送|提交/i.test(label) && button.closest('form, main')) arm()
  }, true)

  function currentAssistant(user) {
    const nodes = document.querySelectorAll('[data-message-author-role="assistant"]')
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (user.compareDocumentPosition(nodes[i]) & Node.DOCUMENT_POSITION_FOLLOWING) return nodes[i]
    }
    return null
  }

  function stopButtonVisible() {
    const selector = 'button[data-testid="stop-button"], button[aria-label*="Stop"], button[aria-label*="停止"]'
    return [...document.querySelectorAll(selector)].some(button => button.getClientRects().length > 0)
  }

  function conversationTitle() {
    const title = document.title.replace(/\s*[-|–]\s*ChatGPT\s*$/i, '').trim()
    return title && title.toLowerCase() !== 'chatgpt' ? title.slice(0, 60) : 'ChatGPT 网页对话'
  }

  function scan() {
    scanTimer = null
    const user = lastMessage('user')
    if (user !== previousUser) {
      previousUser = user
      if (user && Date.now() - armedAt < 10000) {
        pending = { user, started: Date.now(), assistant: null, text: '', changed: Date.now(), sawStop: false }
        armedAt = 0
      }
    }
    if (!pending) return
    if (!pending.user.isConnected || Date.now() - pending.started > 30 * 60 * 1000) { pending = null; return }
    const assistant = currentAssistant(pending.user)
    if (stopButtonVisible()) pending.sawStop = true
    if (!assistant) return
    const text = (assistant.innerText || assistant.textContent || '').trim()
    if (assistant !== pending.assistant || text !== pending.text) {
      pending.assistant = assistant
      pending.text = text
      pending.changed = Date.now()
    }
    if (!text) return
    const idle = Date.now() - pending.changed
    const enoughTime = Date.now() - pending.started >= 4000
    if (enoughTime && !stopButtonVisible() && idle >= (pending.sawStop ? 1200 : 3500)) {
      pending = null
      chrome.runtime.sendMessage({ type: 'completion', conversation: conversationTitle() }, () => {
        // 扩展或桌面端暂时离线时，不影响网页本身。
        void chrome.runtime.lastError
      })
    }
  }

  function scheduleScan() {
    if (scanTimer) return
    scanTimer = setTimeout(scan, 150)
  }
  new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true, characterData: true })
  setInterval(scan, 750)
})()
