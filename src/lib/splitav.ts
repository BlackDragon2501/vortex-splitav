// Vortex Split AV - Corta y une video/audio con FFmpeg.wasm (motor local).
// El runtime UMD vive en public/ffmpeg/ y se sirve desde la propia app:
// ningún archivo viaja por internet.

export interface AvFile {
  id: string
  file: File
  url: string
  kind: 'video' | 'audio' | 'other'
  duration: number
}

export interface Range {
  id: string
  start: number
  end: number
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function detectKind(file: File): AvFile['kind'] {
  if (/^video\//.test(file.type) || /\.(mp4|webm|mov|m4v|mkv|avi)$/i.test(file.name)) return 'video'
  if (/^audio\//.test(file.type) || /\.(mp3|m4a|wav|aac|ogg|flac|opus)$/i.test(file.name)) return 'audio'
  return 'other'
}

/** segundos -> "hh:mm:ss.mmm" */
export function fmtTime(sec: number): string {
  const s = Math.max(0, sec)
  const h = Math.floor(s / 3600)
  const mi = Math.floor((s % 3600) / 60)
  const ss = Math.floor(s % 60)
  const ms = Math.round((s - Math.floor(s)) * 1000)
  const p2 = (n: number) => String(n).padStart(2, '0')
  return h > 0
    ? `${p2(h)}:${p2(mi)}:${p2(ss)}.${String(ms).padStart(3, '0')}`
    : `${p2(mi)}:${p2(ss)}.${String(ms).padStart(3, '0')}`
}

/** "mm:ss.mmm" | "hh:mm:ss.mmm" | segundos -> número */
export function parseTime(tc: string): number {
  const t = tc.trim().replace(',', '.')
  const parts = t.split(':')
  let n = 0
  for (const p of parts) n = n * 60 + (parseFloat(p) || 0)
  return n
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// ---------- FFmpeg (UMD en public/ffmpeg) ----------

export interface FfmpegLike {
  load(opts: { coreURL: string; wasmURL: string }): Promise<boolean>
  exec(args: string[]): Promise<number>
  terminate(): Promise<void>
  on(event: 'progress', cb: (e: { progress: number; time: number }) => void): void
  on(event: 'log', cb: (e: { type: string; message: string }) => void): void
}

declare global {
  interface Window {
    FFmpegWASM?: { FFmpeg: new () => FfmpegLike }
  }
}

interface FfmpegHandlers {
  log?: (line: string) => void
  progress?: (ratio: number) => void
}

const handlers: FfmpegHandlers = {}

/** registra los callbacks de log/progreso que usará la instancia singleton */
export function setFfmpegHandlers(h: FfmpegHandlers) {
  Object.assign(handlers, h)
}

let scriptLoaded = false
let instance: FfmpegLike | null = null

/** obtiene (o crea una única vez) la instancia de FFmpeg con el core local */
export async function ensureFFmpeg(): Promise<FfmpegLike> {
  if (instance) return instance
  if (!scriptLoaded) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script')
      s.src = '/ffmpeg/ffmpeg.js'
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('No pude cargar el motor FFmpeg local'))
      document.head.appendChild(s)
    })
    scriptLoaded = true
  }
  const FF = new window.FFmpegWASM!.FFmpeg()
  FF.on('log', (e) => handlers.log?.(e.message))
  FF.on('progress', (e) => handlers.progress?.(e.progress))
  await FF.load({
    coreURL: '/ffmpeg/ffmpeg-core.js',
    wasmURL: '/ffmpeg/ffmpeg-core.wasm',
  })
  instance = FF
  return FF
}

/** escribe el archivo en el FS virtual de FFmpeg */
export async function writeFileToFs(
  ff: FfmpegLike,
  file: File,
  virtualName: string
): Promise<void> {
  const data = new Uint8Array(await file.arrayBuffer())
  // la clase UMD expone writeFile vía exec interno; usamos el método público
  ;(ff as unknown as { writeFile(n: string, d: Uint8Array): Promise<boolean> }).writeFile(
    virtualName,
    data
  )
}

export function readFileFromFs(
  ff: FfmpegLike,
  virtualName: string
): Promise<Uint8Array> {
  return (
    ff as unknown as { readFile(n: string): Promise<Uint8Array> }
  ).readFile(virtualName)
}

export function deleteFromFs(ff: FfmpegLike, virtualName: string): Promise<boolean> {
  return (
    ff as unknown as { deleteFile(n: string): Promise<boolean> }
  ).deleteFile(virtualName)
}

/** comando para cortar un rango */
export function cutArgs(
  virtualName: string,
  outName: string,
  start: number,
  duration: number,
  reencode: boolean
): string[] {
  if (reencode) {
    return ['-ss', fmtTime(start), '-i', virtualName, '-t', duration.toFixed(3), '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', outName]
  }
  return ['-ss', fmtTime(start), '-i', virtualName, '-t', duration.toFixed(3), '-c', 'copy', outName]
}

/** comando para unir varios archivos con concat demuxer */
export function mergeArgs(listName: string, outName: string, reencode: boolean): string[] {
  if (reencode) {
    return ['-f', 'concat', '-safe', '0', '-i', listName, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', outName]
  }
  return ['-f', 'concat', '-safe', '0', '-i', listName, '-c', 'copy', outName]
}

export function buildConcatList(entries: string[]): string {
  return entries.map((n) => `file '${n}'`).join('\n') + '\n'
}

export function extOf(name: string): string {
  const m = name.match(/\.([a-zA-Z0-9]+)$/)
  return m ? m[1].toLowerCase() : 'mp4'
}

export function outCutName(original: string, index: number, ext: string): string {
  const base = original.replace(/\.[^.]+$/, '') || 'clip'
  return `${base}-parte${index}.${ext}`
}

export function downloadBytes(data: Uint8Array, name: string, mime: string) {
  const blob = new Blob([data.slice().buffer as ArrayBuffer], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function mimeOf(ext: string): string {
  if (['mp4', 'm4v', 'mov'].includes(ext)) return 'video/mp4'
  if (ext === 'webm') return 'video/webm'
  if (['mp3'].includes(ext)) return 'audio/mpeg'
  if (['m4a', 'aac'].includes(ext)) return 'audio/mp4'
  if (ext === 'wav') return 'audio/wav'
  if (['ogg', 'opus'].includes(ext)) return 'audio/ogg'
  if (ext === 'flac') return 'audio/flac'
  return 'application/octet-stream'
}
