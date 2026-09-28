;(function () {
  'use strict'
  if (!window.__whale || !window.__whale.desktop) return
  var attempts = 0
  var timer = setInterval(function () {
    var menu = document.querySelector('.dshwv-menu')
    if (!menu && ++attempts < 100) return
    clearInterval(timer)
    if (menu) inject(menu)
  }, 300)

  function inject(menu) {
    if (menu.querySelector('.whale-ext')) return
    var separator = document.createElement('div')
    separator.className = 'dshwv-menu-sep whale-ext'
    var row = document.createElement('div')
    row.className = 'dshwv-menu-row whale-ext'
    var label = document.createElement('span')
    label.textContent = '音效包'
    var select = document.createElement('select')
    select.className = 'dshwv-sound'
    select.style.cssText = 'flex:1;min-width:0'
    row.appendChild(label)
    row.appendChild(select)
    row.addEventListener('click', function (event) { event.stopPropagation() })
    menu.appendChild(separator)
    menu.appendChild(row)
    var modeRow = document.createElement('div')
    modeRow.className = 'dshwv-menu-row whale-ext'
    var modeLabel = document.createElement('span')
    modeLabel.textContent = '播放方式'
    var modeSelect = document.createElement('select')
    modeSelect.className = 'dshwv-sound'
    modeSelect.style.cssText = 'flex:1;min-width:0'
    ;[['cycle', '顺序循环'], ['random', '随机播放']].forEach(function (entry) {
      var option = document.createElement('option')
      option.value = entry[0]
      option.textContent = entry[1]
      modeSelect.appendChild(option)
    })
    modeRow.appendChild(modeLabel)
    modeRow.appendChild(modeSelect)
    modeRow.addEventListener('click', function (event) { event.stopPropagation() })
    menu.appendChild(modeRow)

    var soundItems = []
    function updateModeEnabled() {
      var selected = soundItems.find(function (item) { return item.id === select.value })
      modeSelect.disabled = !selected || !selected.tracks || selected.tracks.length < 2
    }

    function rebuildAudio() {
      var selects = menu.querySelectorAll('select')
      for (var i = 0; i < selects.length; i++) {
        if (selects[i] !== select && selects[i].querySelector('option[value="duck"]')) {
          selects[i].dispatchEvent(new Event('change'))
          return
        }
      }
    }
    function refreshSounds() {
      return fetch('/dsh-whale/sounds', { cache: 'no-store' })
        .then(function (response) { return response.json() })
        .then(function (data) {
          select.textContent = ''
          var builtIn = document.createElement('option')
          builtIn.value = ''
          builtIn.textContent = '内置音效'
          select.appendChild(builtIn)
          soundItems = data.items || []
          soundItems.forEach(function (item) {
            var option = document.createElement('option')
            option.value = item.id
            option.textContent = item.name + (item.tracks.length > 1 ? '（' + item.tracks.length + ' 段）' : '')
            select.appendChild(option)
          })
          select.value = window.__whaleCustomSound || ''
          updateModeEnabled()
          return soundItems
        }).catch(function () { return [] })
    }
    window.whaleRefreshSounds = refreshSounds

    select.addEventListener('change', function (event) {
      event.stopPropagation()
      window.__whaleCustomSound = select.value
      window.__whale.patchSettings({ soundSet: select.value }).catch(function () {})
      rebuildAudio()
      updateModeEnabled()
    })
    modeSelect.addEventListener('change', function (event) {
      event.stopPropagation()
      window.__whaleSoundMode = modeSelect.value
      window.__whale.patchSettings({ soundMode: modeSelect.value }).catch(function () {})
    })
    function applySettings(settings) {
      var next = settings && settings.soundSet || ''
      window.__whaleSoundMode = settings && settings.soundMode || 'cycle'
      modeSelect.value = window.__whaleSoundMode
      if (window.__whaleCustomSound !== next) {
        window.__whaleCustomSound = next
        select.value = next
        if (select.value !== next) refreshSounds()
        rebuildAudio()
      }
      updateModeEnabled()
    }
    window.__whale.getSettings().then(function (settings) {
      window.__whaleCustomSound = settings && settings.soundSet || ''
      window.__whaleSoundMode = settings && settings.soundMode || 'cycle'
      modeSelect.value = window.__whaleSoundMode
      return refreshSounds()
    }).then(function () {
      if (window.__whaleCustomSound) rebuildAudio()
    }).catch(function () {})
    if (window.__whale.onSettingsChanged) window.__whale.onSettingsChanged(applySettings)
  }
})()
