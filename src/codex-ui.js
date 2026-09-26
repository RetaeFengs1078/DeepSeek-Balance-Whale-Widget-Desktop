// Codex 信息层与上游鲸鱼脚本解耦。鲸鱼 DOM 只用于定位和扩展菜单。
;(function () {
  'use strict'
  var panel = document.createElement('div')
  panel.id = 'codex-quota'
  panel.setAttribute('aria-live', 'polite')
  panel.innerHTML = '<div class="codex-title">Codex 额度</div><div class="codex-content">正在读取本地会话…</div>'
  panel.hidden = true
  document.body.appendChild(panel)

  var panelToggle = null
  var startupToggle = null
  var appLaunchToggle = null
  function applySettings(settings) {
    var show = !!(settings && settings.showQuotaPanel)
    panel.hidden = !show
    if (panelToggle) panelToggle.checked = show
    if (startupToggle) startupToggle.checked = !!(settings && settings.autoStart)
    if (appLaunchToggle) {
      appLaunchToggle.checked = !!(settings && settings.launchWithApps) && !(settings && settings.autoStart)
      appLaunchToggle.disabled = !!(settings && settings.autoStart)
      appLaunchToggle.title = appLaunchToggle.disabled ? '开机自启动已开启' : ''
    }
  }
  if (window.__whale && window.__whale.getSettings) {
    window.__whale.getSettings().then(applySettings).catch(function () {})
    if (window.__whale.onSettingsChanged) window.__whale.onSettingsChanged(applySettings)
  }

  function pct(value) { return Number(value).toFixed(Number.isInteger(value) ? 0 : 1) + '%' }
  function resetTime(value) {
    if (!value) return '重置时间未知'
    var date = new Date(value)
    if (!Number.isFinite(date.getTime())) return '重置时间未知'
    return '重置 ' + new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(date)
  }
  function row(label, item) {
    if (!item) return ''
    return '<div class="codex-row"><span>' + label + '</span><strong>已用 ' + pct(item.usedPercent) +
      ' · 剩余 ' + pct(item.remainingPercent) + '</strong></div><div class="codex-reset">' + resetTime(item.resetAt) + '</div>'
  }
  var latest = null
  var hasDeepSeekKey = false
  var busy = false
  var completionQueue = []
  var knownCompletions = {}
  var completionReady = false
  var showingCompletion = false
  var activeCompletion = null
  var remoteStatus = null
  function showNextCompletion() {
    if (showingCompletion || !completionQueue.length) return
    if (typeof window.whaleShowCompletion !== 'function') {
      setTimeout(showNextCompletion, 300)
      return
    }
    showingCompletion = true
    var event = completionQueue.shift()
    activeCompletion = event
    window.whaleShowCompletion(event)
    setTimeout(function () {
      showingCompletion = false
      if (activeCompletion === event) activeCompletion = null
      setTimeout(showNextCompletion, 200)
    }, 8500)
  }
  document.addEventListener('click', function (click) {
    if (!activeCompletion || !window.__whale || !window.__whale.activateCompletion) return
    if (!click.target || !click.target.closest || !click.target.closest('.dshwv-bubble.dshwv-completion-open')) return
    window.__whale.activateCompletion(activeCompletion.id).catch(function () {})
  }, true)
  function refreshCompletions() {
    fetch('/whale/completions.json', { cache: 'no-store' })
      .then(function (response) { return response.json() })
      .then(function (data) {
        if (!data || !data.ok) return
        if (remoteStatus) {
          var hosts = data.remoteHosts || {}
          var names = Object.keys(hosts)
          remoteStatus.textContent = names.length ? '远端：' + names.map(function (host) { return host + ' ' + hosts[host] }).join('；') : '远端：未配置'
        }
        var events = data.events || []
        for (var i = 0; i < events.length; i++) {
          var item = events[i]
          if (!item || !item.id || knownCompletions[item.id]) continue
          knownCompletions[item.id] = true
          if (completionReady || Date.now() - item.time < 15000) completionQueue.push(item)
        }
        completionReady = true
        showNextCompletion()
      }).catch(function () {})
  }
  function paint(data) {
    var content = panel.querySelector('.codex-content')
    if (!content) return
    if (!data || !data.ok) { content.textContent = data && data.message || '读取 Codex 额度失败'; return }
    var windows = data.windows || {}
    if (!windows.fiveHour && !windows.weekly) { content.textContent = data.message || '尚无额度快照'; return }
    content.innerHTML = row('5 小时', windows.fiveHour) + row('每周', windows.weekly)
    var bubble = document.querySelector('.codex-bubble')
    if (bubble) {
      var summary = windows.fiveHour || windows.weekly
      bubble.textContent = (windows.fiveHour ? '5 小时' : '每周') + '剩余 ' + pct(summary.remainingPercent)
    }
  }
  function refresh() {
    if (busy) return
    busy = true
    fetch('/whale/codex.json', { cache: 'no-store' })
      .then(function (response) { return response.json() })
      .then(function (data) { latest = data; paint(data) })
      .catch(function () { paint({ ok: false, message: '读取 Codex 额度失败' }) })
      .finally(function () { busy = false })
  }
  window.whaleRefreshCodex = refresh

  fetch('/dsh-whale/config', { cache: 'no-store' })
    .then(function (response) { return response.json() })
    .then(function (data) {
      hasDeepSeekKey = !!data.hasKey
      if (!hasDeepSeekKey) document.documentElement.classList.add('codex-only')
    }).catch(function () { document.documentElement.classList.add('codex-only') })

  function position() {
    var image = document.querySelector('.dshwv-img')
    if (!image) return
    var bubbleBox = document.querySelector('.dshwv-bubble')
    if (bubbleBox && !bubbleBox.querySelector('.codex-bubble')) {
      var bubbleText = document.createElement('div')
      bubbleText.className = 'codex-bubble'
      bubbleText.textContent = 'Codex 额度'
      bubbleBox.appendChild(bubbleText)
      if (latest) paint(latest)
    }
    var rect = image.getBoundingClientRect()
    if (rect.width <= 0) return
    if (panel.hidden) return
    var width = panel.offsetWidth
    var height = panel.offsetHeight
    panel.style.left = Math.round(Math.max(8, Math.min(innerWidth - width - 8, rect.left + rect.width / 2 - width / 2))) + 'px'
    var above = rect.top - height - 8
    panel.style.top = Math.round(above >= 8 ? above : Math.min(innerHeight - height - 8, rect.bottom + 8)) + 'px'
    panel.style.visibility = 'visible'
    if (window.whaleReportState) window.whaleReportState()
  }
  setInterval(position, 300)
  window.addEventListener('resize', position)

  // 点击鲸鱼原有的手动刷新同时刷新 Codex；菜单里另有明确的刷新入口。
  document.addEventListener('click', function (event) {
    if (event.target && event.target.closest && event.target.closest('.dshwv-img')) refresh()
  }, true)
  var attempts = 0
  var menuTimer = setInterval(function () {
    var menu = document.querySelector('.dshwv-menu')
    if (!menu && ++attempts < 100) return
    clearInterval(menuTimer)
    if (!menu) return
    var separator = document.createElement('div')
    separator.className = 'dshwv-menu-sep codex-ext'
    var rowElement = document.createElement('div')
    rowElement.className = 'dshwv-menu-row codex-ext'
    var label = document.createElement('span')
    label.textContent = 'Codex 额度'
    var button = document.createElement('button')
    button.type = 'button'
    button.className = 'dshwv-sound'
    button.textContent = '立即刷新'
    button.addEventListener('click', function (event) { event.stopPropagation(); refresh() })
    rowElement.appendChild(label)
    rowElement.appendChild(button)
    menu.appendChild(separator)
    menu.appendChild(rowElement)

    var statusRow = document.createElement('div')
    statusRow.className = 'dshwv-menu-row codex-ext'
    remoteStatus = document.createElement('span')
    remoteStatus.style.cssText = 'font-size:11px;color:#6b7ba6;white-space:normal'
    remoteStatus.textContent = '远端：检查中…'
    statusRow.appendChild(remoteStatus)
    menu.appendChild(statusRow)

    if (!window.__whale || !window.__whale.patchSettings) return
    function settingRow(text, field) {
      var row = document.createElement('label')
      row.className = 'dshwv-menu-row codex-ext'
      var checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.className = 'dshwv-check'
      var caption = document.createElement('span')
      caption.textContent = text
      row.appendChild(checkbox)
      row.appendChild(caption)
      row.addEventListener('click', function (event) { event.stopPropagation() })
      menu.appendChild(row)
      checkbox.addEventListener('change', function (event) {
        event.stopPropagation()
        window.__whale.patchSettings({ [field]: checkbox.checked })
          .then(applySettings).catch(function () { checkbox.checked = !checkbox.checked })
      })
      return checkbox
    }
    panelToggle = settingRow('常显额度面板', 'showQuotaPanel')
    startupToggle = settingRow('开机自启动', 'autoStart')
    appLaunchToggle = settingRow('打开 VS Code/ChatGPT 时启动', 'launchWithApps')
    window.__whale.getSettings().then(applySettings).catch(function () {})
  }, 300)

  refresh()
  refreshCompletions()
  setInterval(refreshCompletions, 3000)
  setInterval(refresh, 60000)
})()
