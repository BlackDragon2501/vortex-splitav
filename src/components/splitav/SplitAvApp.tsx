'use client'

// Vortex Split AV - Corta y une video/audio por rangos exactos con FFmpeg.wasm.
// El motor corre en un worker dentro del navegador: los archivos nunca se suben.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Scissors,
  Combine,
  Upload,
  Play,
  Pause,
  Loader2,
  Download,
  X,
  Trash2,
  ArrowUp,
  ArrowDown,
  Flag,
  FlagTriangleRight,
  Circle,
  Terminal,
  RefreshCw,
} from 'lucide-react'
import {
  AvFile,
  Range,
  buildConcatList,
  cutArgs,
  deleteFromFs,
  detectKind,
  downloadBytes,
  ensureFFmpeg,
  extOf,
  fmtBytes,
  fmtTime,
  mergeArgs,
  mimeOf,
  newId,
  outCutName,
  parseTime,
  readFileFromFs,
  setFfmpegHandlers,
  writeFileToFs,
} from '@/lib/splitav'

const SUPPORT_EMAIL = 'vortexmusic.soporte.app@gmail.com'
const ACCENT = '#8b5cf6'
const ACCENT2 = '#a78bfa'

function VortexLogo({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <rect width="48" height="48" rx="10" fill="#161616" />
      <circle cx="24" cy="24" r="17" fill="none" stroke={ACCENT} strokeWidth="3.5" />
      <path d="M24 10a14 14 0 1 1-9.9 4.1" fill="none" stroke={ACCENT2} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M24 17a7 7 0 1 0 7 7" fill="none" stroke={ACCENT2} strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="24" cy="24" r="3" fill={ACCENT2} />
    </svg>
  )
}

