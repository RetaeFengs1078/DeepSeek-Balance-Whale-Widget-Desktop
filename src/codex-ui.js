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
  var skinSelect = null
  var selectedSkinId = 'default'
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
    selectedSkinId = settings && settings.skinId === 'portrait' ? 'portrait' : 'default'
    window.whaleSelectedSkin = selectedSkinId
    if (skinSelect) {
      skinSelect.value = selectedSkinId
      if (skinSelect.value !== selectedSkinId && window.whaleRefreshSkins) window.whaleRefreshSkins()
    }
    if (window.whaleSetSkin) window.whaleSetSkin(selectedSkinId)
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
  var usageStatus = null
  var latestUsage = null
  var latestAlmanac = null
  var bubblePage = -1
  var usageBubbleRequest = 0
  var almanacBubbleRequest = 0
  // 暂停完成气泡的点击跳转；保留提醒和后端能力，方便以后恢复。
  var completionNavigationEnabled = false
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
    if (!completionNavigationEnabled) return
    if (!activeCompletion || !window.__whale || !window.__whale.activateCompletion) return
    if (!click.target || !click.target.closest || !click.target.closest('.dshwv-bubble.dshwv-completion-open')) return
    window.__whale.activateCompletion(activeCompletion.id).catch(function () {})
  }, true)
  function refreshCompletions() {
    fetch('/whale/completions.json', { cache: 'no-store' })
      .then(function (response) { return response.json() })
      .then(function (data) {
        if (!data || !data.ok) return
        var events = data.events || []
        for (var i = 0; i < events.length; i++) {
          var item = events[i]
          if (!item || !item.id || knownCompletions[item.id]) continue
          knownCompletions[item.id] = true
          if (completionReady || Date.now() - item.time < 15000) {
            completionQueue.push(item)
            if (window.__whale && window.__whale.notifyEmailCompletion) window.__whale.notifyEmailCompletion(item.id)
          }
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
      var lines = []
      if (windows.fiveHour) lines.push('5 小时剩余 ' + pct(windows.fiveHour.remainingPercent))
      if (windows.weekly) lines.push('每周剩余 ' + pct(windows.weekly.remainingPercent))
      bubble.textContent = lines.join('\n')
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
  function refreshUsage() {
    return fetch('/whale/usage', { cache: 'no-store' })
      .then(function (response) { return response.json() })
      .then(function (data) {
        if (!data || !data.ok) return null
        latestUsage = data
        if (!usageStatus) return data
        var chrome = data.browsers && data.browsers.Chrome || {}
        var edge = data.browsers && data.browsers.Edge || {}
        var quota = data.codexUsage || {}
        var five = quota.fiveHour && quota.fiveHour.usedPercent || 0
        var week = quota.weekly && quota.weekly.usedPercent || 0
        usageStatus.textContent = '6 Pro Chrome：今日 ' + (chrome.today || 0) + ' / 本周 ' + (chrome.weekly || 0) +
          '\n6 Pro Edge：今日 ' + (edge.today || 0) + ' / 本周 ' + (edge.weekly || 0) +
          '\n今日 Codex 额度消耗：5h ' + pct(five) + ' · 周 ' + pct(week)
        return data
      }).catch(function () { return null })
  }
  function usageBubbleText(data) {
    if (!data || !data.browsers) return { counts: '读取中…', resets: '' }
    var counts = []
    var resets = []
    ;['Chrome', 'Edge'].forEach(function (name) {
      var browser = data.browsers[name] || {}
      var count = Number(browser.weekly)
      counts.push(name + '  ' + (Number.isFinite(count) ? Math.max(0, count) : 0) + ' 次')
      resets.push(name + '  ' + (browser.nextResetAt ? resetTime(browser.nextResetAt) : '重置时间未设置'))
    })
    var chromeReset = data.browsers.Chrome && data.browsers.Chrome.nextResetAt
    var edgeReset = data.browsers.Edge && data.browsers.Edge.nextResetAt
    if (chromeReset && chromeReset === edgeReset) resets = ['两端' + resetTime(chromeReset)]
    return { counts: counts.join('\n'), resets: resets.join('\n') }
  }
  function almanacBubbleText(data) {
    if (!data || !data.ok) return { label: '今日宜忌', yi: '读取中…', ji: '', full: '' }
    function short(items) {
      if (!Array.isArray(items) || !items.length) return '无'
      return items.slice(0, 2).join('、') + (items.length > 2 ? '等' : '')
    }
    return {
      label: data.date.slice(5).replace('-', '/') + ' · 今日宜忌',
      yi: '宜 ' + short(data.yi),
      ji: '忌 ' + short(data.ji),
      full: data.date + ' ' + data.lunar + '\n宜 ' + (data.yi || []).join('、') + '\n忌 ' + (data.ji || []).join('、'),
    }
  }
  function showUsagePage() {
    var request = ++usageBubbleRequest
    window.whaleShowUsage(usageBubbleText(latestUsage))
    refreshUsage().then(function (data) {
      if (request !== usageBubbleRequest) return
      if (bubblePage !== 1) return
      if (!document.querySelector('.dshwv-bubble-open.dshwv-usage-open')) return
      window.whaleShowUsage(data ? usageBubbleText(data) : { counts: '统计读取失败', resets: '请稍后再试' })
    })
  }
  function showAlmanacPage() {
    var request = ++almanacBubbleRequest
    var now = new Date()
    var today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-')
    window.whaleShowAlmanac(almanacBubbleText(latestAlmanac && latestAlmanac.date === today ? latestAlmanac : null))
    fetch('/whale/almanac', { cache: 'no-store' })
      .then(function (response) { return response.json() })
      .then(function (data) {
        if (data && data.ok) latestAlmanac = data
        if (request !== almanacBubbleRequest || bubblePage !== 2) return
        if (document.querySelector('.dshwv-bubble-open.dshwv-almanac-open')) {
          window.whaleShowAlmanac(data && data.ok ? almanacBubbleText(data) : { label: '今日宜忌', yi: '读取失败', ji: '请稍后再试' })
        }
      }).catch(function () {
        if (request === almanacBubbleRequest && bubblePage === 2) {
          window.whaleShowAlmanac({ label: '今日宜忌', yi: '读取失败', ji: '请稍后再试' })
        }
      })
  }
  function advanceBubble(fromBubble) {
    if (bubblePage < 0) return false
    if (bubblePage === 0) { bubblePage = 1; showUsagePage(); return true }
    if (bubblePage === 1) { bubblePage = 2; showAlmanacPage(); return true }
    bubblePage = 0
    if (fromBubble && window.whaleShowQuota) { window.whaleShowQuota(); return true }
    return false
  }
  window.whaleOnBubbleShown = function () { bubblePage = 0 }
  window.whaleOnBubbleHidden = function () {
    bubblePage = -1
    usageBubbleRequest++
    almanacBubbleRequest++
  }
  window.whaleOnTap = function () { return advanceBubble(false) }
  window.whaleOnBubbleClick = function () { return advanceBubble(true) }
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

    refreshUsage()

    if (window.__whale && window.__whale.patchSettings) {
      var skinRow = document.createElement('div')
      skinRow.className = 'dshwv-menu-row codex-ext'
      var skinLabel = document.createElement('span')
      skinLabel.textContent = '更换皮肤'
      skinSelect = document.createElement('select')
      skinSelect.setAttribute('aria-label', '更换小鲸鱼皮肤')
      skinSelect.style.cssText = 'flex:1;min-width:0;font-size:11px;color:#203170;border:1px solid #9daac9;border-radius:5px;padding:2px;background:white'
      skinRow.appendChild(skinLabel)
      skinRow.appendChild(skinSelect)
      skinRow.addEventListener('click', function (event) { event.stopPropagation() })
      menu.appendChild(skinRow)

      function refreshSkins() {
        return fetch('/whale/skins', { cache: 'no-store' })
          .then(function (response) { return response.json() })
          .then(function (data) {
            if (!data || !data.ok || !Array.isArray(data.items)) return
            skinSelect.textContent = ''
            data.items.forEach(function (item) {
              var option = document.createElement('option')
              option.value = item.id
              option.textContent = item.name
              skinSelect.appendChild(option)
            })
            var available = data.items.some(function (item) { return item.id === selectedSkinId })
            if (!available) {
              selectedSkinId = 'default'
              window.whaleSelectedSkin = 'default'
              if (window.whaleSetSkin) window.whaleSetSkin('default')
              window.__whale.patchSettings({ skinId: 'default' }).catch(function () {})
            }
            skinSelect.value = selectedSkinId
          }).catch(function () {})
      }
      window.whaleRefreshSkins = refreshSkins
      skinSelect.addEventListener('change', function (event) {
        event.stopPropagation()
        var previous = selectedSkinId
        selectedSkinId = skinSelect.value
        window.whaleSelectedSkin = selectedSkinId
        if (window.whaleSetSkin) window.whaleSetSkin(selectedSkinId)
        window.__whale.patchSettings({ skinId: selectedSkinId }).then(applySettings).catch(function () {
          selectedSkinId = previous
          skinSelect.value = previous
          if (window.whaleSetSkin) window.whaleSetSkin(previous)
        })
      })

      refreshSkins()
    }

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
    startupToggle = settingRow('开机自启动', 'autoStart')
    var moreRow = document.createElement('div')
    moreRow.className = 'dshwv-menu-row codex-ext'
    var moreButton = document.createElement('button')
    moreButton.type = 'button'
    moreButton.className = 'dshwv-sound'
    moreButton.textContent = '详细设置…'
    moreButton.addEventListener('click', function (event) {
      event.stopPropagation()
      if (window.whaleCloseMenu) window.whaleCloseMenu()
      window.__whale.openSettings().catch(function () {})
    })
    moreRow.appendChild(moreButton)
    menu.appendChild(moreRow)
    window.__whale.getSettings().then(applySettings).catch(function () {})
  }, 300)

  refresh()
  refreshCompletions()
  setInterval(refreshCompletions, 3000)
  setInterval(refresh, 60000)
  setInterval(refreshUsage, 60000)
})()
