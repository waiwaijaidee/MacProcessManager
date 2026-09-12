import { spawn } from 'node:child_process'
import os from 'node:os'
import { run } from './exec.js'

const CANDIDATES = [
  '/usr/local/bin/cline',
  '/opt/homebrew/bin/cline',
  `${os.homedir()}/.local/bin/cline`,
  '/Applications/Cline.app/Contents/Resources/app/bin/cline'
]

let clineBin = null
const running = new Map()

/** Resolve the cline CLI; Electron apps do not inherit the shell PATH. */
export async function resolveCline(force = false) {
  if (clineBin && !force) return clineBin
  for (const candidate of [process.env.CLINE_PATH, ...CANDIDATES].filter(Boolean)) {
    const probe = await run('/bin/test', ['-x', candidate], { timeout: 3000 })
    if (probe.ok) {
      clineBin = candidate
      return clineBin
    }
  }
  clineBin = null
  return null
}

export async function clineInfo() {
  const bin = await resolveCline()
  if (!bin) {
    return { available: false, reason: 'ไม่พบ cline CLI — ติดตั้งด้วย npm install -g @cline/cli' }
  }
  const result = await run(bin, ['version'], { timeout: 20000 })
  return {
    available: true,
    bin,
    version: (result.stdout || '').trim() || 'unknown'
  }
}

