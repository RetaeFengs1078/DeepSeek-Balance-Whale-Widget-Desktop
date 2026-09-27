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
          ;(data.items || []).forEach(function (item) {
            var option = document.createElement('option')
            option.value = item.id
            option.textContent = item.name
            select.appendChild(option)
          })
          select.value = window.__whaleCustomSound || ''
          return data.items || []
        }).catch(function () { return [] })
    }
    window.whaleRefreshSounds = refreshSounds

    select.addEventListener('change', function (event) {
      event.stopPropagation()
      window.__whaleCustomSound = select.value
      window.__whale.patchSettings({ soundSet: select.value }).catch(function () {})
      rebuildAudio()
    })
    function applySettings(settings) {
      var next = settings && settings.soundSet || ''
      if (window.__whaleCustomSound !== next) {
        window.__whaleCustomSound = next
        select.value = next
        if (select.value !== next) refreshSounds()
        rebuildAudio()
      }
    }
    window.__whale.getSettings().then(function (settings) {
      window.__whaleCustomSound = settings && settings.soundSet || ''
      return refreshSounds()
    }).then(function () {
      if (window.__whaleCustomSound) rebuildAudio()
    }).catch(function () {})
    if (window.__whale.onSettingsChanged) window.__whale.onSettingsChanged(applySettings)
  }
})()
