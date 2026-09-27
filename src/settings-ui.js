;(function () {
  'use strict'
  var bridge = window.__whaleSettings
  var byId = function (id) { return document.getElementById(id) }
  if (!bridge) {
    document.querySelector('.intro').textContent = '请从桌面小鲸鱼的菜单打开此设置窗口。'
    document.querySelectorAll('input, select, button.action').forEach(function (element) { element.disabled = true })
    return
  }

  var desktop = {}
  var widget = {}
  var skinItems = []
  var patchSequence = 0
  function setStatus(id, text) { byId(id).textContent = text }
  function displayTime(value) {
    if (!value) return '重置时间未知'
    var date = new Date(value)
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(date) : '重置时间未知'
  }
  function percent(value) {
    var n = Number(value)
    return Number.isFinite(n) ? n.toFixed(Number.isInteger(n) ? 0 : 1) + '%' : '未知'
  }
  function renderDesktop(next) {
    desktop = next || {}
    byId('auto-start').checked = !!desktop.autoStart
    byId('always-on-top').checked = desktop.alwaysOnTop !== false
    byId('quota-panel').checked = !!desktop.showQuotaPanel
    byId('launch-with-apps').checked = !!desktop.launchWithApps && !desktop.autoStart
    byId('launch-with-apps').disabled = !!desktop.autoStart
    byId('sound-custom').value = desktop.soundSet || ''
    byId('skin-select').value = desktop.skinId || 'default'
    byId('email-enabled').checked = !!desktop.emailEnabled
    byId('email-title-enabled').checked = desktop.emailIncludeTitle !== false
    byId('email-host').value = desktop.emailHost || ''
    byId('email-port').value = String(desktop.emailPort || 465)
    byId('email-security').value = desktop.emailSecurity || 'tls'
    byId('email-user').value = desktop.emailUser || ''
    byId('email-recipient').value = desktop.emailRecipient || ''
    byId('email-provider').value = ({ 'smtp.qq.com': 'qq', 'smtp.163.com': '163',
      'smtp.gmail.com': 'gmail', 'smtp.mail.me.com': 'icloud' })[desktop.emailHost] || 'custom'
    byId('email-password').placeholder = desktop.hasEmailPassword ? '已保存（留空不修改）' : '未保存'
    byId('email-clear-password').disabled = !desktop.hasEmailPassword
  }
  function renderWidget(next) {
    widget = next || {}
    byId('size-range').value = String(widget.size || 10)
    byId('size-number').value = String(widget.size || 10)
    byId('bubble-size-range').value = String(widget.bubbleSize || widget.size || 10)
    byId('bubble-size-number').value = String(widget.bubbleSize || widget.size || 10)
    byId('sound-preset').value = widget.soundSet || 'duck'
    byId('volume-range').value = String(Math.round((widget.volume == null ? .9 : widget.volume) * 100))
    byId('volume-value').textContent = byId('volume-range').value + '%'
    byId('bubble-on').checked = widget.bubbleOn !== false
    byId('scroll-gap-on').checked = !!widget.scrollGapOn
    byId('scroll-gap-px').value = String(widget.scrollGapPx == null ? 17 : widget.scrollGapPx)
    byId('scroll-gap-px').disabled = !widget.scrollGapOn
    byId('turn-cost-on').checked = widget.turnCostOn !== false
    byId('turn-cost-seconds').value = String(widget.turnCostCloseSeconds == null ? 5 : widget.turnCostCloseSeconds)
    byId('turn-cost-seconds').disabled = widget.turnCostOn === false
    byId('usage-mode').value = widget.usageMode || 'ledger'
    byId('peak-mode').value = widget.peakMode || 'default'
  }
  function patchDesktop(patch) {
    return bridge.patchDesktop(patch).then(renderDesktop).catch(function () {
      setStatus('refresh-status', '设置保存失败，请重试')
      return bridge.getDesktop().then(renderDesktop)
    })
  }
  function patchWidget(patch) {
    var sequence = ++patchSequence
    return bridge.patchWidget(patch).then(function (next) {
      if (sequence === patchSequence && next) renderWidget(next)
    }).catch(function () {
      setStatus('refresh-status', '设置保存失败，请重试')
      return bridge.getWidget().then(renderWidget)
    })
  }
  function bindDesktopCheckbox(id, field) {
    byId(id).addEventListener('change', function () { patchDesktop({ [field]: this.checked }) })
  }
  function bindWidgetCheckbox(id, field) {
    byId(id).addEventListener('change', function () { patchWidget({ [field]: this.checked }) })
  }
  function bindWidgetSelect(id, field) {
    byId(id).addEventListener('change', function () { patchWidget({ [field]: this.value }) })
  }
  function bindWidgetNumber(id, field, min, max) {
    byId(id).addEventListener('change', function () {
      var value = Math.max(min, Math.min(max, Math.round(Number(this.value) || 0)))
      patchWidget({ [field]: value })
    })
  }

  byId('minimize-window').addEventListener('click', function () { bridge.minimize() })
  byId('close-window').addEventListener('click', function () { bridge.close() })
  byId('size-range').addEventListener('input', function () {
    byId('size-number').value = this.value
    patchWidget({ size: Number(this.value) })
  })
  byId('size-number').addEventListener('change', function () {
    var value = Math.max(1, Math.min(20, Math.round(Number(this.value) || 1)))
    byId('size-range').value = String(value)
    patchWidget({ size: value })
  })
  byId('bubble-size-range').addEventListener('input', function () {
    byId('bubble-size-number').value = this.value
    patchWidget({ bubbleSize: Number(this.value) })
  })
  byId('bubble-size-number').addEventListener('change', function () {
    var value = Math.max(1, Math.min(20, Math.round(Number(this.value) || 1)))
    byId('bubble-size-range').value = String(value)
    patchWidget({ bubbleSize: value })
  })
  byId('volume-range').addEventListener('input', function () {
    byId('volume-value').textContent = this.value + '%'
    patchWidget({ volume: Number(this.value) / 100 })
  })
  bindWidgetSelect('sound-preset', 'soundSet')
  bindWidgetSelect('usage-mode', 'usageMode')
  bindWidgetSelect('peak-mode', 'peakMode')
  bindWidgetCheckbox('bubble-on', 'bubbleOn')
  bindWidgetCheckbox('turn-cost-on', 'turnCostOn')
  bindWidgetCheckbox('scroll-gap-on', 'scrollGapOn')
  bindWidgetNumber('turn-cost-seconds', 'turnCostCloseSeconds', 0, 600)
  bindWidgetNumber('scroll-gap-px', 'scrollGapPx', 0, 200)
  bindDesktopCheckbox('auto-start', 'autoStart')
  bindDesktopCheckbox('always-on-top', 'alwaysOnTop')
  bindDesktopCheckbox('quota-panel', 'showQuotaPanel')
  bindDesktopCheckbox('launch-with-apps', 'launchWithApps')
  bindDesktopCheckbox('email-title-enabled', 'emailIncludeTitle')
  byId('email-enabled').addEventListener('change', function () {
    var wanted = this.checked
    patchDesktop({ emailEnabled: wanted }).then(function () {
      setStatus('email-status', wanted && !desktop.emailEnabled ? '请先填写完整邮箱配置并保存授权码' : '')
    })
  })
  byId('email-provider').addEventListener('change', function () {
    var presets = { qq: ['smtp.qq.com', 465, 'tls'], '163': ['smtp.163.com', 465, 'tls'],
      gmail: ['smtp.gmail.com', 465, 'tls'], icloud: ['smtp.mail.me.com', 587, 'starttls'] }
    var preset = presets[this.value]
    if (preset) patchDesktop({ emailHost: preset[0], emailPort: preset[1], emailSecurity: preset[2] })
  })
  ;[['email-host', 'emailHost'], ['email-user', 'emailUser'], ['email-recipient', 'emailRecipient']].forEach(function (pair) {
    byId(pair[0]).addEventListener('change', function () { patchDesktop({ [pair[1]]: this.value }) })
  })
  byId('email-port').addEventListener('change', function () { patchDesktop({ emailPort: Number(this.value) }) })
  byId('email-security').addEventListener('change', function () { patchDesktop({ emailSecurity: this.value }) })
  byId('email-save-password').addEventListener('click', function () {
    var input = byId('email-password')
    if (!input.value) { setStatus('email-status', '请先填写 SMTP 授权码'); return }
    var button = this
    button.disabled = true
    bridge.saveEmailPassword(input.value).then(function (result) {
      setStatus('email-status', result.ok ? '授权码已加密保存' : (result.error || '保存失败'))
      if (result.ok) input.value = ''
    }).catch(function () { setStatus('email-status', '保存失败') })
      .finally(function () { button.disabled = false })
  })
  byId('email-clear-password').addEventListener('click', function () {
    bridge.saveEmailPassword('').then(function (result) {
      setStatus('email-status', result.ok ? '授权码已清除' : (result.error || '清除失败'))
      if (result.ok) patchDesktop({ emailEnabled: false })
    })
  })
  byId('email-test').addEventListener('click', function () {
    var button = this
    button.disabled = true
    setStatus('email-status', '正在发送…')
    bridge.testEmail().then(function (result) {
      setStatus('email-status', result.ok ? '邮件已交给发件服务器，请查看收件箱' : (result.error || '发送失败'))
    }).catch(function () { setStatus('email-status', '发送失败，请检查网络') })
      .finally(function () { button.disabled = false })
  })
  byId('sound-custom').addEventListener('change', function () { patchDesktop({ soundSet: this.value }) })
  byId('skin-select').addEventListener('change', function () { patchDesktop({ skinId: this.value }) })
  byId('open-sounds').addEventListener('click', function () { bridge.openSounds() })
  byId('open-skins').addEventListener('click', function () { bridge.openSkins() })

  function refreshSounds() {
    return fetch('/dsh-whale/sounds', { cache: 'no-store' }).then(function (r) { return r.json() }).then(function (data) {
      var select = byId('sound-custom')
      select.textContent = ''
      var empty = document.createElement('option')
      empty.value = ''
      empty.textContent = '使用内置音效'
      select.appendChild(empty)
      ;(data.items || []).forEach(function (item) {
        var option = document.createElement('option')
        option.value = item.id
        option.textContent = item.name
        select.appendChild(option)
      })
      select.value = desktop.soundSet || ''
    }).catch(function () { setStatus('refresh-status', '音效包读取失败') })
  }
  function refreshSkins() {
    return fetch('/whale/skins', { cache: 'no-store' }).then(function (r) { return r.json() }).then(function (data) {
      skinItems = data.items || []
      var select = byId('skin-select')
      select.textContent = ''
      skinItems.forEach(function (item) {
        var option = document.createElement('option')
        option.value = item.id
        option.textContent = item.name
        select.appendChild(option)
      })
      select.value = desktop.skinId || 'default'
    }).catch(function () { setStatus('refresh-status', '皮肤列表读取失败') })
  }
  byId('refresh-sounds').addEventListener('click', function () {
    refreshSounds().then(function () { bridge.refreshSound() })
  })
  byId('refresh-skins').addEventListener('click', function () {
    refreshSkins().then(function () { bridge.refreshSkin() })
  })

  function refreshStatistics() {
    setStatus('refresh-status', '正在刷新…')
    return Promise.allSettled([
      fetch('/whale/codex.json', { cache: 'no-store' }).then(function (r) { return r.json() }),
      fetch('/whale/usage', { cache: 'no-store' }).then(function (r) { return r.json() }),
      fetch('/whale/completions.json', { cache: 'no-store' }).then(function (r) { return r.json() }),
    ]).then(function (results) {
      var quota = results[0].status === 'fulfilled' ? results[0].value : null
      var windows = quota && quota.windows || {}
      var lines = []
      ;[['5 小时', windows.fiveHour], ['每周', windows.weekly]].forEach(function (pair) {
        if (pair[1]) lines.push(pair[0] + '：已用 ' + percent(pair[1].usedPercent) + ' · 剩余 ' + percent(pair[1].remainingPercent) + ' · ' + displayTime(pair[1].resetAt))
      })
      byId('quota-summary').textContent = lines.join('\n') || (quota && quota.message) || '尚未读到 Codex 额度'
      var usage = results[1].status === 'fulfilled' ? results[1].value : null
      if (usage && usage.browsers) {
        var chrome = usage.browsers.Chrome || {}
        var edge = usage.browsers.Edge || {}
        var spent = usage.codexUsage || {}
        byId('usage-summary').textContent = '6 Pro Chrome：今日 ' + (chrome.today || 0) + ' 次 · 本周 ' + (chrome.weekly || 0) + ' 次\n' +
          '6 Pro Edge：今日 ' + (edge.today || 0) + ' 次 · 本周 ' + (edge.weekly || 0) + ' 次\n' +
          '今日 Codex 额度消耗：5 小时 ' + percent(spent.fiveHour && spent.fiveHour.usedPercent || 0) + ' · 每周 ' + percent(spent.weekly && spent.weekly.usedPercent || 0)
      } else byId('usage-summary').textContent = '网页统计暂不可用'
      var completions = results[2].status === 'fulfilled' ? results[2].value : null
      var hosts = completions && completions.remoteHosts || {}
      var names = Object.keys(hosts)
      byId('remote-summary').textContent = names.length ? '远端：' + names.map(function (host) { return host + ' ' + hosts[host] }).join('；') : '远端：未配置'
      setStatus('refresh-status', '已更新')
    })
  }
  byId('refresh-usage').addEventListener('click', refreshStatistics)

  function refreshKeyStatus() {
    return fetch('/dsh-whale/config', { cache: 'no-store' }).then(function (r) { return r.json() }).then(function (data) {
      byId('api-key').placeholder = data.hasKey ? '已配置 ····' + (data.tail || '') : '未设置'
      setStatus('api-key-status', data.hasKey ? '已保存；填写新的 Key 可覆盖' : 'Codex 模式无需填写')
    }).catch(function () { setStatus('api-key-status', '状态读取失败') })
  }
  byId('save-api-key').addEventListener('click', function () {
    var input = byId('api-key')
    var value = input.value.trim()
    if (!value) { setStatus('api-key-status', '请先填写 API Key'); return }
    var button = this
    button.disabled = true
    setStatus('api-key-status', '正在保存…')
    fetch('/dsh-whale/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ DEEPSEEK_API_KEY: value }) })
      .then(function (r) { return r.json() })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || '保存失败')
        input.value = ''
        setStatus('api-key-status', '已保存')
        bridge.reloadWhale()
        refreshKeyStatus()
      }).catch(function (error) { setStatus('api-key-status', error.message || '保存失败') })
      .finally(function () { button.disabled = false })
  })

  bridge.onDesktopChanged(renderDesktop)
  bridge.onWidgetChanged(renderWidget)
  Promise.all([bridge.getDesktop(), bridge.getWidget()]).then(function (values) {
    renderDesktop(values[0])
    renderWidget(values[1])
    refreshSounds()
    refreshSkins()
  }).catch(function () { setStatus('refresh-status', '设置读取失败，请重新打开窗口') })
  refreshStatistics()
  refreshKeyStatus()
})()
