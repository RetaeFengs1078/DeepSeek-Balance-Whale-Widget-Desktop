// 今日黄历由随程序分发的 lunar-javascript 计算，不依赖网络或用户账号。
import lunar from '../vendor/lunar-javascript/index.js'

export function getAlmanac(date = new Date()) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new TypeError('日期无效')
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const lunarDay = lunar.Solar.fromYmd(year, month, day).getLunar()
  return {
    ok: true,
    date: [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-'),
    lunar: '农历' + lunarDay.getMonthInChinese() + '月' + lunarDay.getDayInChinese(),
    yi: lunarDay.getDayYi(),
    ji: lunarDay.getDayJi(),
    source: 'lunar-javascript 1.7.7',
  }
}