/** Parse one NDJSON line emitted by `cline --json`. */
function parseClineLine(line) {
  const trimmed = line.trim()
  if (!trimmed.startsWith('{')) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

/**
 * Run one cline turn and assemble the answer.
 * `onEvent` receives `{ type, text }` progress callbacks for live streaming.
 */
export function chatWithCline(options = {}, onEvent = () => {}) {
  const id = options.id ?? `chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  return new Promise(async (resolve) => {
    const bin = await resolveCline()
    if (!bin) {
      resolve({ ok: false, id, error: 'ไม่พบ cline CLI — ติดตั้งด้วย npm install -g @cline/cli' })
      return
    }

    const prompt = String(options.prompt ?? '').trim()
    if (!prompt) {
      resolve({ ok: false, id, error: 'Prompt is empty.' })
      return
    }

    // Session resume: `cline --json --id <session>` rejects both a prompt
    // argument and piped stdin (verified on cline 2.x) — resume is only
    // supported in interactive TUI mode. So `--id` is never passed here;
    // each turn is a fresh conversation and we capture cline's own
    // conversation id (`conv_…`) below for display purposes only.

    const timeoutSec = Math.min(Math.max(Number(options.timeout) || 240, 20), 1800)
    const args = ['--json', '-t', String(timeoutSec)]
    if (options.provider) args.push('-P', String(options.provider))
    if (options.model) args.push('-m', String(options.model))
    if (options.apiKey) args.push('-k', String(options.apiKey))
    if (options.thinking) args.push('--thinking', String(options.thinking))
    args.push('--auto-approve', options.autoApprove ? 'true' : 'false')
    // cline's CLI rejects a positional prompt that contains no whitespace at
    // all (its heuristic assumes a single bare word is a mistyped command and
    // answers "Unknown command or unquoted prompt"). A leading newline is
    // invisible to the model and satisfies that check.
    args.push(/\s/.test(prompt) ? prompt : `\n${prompt}`)

    let child
    try {
      child = spawn(bin, args, {
        cwd: options.cwd && options.cwd !== '~' ? options.cwd : os.homedir(),
        env: { ...process.env }
      })
    } catch (err) {
      resolve({ ok: false, id, error: err?.message ?? 'spawn failed' })
      return
    }
    running.set(id, child)

    let text = ''
    let reasoning = ''
    let stderrText = ''
    let toolCalls = 0
    let iterations = 0
    let usage = null
    let model = null
    let clineSession = null
    const errors = []

    const handle = (payload) => {
      if (!payload || typeof payload !== 'object') return
      const event = payload.event ?? {}

      // cline's own conversation id (used by `cline history` / the TUI).
      if (payload.taskId && typeof payload.taskId === 'string') clineSession = payload.taskId
      else if (event.taskId && typeof event.taskId === 'string') clineSession = event.taskId

      if (payload.type === 'error') {
        errors.push(payload.message ?? 'unknown error')
        onEvent({ type: 'error', text: payload.message ?? 'error' })
        return
      }

      if (event.type === 'content_start' || event.type === 'content_end') {
        if (event.contentType === 'text' && event.text) {
          text += event.text
          onEvent({ type: 'text', text: event.text })
        } else if (event.contentType === 'reasoning' && event.text) {
          reasoning += event.text
          onEvent({ type: 'reasoning', text: event.text })
        }
        return
      }

      if (event.type === 'iteration_end') {
        iterations += 1
        if (event.toolCallCount) toolCalls += event.toolCallCount
        return
      }

      if (event.type === 'usage' && event.totalCost != null) {
        usage = {
          cost: Number(event.totalCost) || 0,
          inputTokens: event.totalInputTokens ?? event.inputTokens ?? 0,
          outputTokens: event.totalOutputTokens ?? event.outputTokens ?? 0
        }
        return
      }

      if (payload.type === 'run_result') {
        if (payload.text) text = payload.text
        if (payload.model) model = payload.model?.info?.name ?? payload.model?.id ?? null
        if (payload.aggregateUsage) {
          usage = {
            cost: Number(payload.aggregateUsage.totalCost) || 0,
            inputTokens: payload.aggregateUsage.totalInputTokens ?? 0,
            outputTokens: payload.aggregateUsage.totalOutputTokens ?? 0
          }
        }
      }
    }

    let buffer = ''
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const payload = parseClineLine(line)
        if (payload) handle(payload)
      }
    })

    // cline prints parser/auth failures as plain text on stderr (no NDJSON at
    // all) — without this capture those failures surface as an empty reply.
    child.stderr.on('data', (chunk) => {
      stderrText += chunk.toString()
    })

    child.on('error', (err) => {
      running.delete(id)
      resolve({ ok: false, id, error: err.message })
    })

    child.on('close', (code) => {
      if (buffer.trim()) {
        const payload = parseClineLine(buffer)
        if (payload) handle(payload)
      }
      running.delete(id)

      const blocked = /blocked|approval step|non-interactive|permission/i.test(text)
      const cleanText = text.trim()

      // Prefer NDJSON error events, then plain stderr, then a helpful note
      // when cline exited without producing anything at all.
      const ansi = /\x1b\[[0-9;]*[A-Za-z]/g
      const stderrDetail = stderrText.replace(ansi, '').trim()
      const errorText = errors.length
        ? errors.join(' | ')
        : cleanText
          ? null
          : stderrDetail || (code ? `cline จบการทำงานผิดปกติ (exit ${code}) โดยไม่มีข้อความ` : 'cline ตอบกลับว่างเปล่า')

      resolve({
        ok: Boolean(cleanText),
        id,
        text: cleanText,
        reasoning: reasoning.trim(),
        session: clineSession,
        toolCalls,
        iterations,
        usage,
        model,
        needsPermission: blocked && !options.autoApprove,
        error: errorText
      })
    })
  })
}

/** Abort a running chat turn. */
export function abortChat(id) {
  const child = running.get(id)
  if (!child) return { ok: false, error: `No running chat with id ${id}` }
  child.kill('SIGTERM')
  running.delete(id)
  return { ok: true, id }
}

/** Cheap credential check: one tiny turn. */
export async function testConnection(options = {}) {
  const info = await clineInfo()
  if (!info.available) return { ok: false, ...info }

  const result = await chatWithCline({
    ...options,
    prompt: 'Reply with exactly one word: READY',
    timeout: 90
  })

  return {
    ok: Boolean(result.ok && result.text),
    reply: result.text ?? null,
    model: result.model ?? options.model ?? null,
    cost: result.usage?.cost ?? null,
    needsPermission: result.needsPermission ?? false,
    error: result.error ?? null
  }
}

/* ------------------------------------------------------------------ *
 * Direct HTTP providers (OpenAI-compatible / Anthropic / Gemini / Ollama)
 * ------------------------------------------------------------------ */

async function fetchJson(url, init, timeoutMs = 60000) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  const raw = await response.text()
  let json = null
  try {
    json = raw ? JSON.parse(raw) : null
  } catch {
    json = null
  }
  if (!response.ok) {
    const message =
      (json && (json.error?.message || json.message)) || raw.slice(0, 300) || response.statusText
    throw new Error(`HTTP ${response.status}: ${message}`)
  }
  return json
}

function openAiBody({ baseUrl, apiKey, model, prompt, system }) {
  return {
    url: `${(baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`,
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt }
        ],
        stream: false
      })
    }
  }
}

function anthropicBody({ baseUrl, apiKey, model, prompt, system }) {
  return {
    url: `${(baseUrl || 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`,
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4',
        max_tokens: 4096,
        system,
        messages: [{ role: 'user', content: prompt }]
      })
    }
  }
}

function geminiBody({ baseUrl, apiKey, model, prompt, system }) {
  const modelId = model || 'gemini-2.0-flash'
  return {
    url: `${(baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '')}/models/${modelId}:generateContent?key=${apiKey}`,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      })
    }
  }
}

function ollamaBody({ baseUrl, apiKey, model, prompt, system }) {
  return {
    url: `${(baseUrl || 'http://localhost:11434').replace(/\/$/, '')}/api/chat`,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: model || 'llama3.1',
        stream: false,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt }
        ]
      })
    }
  }
}

/** Build the request for a provider kind. */
export function buildApiRequest({ kind, baseUrl, apiKey, model, prompt, system }) {
  const input = { baseUrl, apiKey, model, prompt, system }
  if (kind === 'anthropic') return anthropicBody(input)
  if (kind === 'gemini') return geminiBody(input)
  if (kind === 'ollama') return ollamaBody(input)
  return openAiBody(input)
}

/** Extract the assistant text from any provider's response shape. */
function extractText(kind, json) {
  if (!json) return ''
  if (kind === 'anthropic') {
    const block = (json.content ?? []).find((part) => part.type === 'text')
    return block?.text ?? ''
  }
  if (kind === 'gemini') {
    return json.candidates?.[0]?.content?.parts?.map((part) => part.text).join('') ?? ''
  }
  if (kind === 'ollama') return json.message?.content ?? ''
  return json.choices?.[0]?.message?.content ?? ''
}

const SYSTEM_PROMPT = [
  'You are the assistant inside the Mac Process Manager app on macOS.',
  'Answer in the same language the user writes in (Thai or English).',
  'Be concise and practical. When the user asks about the machine, use the',
  'runtime context provided with the question instead of guessing.'
].join(' ')

/**
 * Direct API chat used when the selected credential is not the cline CLI.
 * `contextText` is a snapshot of the machine (processes, services, stats).
 */
export async function chatWithApi({ credential, kind, baseUrl, apiKey, model, prompt, contextText, timeoutMs = 90000 }) {
  const userContent = contextText ? `${prompt}\n\n---\nMachine context:\n${contextText}` : prompt

  const { url, init } = buildApiRequest({
    kind,
    baseUrl,
    apiKey,
    model,
    prompt: userContent,
    system: SYSTEM_PROMPT
  })

  try {
    const json = await fetchJson(url, init, timeoutMs)
    const text = extractText(kind, json)
    return {
      ok: true,
      text: text.trim(),
      usage: json.usage
        ? { inputTokens: json.usage.prompt_tokens ?? null, outputTokens: json.usage.completion_tokens ?? null, cost: null }
        : null
    }
  } catch (err) {
    return { ok: false, text: '', error: err.message }
  }
}

/** Small credential test: one real but tiny request. */
export async function testCredential(credential, spec) {
  const started = Date.now()
  try {
    if (spec.kind === 'cline') {
      const result = await chatWithCline({
        provider: credential.provider,
        model: credential.model || undefined,
        apiKey: credential.apiKey || undefined,
        prompt: 'Reply with exactly one word: READY',
        timeout: 90
      })
      return {
        ok: Boolean(result.ok && result.text),
        reply: result.text ?? null,
        model: result.model ?? null,
        needsPermission: result.needsPermission ?? false,
        error: result.error ?? null
      }
    }

    const kind = spec.kind
    const result = await chatWithApi({
      credential,
      kind,
      baseUrl: credential.baseUrl || spec.baseUrl,
      apiKey: credential.apiKey,
      model: credential.model || spec.defaultModel,
      prompt: 'Reply with exactly one word: READY',
      timeoutMs: 45000
    })
    return {
      ok: result.ok && Boolean(result.text),
      reply: result.text || null,
      error: result.error ?? null
    }
  } catch (err) {
    return { ok: false, error: err.message, durationMs: Date.now() - started }
  }
}
