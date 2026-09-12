import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Credential vault
 *
 * Credentials live in a JSON file inside the app's user data directory
 * (~/Library/Application Support/Mac Process Manager/credentials.json).
 * They never leave the machine and the file is written with 0600.
 */

export const PROVIDERS = {
  cline: {
    id: 'cline',
    label: 'Cline (built-in pass)',
    kind: 'cline',
    needsKey: false,
    needsBaseUrl: false,
    hint: 'ใช้สิทธิ์จาก `cline auth` ที่ login ไว้แล้ว — ไม่ต้องใส่ key (model: รูปแบบ modelType/model เช่น zai/glm-5.3-flash)',
    defaultModel: 'zai/glm-5.3-flash'
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai-compatible',
    needsKey: true,
    needsBaseUrl: false,
    baseUrl: 'https://openrouter.ai/api/v1',
    hint: 'รวม model หลายค่าย (Claude, GPT, Gemini, GLM) ใน key เดียว',
    defaultModel: 'anthropic/claude-sonnet-4'
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    kind: 'anthropic',
    needsKey: true,
    needsBaseUrl: false,
    hint: 'Claude ตรงจากค่าย (console.anthropic.com)',
    defaultModel: 'claude-sonnet-4'
  },
  openai: {
    id: 'openai',
    label: 'OpenAI (GPT)',
    kind: 'openai',
    needsKey: true,
    needsBaseUrl: false,
    hint: 'platform.openai.com',
    defaultModel: 'gpt-4o'
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    kind: 'gemini',
    needsKey: true,
    needsBaseUrl: false,
    hint: 'AI Studio — มี free tier',
    defaultModel: 'gemini-2.0-flash'
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama (local)',
    kind: 'ollama',
    needsKey: false,
    needsBaseUrl: true,
    baseUrl: 'http://localhost:11434',
    hint: 'โมเดลรันในเครื่อง ไม่มีค่าใช้จ่าย',
    defaultModel: 'llama3.1'
  },
  'lm-studio': {
    id: 'lm-studio',
    label: 'LM Studio (local)',
    kind: 'openai-compatible',
    needsKey: false,
    needsBaseUrl: true,
    baseUrl: 'http://localhost:1234/v1',
    hint: 'OpenAI-compatible server ของ LM Studio',
    defaultModel: ''
  },
  generic: {
    id: 'generic',
    label: 'Custom (OpenAI-compatible)',
    kind: 'openai-compatible',
    needsKey: true,
    needsBaseUrl: true,
    baseUrl: '',
    hint: 'vLLM, Together, Groq, DeepSeek หรือ endpoint อื่น ๆ',
    defaultModel: ''
  }
}

function mask(value) {
  const text = String(value ?? '')
  if (!text) return ''
  if (text.length <= 8) return '••••'
  return `${text.slice(0, 4)}••••${text.slice(-4)}`
}

export function listCredentials() {
  const vault = readVault()
  return {
    ok: true,
    activeId: vault.activeId,
    providers: Object.values(PROVIDERS),
    credentials: vault.credentials.map((credential) => ({
      id: credential.id,
      name: credential.name,
      provider: credential.provider,
      model: credential.model ?? '',
      baseUrl: credential.baseUrl ?? '',
      hasKey: Boolean(credential.apiKey),
      keyPreview: mask(credential.apiKey),
      createdAt: credential.createdAt ?? null,
      lastTestedAt: credential.lastTestedAt ?? null,
      lastTestOk: credential.lastTestOk ?? null
    }))
  }
}

export function saveCredential(input = {}) {
  const spec = PROVIDERS[input.provider]
  if (!spec) return { ok: false, error: `Unknown provider: ${input.provider}` }

  const name = String(input.name ?? '').trim()
  if (!name) return { ok: false, error: 'กรุณาตั้งชื่อ credential' }
  if (spec.needsKey && !String(input.apiKey ?? '').trim()) {
    return { ok: false, error: `${spec.label} ต้องมี API key` }
  }
  if (spec.needsBaseUrl && !String(input.baseUrl ?? '').trim()) {
    return { ok: false, error: `${spec.label} ต้องมี Base URL` }
  }

  const vault = readVault()
  const now = new Date().toISOString()

  // Updating in place keeps the stored key when the form leaves it blank.
  if (input.id) {
    const existing = vault.credentials.find((c) => c.id === input.id)
    if (!existing) return { ok: false, error: 'ไม่พบ credential ที่ต้องการแก้ไข' }

    existing.name = name
    existing.provider = input.provider
    existing.model = String(input.model ?? spec.defaultModel ?? '').trim()
    existing.baseUrl = String(input.baseUrl ?? spec.baseUrl ?? existing.baseUrl ?? '').trim()
    if (String(input.apiKey ?? '').trim()) existing.apiKey = String(input.apiKey).trim()
    existing.updatedAt = now
    if (input.setActive) vault.activeId = existing.id

    writeVault(vault)
    return { ok: true, id: existing.id, updated: true }
  }

  const id = `cred_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  vault.credentials.push({
    id,
    name,
    provider: input.provider,
    model: String(input.model ?? spec.defaultModel ?? '').trim(),
    baseUrl: String(input.baseUrl ?? spec.baseUrl ?? '').trim(),
    apiKey: String(input.apiKey ?? '').trim(),
    createdAt: now,
    updatedAt: now
  })
  if (input.setActive || vault.credentials.length === 1) vault.activeId = id

  writeVault(vault)
  return { ok: true, id, created: true }
}

export function deleteCredential(id) {
  const vault = readVault()
  const before = vault.credentials.length
  vault.credentials = vault.credentials.filter((c) => c.id !== id)
  if (vault.activeId === id) vault.activeId = vault.credentials[0]?.id ?? null
  if (vault.credentials.length === before) return { ok: false, error: 'ไม่พบ credential นี้' }
  writeVault(vault)
  return { ok: true, deleted: id }
}

export function setActiveCredential(id) {
  const vault = readVault()
  if (!vault.credentials.some((c) => c.id === id)) {
    return { ok: false, error: 'ไม่พบ credential นี้' }
  }
  vault.activeId = id
  writeVault(vault)
  return { ok: true, activeId: id }
}

/** Resolve one credential (or the active one) into a full record. */
export function resolveCredential(id) {
  const vault = readVault()
  const credential = vault.credentials.find((c) => c.id === (id ?? vault.activeId))
  if (!credential) {
    return {
      ok: false,
      error: 'ยังไม่ได้เลือก credential — เพิ่มและเลือกอันที่จะใช้ในหน้า AI'
    }
  }
  return { ok: true, credential, spec: PROVIDERS[credential.provider] ?? null }
}

function vaultPath() {
  const base =
    process.env.MPM_CREDENTIALS_DIR ||
    path.join(os.homedir(), 'Library/Application Support/Mac Process Manager')
  return path.join(base, 'credentials.json')
}

function readVault() {
  try {
    const parsed = JSON.parse(fs.readFileSync(vaultPath(), 'utf8'))
    return Array.isArray(parsed.credentials) ? parsed : { credentials: [], activeId: null }
  } catch {
    return { credentials: [], activeId: null }
  }
}

function writeVault(data) {
  const file = vaultPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 })
  try {
    fs.chmodSync(file, 0o600)
  } catch {
    /* best effort */
  }
}