function Footer() {
  return (
    <footer className="mt-auto border-t border-[#2b2b31] bg-[#141416] px-6 py-4">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-1 text-center">
        <p className="text-[11px] text-[#9b9ba4]">
          Vórtex Split AV · Derechos Reservados © 2026 Vortex Company ·{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[#a78bfa] hover:underline">
            {SUPPORT_EMAIL}
          </a>
        </p>
        <p className="text-[11px] text-[#9b9ba4]">Gratis · Sin anuncios · 100% local en tu navegador</p>
      </div>
    </footer>
  )
}

const btn =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#2b2b31] bg-[#1e1e22] px-3 py-2 text-xs font-medium text-[#ececf1] hover:bg-[#26262b] disabled:opacity-40 disabled:cursor-not-allowed transition-colors'

const btnAccent =
  'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-[#0f0f10] transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-[#8b5cf6] hover:bg-[#a78bfa]'

const input =
  'rounded-lg border border-[#2b2b31] bg-[#0f0f10] px-2 py-1.5 font-mono text-xs text-[#ececf1] outline-none focus:border-[#8b5cf6]'

type Mode = 'cut' | 'merge'

interface ResultItem {
  name: string
  url: string
  size: number
}

export default function SplitAvApp() {
  const [files, setFiles] = useState<AvFile[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('cut')
  const [ranges, setRanges] = useState<Range[]>([])
  const [reencode, setReencode] = useState(false)
  const [engineState, setEngineState] = useState<'idle' | 'loading' | 'ready'>('idle')
  const [engineMsg, setEngineMsg] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<ResultItem[]>([])
  const [log, setLog] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [cursor, setCursor] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const logRef = useRef<HTMLTextAreaElement>(null)

  const selected = files.find((f) => f.id === selectedId) ?? null

  useEffect(() => {
    return () => {
      files.forEach((f) => URL.revokeObjectURL(f.url))
      results.forEach((r) => URL.revokeObjectURL(r.url))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addFiles = useCallback((list: FileList | null) => {
    if (!list) return
    const added: AvFile[] = []
    for (const f of Array.from(list)) {
      const kind = detectKind(f)
      if (kind === 'other') continue
      added.push({ id: newId(), file: f, url: URL.createObjectURL(f), kind, duration: 0 })
    }
    if (!added.length) return
    setFiles((prev) => {
      const next = [...prev, ...added]
      if (!selectedId && next.length) setSelectedId(next[0].id)
      return next
    })
  }, [selectedId])

  const loadEngine = useCallback(async () => {
    if (engineState !== 'idle') return
    setEngineState('loading')
    setEngineMsg('Descargando el motor…')
    try {
      setFfmpegHandlers({
        log: (line) => {
          setLog((l) => (l + '\n' + line).slice(-4000))
        },
        progress: (r) => setEngineMsg(`Cargando motor: ${Math.round(r * 100)}%`),
      })
      await ensureFFmpeg()
      setEngineState('ready')
      setEngineMsg('')
      setLog('')
    } catch (e) {
      setEngineState('idle')
      setEngineMsg(e instanceof Error ? e.message : 'Error al cargar el motor')
    }
  }, [engineState])

  const ensureEngine = useCallback(async () => {
    if (engineState === 'ready') return
    await loadEngine()
    setEngineState('ready')
  }, [engineState, loadEngine])

  const duration = selected?.duration ?? 0

  const addRange = () => {
    const s = cursor
    const e = Math.min(duration, s + 10)
    setRanges((prev) => [...prev, { id: newId(), start: Math.min(s, e), end: Math.max(s, e) }])
  }

  const updateRange = (id: string, patch: Partial<Range>) =>
    setRanges((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const runCut = useCallback(async () => {
    if (!selected || !ranges.length || busy) return
    setBusy(true)
    setResults((prev) => {
      prev.forEach((r) => URL.revokeObjectURL(r.url))
      return []
    })
    try {
      setFfmpegHandlers({
        log: (line) => {
          setLog((l) => (l + '\n' + line).slice(-4000))
          requestAnimationFrame(() => logRef.current?.scrollTo({ top: 999999 }))
        },
        progress: (r) => setProgress(r),
      })
      const ff = await ensureFFmpeg()
      const vname = `in.${extOf(selected.file.name)}`
      await writeFileToFs(ff, selected.file, vname)
      const outs: ResultItem[] = []
      for (let i = 0; i < ranges.length; i++) {
        const rg = ranges[i]
        const dur = Math.max(0.05, rg.end - rg.start)
        const ext = reencode ? 'mp4' : extOf(selected.file.name)
        const out = `out${i}.${ext}`
        setProgress(0)
        const code = await ff.exec(cutArgs(vname, out, rg.start, dur, reencode))
        if (code !== 0) throw new Error(`FFmpeg devolvió código ${code} en el rango ${i + 1}`)
        const data = await readFileFromFs(ff, out)
        await deleteFromFs(ff, out)
        const blob = new Blob([data.slice().buffer as ArrayBuffer], { type: mimeOf(ext) })
        outs.push({ name: outCutName(selected.file.name, i + 1, ext), url: URL.createObjectURL(blob), size: blob.size })
        setResults([...outs])
      }
      await deleteFromFs(ff, vname)
      setProgress(null)
    } catch (e) {
      setLog((l) => l + '\nERROR: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }, [selected, ranges, busy, reencode])

  const runMerge = useCallback(async () => {
    if (files.length < 2 || busy) return
    setBusy(true)
    setResults((prev) => {
      prev.forEach((r) => URL.revokeObjectURL(r.url))
      return []
    })
    try {
      setFfmpegHandlers({
        log: (line) => {
          setLog((l) => (l + '\n' + line).slice(-4000))
          requestAnimationFrame(() => logRef.current?.scrollTo({ top: 999999 }))
        },
        progress: (r) => setProgress(r),
      })
      const ff = await ensureFFmpeg()
      const names: string[] = []
      for (let i = 0; i < files.length; i++) {
        const ext = extOf(files[i].file.name)
        const n = `in${i}.${ext}`
        await writeFileToFs(ff, files[i].file, n)
        names.push(n)
      }
      await writeFileToFs(ff, new File([buildConcatList(names)], 'list.txt', { type: 'text/plain' }), 'list.txt')
      const firstExt = reencode ? 'mp4' : extOf(files[0].file.name)
      setProgress(0)
      const code = await ff.exec(mergeArgs('list.txt', `merged.${firstExt}`, reencode))
      if (code !== 0) throw new Error(`FFmpeg devolvió código ${code}`)
      const data = await readFileFromFs(ff, `merged.${firstExt}`)
      const blob = new Blob([data.slice().buffer as ArrayBuffer], { type: mimeOf(firstExt) })
      const base = 'union-' + Date.now()
      setResults([{ name: `${base}.${firstExt}`, url: URL.createObjectURL(blob), size: blob.size }])
      for (const n of names) await deleteFromFs(ff, n)
      await deleteFromFs(ff, 'list.txt')
      setProgress(null)
    } catch (e) {
      setLog((l) => l + '\nERROR: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }, [files, busy, reencode])

  const move = (id: string, dir: -1 | 1) => {
    setFiles((prev) => {
      const i = prev.findIndex((p) => p.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const f = prev.find((x) => x.id === id)
      if (f) URL.revokeObjectURL(f.url)
      const next = prev.filter((x) => x.id !== id)
      if (selectedId === id) setSelectedId(next[0]?.id ?? null)
      return next
    })
  }

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) void v.play()
    else v.pause()
  }

  const markStart = (id: string) => updateRange(id, { start: cursor })
  const markEnd = (id: string) => updateRange(id, { end: cursor })
  const seekTo = (t: number) => {
    if (videoRef.current) videoRef.current.currentTime = t
    setCursor(t)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-[#2b2b31] bg-[#141416] px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <VortexLogo className="w-9 h-9" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold tracking-tight">
              Vórtex Split AV <span className="font-normal text-[#9b9ba4]">· Corta y une video y audio, sin límites</span>
            </h1>
            <p className="text-[11px] text-[#9b9ba4]">FFmpeg WebAssembly corriendo en tu navegador · tus archivos nunca salen del equipo</p>
          </div>
          <button
            className={btn}
            onClick={() => void loadEngine()}
            disabled={engineState !== 'idle'}
            title="Precargar el motor FFmpeg"
          >
            {engineState === 'loading' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {engineState === 'ready' ? 'Motor listo' : engineState === 'loading' ? 'Cargando…' : 'Cargar motor'}
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {files.length === 0 ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }}
            onClick={() => document.getElementById('av-input')?.click()}
            className={`flex min-h-[420px] cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 text-center transition-colors ${
              dragOver ? 'border-[#8b5cf6] bg-[#1c1726]' : 'border-[#2b2b31] bg-[#17171a]'
            }`}
          >
            <Scissors className="h-12 w-12 text-[#8b5cf6]" />
            <div>
              <p className="text-base font-semibold">Arrastra tus videos o audios</p>
              <p className="mt-1 text-sm text-[#9b9ba4]">MP4, WebM, MOV, MP3, WAV, M4A… · corta por rangos o únelos en uno</p>
            </div>
          </div>
        ) : (
          <>
            {/* pestañas */}
            <div className="mb-4 flex gap-1 rounded-xl border border-[#2b2b31] bg-[#17171a] p-1">
              <button
                onClick={() => setMode('cut')}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  mode === 'cut' ? 'bg-[#26262b] text-[#ececf1]' : 'text-[#9b9ba4] hover:text-[#ececf1]'
                }`}
              >
                <Scissors className="h-3.5 w-3.5" /> Cortar por rangos
              </button>
              <button
                onClick={() => setMode('merge')}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  mode === 'merge' ? 'bg-[#26262b] text-[#ececf1]' : 'text-[#9b9ba4] hover:text-[#ececf1]'
                }`}
              >
                <Combine className="h-3.5 w-3.5" /> Unir en uno
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              {/* izquierda: preview + lista archivos */}
              <section className="space-y-3">
                <div className="overflow-hidden rounded-2xl border border-[#2b2b31] bg-[#17171a]">
                  {selected?.kind === 'video' ? (
                    <video
                      ref={videoRef}
                      src={selected.url}
                      className="aspect-video w-full bg-black"
                      onLoadedMetadata={(e) => {
                        const d = e.currentTarget.duration
                        setFiles((prev) => prev.map((f) => (f.id === selected.id ? { ...f, duration: d } : f)))
                      }}
                      onTimeUpdate={(e) => setCursor(e.currentTarget.currentTime)}
                      onPlay={() => setPlaying(true)}
                      onPause={() => setPlaying(false)}
                      controls
                    />
                  ) : selected?.kind === 'audio' ? (
                    <div className="flex flex-col items-center gap-3 px-6 py-10">
                      <button className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#8b5cf6] text-[#0f0f10]" onClick={togglePlay}>
                        {playing ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7" />}
                      </button>
                      <p className="max-w-full truncate text-sm">{selected.file.name}</p>
                      <audio
                        ref={videoRef as unknown as React.RefObject<HTMLAudioElement>}
                        src={selected.url}
                        controls
                        onLoadedMetadata={(e) => {
                          const d = e.currentTarget.duration
                          setFiles((prev) => prev.map((f) => (f.id === selected.id ? { ...f, duration: d } : f)))
                        }}
                        onTimeUpdate={(e) => setCursor(e.currentTarget.currentTime)}
                        onPlay={() => setPlaying(true)}
                        onPause={() => setPlaying(false)}
                        className="w-full"
                      />
                    </div>
                  ) : (
                    <div className="flex aspect-video items-center justify-center text-sm text-[#9b9ba4]">
                      Selecciona un archivo con vista previa
                    </div>
                  )}
                  {selected && (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <span className="font-mono text-xs text-[#a78bfa]">{fmtTime(cursor)}</span>
                      <input
                        type="range"
                        min={0}
                        max={duration || 0}
                        step={0.01}
                        value={cursor}
                        onChange={(e) => seekTo(parseFloat(e.target.value))}
                        className="h-1.5 flex-1"
                      />
                      <span className="font-mono text-xs text-[#9b9ba4]">{fmtTime(duration)}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  {files.map((f) => (
                    <div
                      key={f.id}
                      onClick={() => setSelectedId(f.id)}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                        selectedId === f.id ? 'border-[#8b5cf6] bg-[#1c1726]' : 'border-[#2b2b31] bg-[#17171a] hover:bg-[#1c1c21]'
                      }`}
                    >
                      <Scissors className="h-4 w-4 shrink-0 text-[#a78bfa]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{f.file.name}</p>
                        <p className="text-[11px] text-[#9b9ba4]">
                          {f.kind === 'audio' ? 'Audio' : 'Video'} · {fmtBytes(f.file.size)} · {f.duration ? fmtTime(f.duration) : 'duración pendiente'}
                        </p>
                      </div>
                      {mode === 'merge' && files.length > 1 && (
                        <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <button className={btn + ' px-1.5 py-1'} onClick={() => move(f.id, -1)}><ArrowUp className="h-3 w-3" /></button>
                          <button className={btn + ' px-1.5 py-1'} onClick={() => move(f.id, 1)}><ArrowDown className="h-3 w-3" /></button>
                        </span>
                      )}
                      <button className="text-[#9b9ba4] hover:text-[#f87171]" onClick={(e) => { e.stopPropagation(); removeFile(f.id) }}>
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button className={`${btn} w-full`} onClick={() => document.getElementById('av-input')?.click()}>
                    <Upload className="h-3.5 w-3.5" /> Añadir más archivos
                  </button>
                </div>
              </section>

              {/* derecha: controles según modo */}
              <section className="space-y-3">
                {mode === 'cut' ? (
                  <>
                    <div className="rounded-2xl border border-[#2b2b31] bg-[#17171a] p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[#9b9ba4]">Rangos a extraer</p>
                        <button className={btnAccent} onClick={addRange} disabled={!selected || !duration}>
                          <Flag className="h-3.5 w-3.5" /> Añadir rango aquí
                        </button>
                      </div>
                      <p className="mt-2 text-[11px] text-[#9b9ba4]">
                        Posiciona el reproductor en el segundo exacto y ajusta inicio/fin de cada rango.
                      </p>
                      <div className="mt-3 space-y-2">
                        {ranges.length === 0 && (
                          <div className="rounded-xl border border-dashed border-[#2b2b31] px-4 py-6 text-center text-xs text-[#9b9ba4]">
                            Sin rangos todavía. Pulsa «Añadir rango aquí».
                          </div>
                        )}
                        {ranges.map((r, i) => (
                          <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[#2b2b31] bg-[#0f0f10] px-3 py-2">
                            <span className="text-xs font-bold text-[#a78bfa]">#{i + 1}</span>
                            <span className="flex items-center gap-1 text-[11px] text-[#9b9ba4]">
                              <FlagTriangleRight className="h-3 w-3" />
                              <input value={fmtTime(r.start)} onChange={(e) => updateRange(r.id, { start: parseTime(e.target.value) })} className={`${input} w-24`} />
                            </span>
                            <button className={btn + ' px-1.5 py-1'} title="Marcar inicio en el tiempo actual" onClick={() => markStart(r.id)}>
                              <FlagTriangleRight className="h-3 w-3" />
                            </button>
                            <span className="flex items-center gap-1 text-[11px] text-[#9b9ba4]">
                              <Circle className="h-3 w-3" />
                              <input value={fmtTime(r.end)} onChange={(e) => updateRange(r.id, { end: parseTime(e.target.value) })} className={`${input} w-24`} />
                            </span>
                            <button className={btn + ' px-1.5 py-1'} title="Marcar fin en el tiempo actual" onClick={() => markEnd(r.id)}>
                              <Flag className="h-3 w-3" />
                            </button>
                            <span className="text-[11px] text-[#9b9ba4]">({fmtTime(Math.max(0, r.end - r.start))})</span>
                            <span className="flex-1" />
                            <button className="text-[#9b9ba4] hover:text-[#f87171]" onClick={() => setRanges((prev) => prev.filter((x) => x.id !== r.id))}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-xs text-[#ececf1]">
                      <input type="checkbox" checked={reencode} onChange={(e) => setReencode(e.target.checked)} className="accent-[#8b5cf6]" />
                      Re-codificar (cortes exactos al segundo, más lento · H.264 + AAC)
                    </label>
                    <button className={`${btnAccent} w-full py-2.5`} onClick={() => void runCut()} disabled={busy || !ranges.length || engineState === 'loading'}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
                      {busy ? (progress !== null ? `Cortando… ${Math.round(progress * 100)}%` : 'Cortando…') : `Cortar ${ranges.length || ''} rango(s)`}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="rounded-2xl border border-[#2b2b31] bg-[#17171a] p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#9b9ba4]">Orden de unión</p>
                      <p className="mt-2 text-[11px] text-[#9b9ba4]">
                        Se unen en el orden listado. Para una unión sin re-codificar, los archivos deberían tener el mismo códec y resolución; si no, activa re-codificar.
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-[#ececf1]">
                      <input type="checkbox" checked={reencode} onChange={(e) => setReencode(e.target.checked)} className="accent-[#8b5cf6]" />
                      Re-codificar al unir (compatibilidad total · H.264 + AAC)
                    </label>
                    <button className={`${btnAccent} w-full py-2.5`} onClick={() => void runMerge()} disabled={busy || files.length < 2 || engineState === 'loading'}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Combine className="h-4 w-4" />}
                      {busy ? (progress !== null ? `Uniendo… ${Math.round(progress * 100)}%` : 'Uniendo…') : `Unir ${files.length} archivos`}
                    </button>
                  </>
                )}

                {results.length > 0 && (
                  <div className="space-y-2 rounded-2xl border border-[#2b2b31] bg-[#17171a] p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#9b9ba4]">Resultados</p>
                    {results.map((r) => (
                      <div key={r.url} className="flex items-center gap-3 rounded-xl border border-[#2b2b31] bg-[#0f0f10] px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">{r.name}</p>
                          <p className="text-[11px] text-[#9b9ba4]">{fmtBytes(r.size)}</p>
                        </div>
                        <a className={btnAccent} href={r.url} download={r.name}>
                          <Download className="h-3.5 w-3.5" /> Descargar
                        </a>
                      </div>
                    ))}
                  </div>
                )}

                {(log || busy) && (
                  <div className="rounded-2xl border border-[#2b2b31] bg-[#17171a] p-3">
                    <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#9b9ba4]">
                      <Terminal className="h-3 w-3" /> Registro de FFmpeg
                    </p>
                    <textarea ref={logRef} readOnly value={log} rows={6} className="w-full resize-y rounded-lg border border-[#2b2b31] bg-[#0f0f10] p-2 font-mono text-[10px] leading-relaxed text-[#9b9ba4]" />
                  </div>
                )}
              </section>
            </div>
            <input id="av-input" type="file" hidden multiple accept="video/*,audio/*,.mkv,.flac,.opus" onChange={(e) => addFiles(e.target.files)} />
          </>
        )}

        {engineMsg && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#4b3b78] bg-[#1c1726] px-4 py-2.5 text-sm text-[#a78bfa]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {engineMsg}
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
