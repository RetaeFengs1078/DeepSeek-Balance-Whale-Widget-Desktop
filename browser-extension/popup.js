const status = document.getElementById('status')
function request(type) {
  status.textContent = type === 'test' ? '正在发送测试提醒…' : '正在检查连接…'
  chrome.runtime.sendMessage({ type }, result => {
    if (chrome.runtime.lastError || !result || !result.ok) {
      status.textContent = (result && result.error) || '连接失败，请先启动小鲸鱼。'
      return
    }
    status.textContent = type === 'test' ? '已发送，请看小鲸鱼气泡。' : '已连接本机小鲸鱼。'
  })
}
document.getElementById('check').addEventListener('click', () => request('ping'))
document.getElementById('test').addEventListener('click', () => request('test'))
request('ping')
