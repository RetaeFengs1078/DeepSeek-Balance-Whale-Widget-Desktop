// 仅在 chatgpt.com 本地比较回复变化；不向鲸鱼或第三方上传回复正文。
;(function () {
  if (window !== window.top) return

  let armedAt = 0
  let pending = null
  let previousUser = lastMessage('user')
  let previousStop = stopButtonVisible()
  let scanTimer = null
  let lastNoticeAt = 0
  let lastStage = ''

  function diagnose(stage) {
    if (stage === lastStage) return
    lastStage = stage
    chrome.runtime.sendMessage({ type: 'diagnostic', stage }, () => { void chrome.runtime.lastError })
  }

  function lastMessage(role) {
    const nodes = document.querySelectorAll('[data-message-author-role="' + role + '"]')
    return nodes.length ? nodes[nodes.length - 1] : null
  }

  function isComposer(element) {
    return !!element && !!element.closest('textarea, [contenteditable="true"], #prompt-textarea')
  }

  function arm() {
    armedAt = Date.now()
    diagnose('已检测到发送操作')
  }

  document.addEventListener('submit', event => {
    if (event.target && event.target.querySelector('textarea, [contenteditable="true"], #prompt-textarea')) arm()
  }, true)
  document.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && isComposer(event.target)) arm()
  }, true)
  document.addEventListener('click', event => {
    const button = event.target && event.target.closest('button')
    if (!button) return
    const label = (button.getAttribute('aria-label') || '') + ' ' +
      (button.getAttribute('data-testid') || '') + ' ' + (button.getAttribute('title') || '')
    if (/stop|停止/i.test(label)) {
      if (pending) pending.cancelled = true
      return
    }
    if ((/send|发送|提交/i.test(label) || button.type === 'submit') && button.closest('form, main')) arm()
  }, true)

  function currentAssistant(user) {
    const nodes = document.querySelectorAll('[data-message-author-role="assistant"]')
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (!user || (user.compareDocumentPosition(nodes[i]) & Node.DOCUMENT_POSITION_FOLLOWING)) return nodes[i]
    }
    return null
  }

  function stopButtonVisible() {
    const selector = 'button[data-testid*="stop" i], button[aria-label*="stop" i], button[aria-label*="停止"], button[title*="stop" i], button[title*="停止"]'
    return [...document.querySelectorAll(selector)].some(button => button.getClientRects().length > 0)
  }

  function conversationTitle() {
    const title = document.title.replace(/\s*[-|–]\s*ChatGPT\s*$/i, '').trim()
    return title && title.toLowerCase() !== 'chatgpt' ? title.slice(0, 60) : 'ChatGPT 网页对话'
  }

  function startPending(user, now) {
    if (!pending) pending = { user, started: now, assistant: null, text: '', changed: now, sawStop: false, stoppedAt: 0, cancelled: false }
    else if (user) pending.user = user
  }

  function notifyCompletion() {
    if (Date.now() - lastNoticeAt < 3000) return
    lastNoticeAt = Date.now()
    pending = null
    diagnose('已检测到回复完成，正在通知鲸鱼')
    chrome.runtime.sendMessage({ type: 'completion', conversation: conversationTitle() }, result => {
      diagnose(chrome.runtime.lastError || !result || !result.ok
        ? '已检测到完成，但发送给鲸鱼失败'
        : '网页完成提醒已送达鲸鱼')
    })
  }

  function scan() {
    scanTimer = null
    const now = Date.now()
    const user = lastMessage('user')
    const stop = stopButtonVisible()
    if (user !== previousUser) {
      previousUser = user
      if (user && armedAt && now - armedAt < 10000) {
        startPending(user, now)
        diagnose('已检测到新提问')
      } else if (pending && user) {
        // ChatGPT 重新渲染消息节点时，继续跟踪同一轮回复。
        pending.user = user
      }
    }
    if (stop && !previousStop) {
      // 页面生成状态本身也可启动检测，不依赖某一种用户消息 DOM。
      startPending(user, now)
      pending.sawStop = true
      pending.stoppedAt = 0
      diagnose('已检测到正在生成回复')
    }
    if (pending && stop) {
      pending.sawStop = true
      pending.stoppedAt = 0
    }
    if (pending && !stop && previousStop && pending.sawStop) {
      pending.stoppedAt = now
      diagnose('已检测到生成结束')
    }
    previousStop = stop
    if (!pending) return
    if (now - pending.started > 30 * 60 * 1000) { pending = null; diagnose('等待超时'); return }
    if (pending.cancelled) { pending = null; diagnose('已取消生成'); return }

    const assistant = currentAssistant(pending.user)
    if (assistant) {
      const text = (assistant.innerText || assistant.textContent || '').trim()
      if (assistant !== pending.assistant || text !== pending.text) {
        pending.assistant = assistant
        pending.text = text
        pending.changed = now
      }
    }
    if (pending.sawStop) {
      if (pending.stoppedAt && now - pending.stoppedAt >= 1200) notifyCompletion()
      return
    }
    if (pending.text && now - pending.started >= 4000 && now - pending.changed >= 3500) notifyCompletion()
  }

  function scheduleScan() {
    if (scanTimer) return
    scanTimer = setTimeout(scan, 150)
  }
  new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true, characterData: true })
  setInterval(scan, 750)
  diagnose('网页监听已启动，等待你发送消息')
})()
