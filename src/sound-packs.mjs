import fs from 'node:fs'
import path from 'node:path'

export const SOUND_EXT = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.opus', '.webm'])

function splitSoundName(name) {
  const ext = path.extname(name).toLowerCase()
  if (!SOUND_EXT.has(ext)) return null
  const stem = path.basename(name, ext)
  const match = /(?:[_\-\s])?(press|release|down|up|按下|松手|按|松)$/i.exec(stem)
  if (!match) return { key: stem, kind: 'any' }
  const key = stem.slice(0, match.index).replace(/[_\-\s]+$/, '') || stem
  const kind = /^(press|down|按下|按)$/i.test(match[1]) ? 'press' : 'release'
  return { key, kind }
}

function tracksFromFiles(files, folder = '') {
  const tracks = new Map()
  for (const name of files) {
    const part = splitSoundName(name)
    if (!part) continue
    if (!tracks.has(part.key)) tracks.set(part.key, { id: part.key, press: null, release: null, any: null })
    const track = tracks.get(part.key)
    if (!track[part.kind]) track[part.kind] = folder ? path.join(folder, name) : name
  }
  return [...tracks.values()].sort((a, b) => a.id.localeCompare(b.id, 'zh', { numeric: true }))
}

export function scanSoundPacks(soundsDir) {
  let entries
  try { entries = fs.readdirSync(soundsDir, { withFileTypes: true }) } catch { return [] }
  const packs = tracksFromFiles(entries.filter(entry => entry.isFile()).map(entry => entry.name))
    .map(track => ({ id: track.id, name: track.id, tracks: [track] }))
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    let files
    try {
      files = fs.readdirSync(path.join(soundsDir, entry.name), { withFileTypes: true })
        .filter(file => file.isFile()).map(file => file.name)
    } catch { continue }
    const tracks = tracksFromFiles(files, entry.name)
    if (tracks.length) packs.push({ id: 'dir:' + entry.name, name: entry.name, tracks })
  }
  return packs.sort((a, b) => a.name.localeCompare(b.name, 'zh', { numeric: true }))
}

export function createSoundPicker(random = Math.random) {
  const cursors = new Map()
  const events = new Map()
  return function pick(pack, eventId, mode = 'cycle') {
    if (!pack || !pack.tracks.length) return null
    if (!eventId) return pack.tracks[0]
    const eventKey = pack.id + ':' + eventId
    if (events.has(eventKey)) return pack.tracks[events.get(eventKey) % pack.tracks.length]
    let index
    if (mode === 'random') {
      index = Math.floor(random() * pack.tracks.length)
    } else {
      index = cursors.get(pack.id) || 0
      cursors.set(pack.id, (index + 1) % pack.tracks.length)
    }
    events.set(eventKey, index)
    if (events.size > 256) events.delete(events.keys().next().value)
    return pack.tracks[index]
  }
}
