/**
 * 语音功能配置管理
 * 基于 Next.js 15 最佳实践
 */

import { VoiceConfig, VOICE_CONSTANTS } from '@/types/voice'

// 默认配置
const DEFAULT_CONFIG: VoiceConfig = {
  apiUrl: process.env.NEXT_PUBLIC_OPENAI_AUDIO_API_URL || 'http://112.48.22.44:38082/v1/audio/transcriptions',
  apiKey: process.env.NEXT_PUBLIC_OPENAI_AUDIO_API_KEY || 'sk-xx',
  maxDuration: VOICE_CONSTANTS.DEFAULT_MAX_DURATION,
  sampleRate: VOICE_CONSTANTS.DEFAULT_SAMPLE_RATE,
  language: VOICE_CONSTANTS.DEFAULT_LANGUAGE,
  enabled: true,
}

// 本地存储键名
const STORAGE_KEY = 'voice-config'

/**
 * 获取语音配置
 */
export function getVoiceConfig(): VoiceConfig {
  if (typeof window === 'undefined') {
    return DEFAULT_CONFIG
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const config = JSON.parse(stored)
      return { ...DEFAULT_CONFIG, ...config }
    }
  } catch (error) {
    console.warn('Failed to load voice config from localStorage:', error)
  }

  return DEFAULT_CONFIG
}

/**
 * 保存语音配置
 */
export function saveVoiceConfig(config: Partial<VoiceConfig>): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    const currentConfig = getVoiceConfig()
    const newConfig = { ...currentConfig, ...config }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig))
  } catch (error) {
    console.warn('Failed to save voice config to localStorage:', error)
  }
}

/**
 * 重置语音配置
 */
export function resetVoiceConfig(): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.warn('Failed to reset voice config:', error)
  }
}

/**
 * 验证语音配置
 */
export function validateVoiceConfig(config: Partial<VoiceConfig>): string[] {
  const errors: string[] = []

  if (config.apiUrl && !isValidUrl(config.apiUrl)) {
    errors.push('API URL 格式无效')
  }

  if (config.apiKey && config.apiKey.length < 3) {
    errors.push('API 密钥长度不足')
  }

  if (config.maxDuration && (config.maxDuration < 1 || config.maxDuration > 300)) {
    errors.push('录音时长必须在 1-300 秒之间')
  }

  if (config.sampleRate && ![8000, 16000, 22050, 44100, 48000].includes(config.sampleRate)) {
    errors.push('采样率必须是标准值之一')
  }

  if (config.language && !/^[a-z]{2}(-[A-Z]{2})?$/.test(config.language)) {
    errors.push('语言代码格式无效')
  }

  return errors
}

/**
 * 检查配置是否完整
 */
export function isConfigComplete(config: VoiceConfig): boolean {
  return !!(
    config.apiUrl &&
    config.apiKey &&
    config.apiKey !== 'sk-xx' &&
    config.maxDuration > 0 &&
    config.sampleRate > 0 &&
    config.language
  )
}

/**
 * 获取配置状态
 */
export function getConfigStatus(config: VoiceConfig): {
  isComplete: boolean
  isEnabled: boolean
  errors: string[]
} {
  const errors = validateVoiceConfig(config)
  const isComplete = isConfigComplete(config)

  return {
    isComplete,
    isEnabled: config.enabled && isComplete,
    errors,
  }
}

/**
 * 检查 URL 是否有效
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * 获取环境变量配置
 */
export function getEnvConfig(): Partial<VoiceConfig> {
  return {
    apiUrl: process.env.NEXT_PUBLIC_OPENAI_AUDIO_API_URL,
    apiKey: process.env.NEXT_PUBLIC_OPENAI_AUDIO_API_KEY,
  }
}

/**
 * 合并配置
 */
export function mergeConfigs(...configs: Partial<VoiceConfig>[]): VoiceConfig {
  return configs.reduce(
    (merged, config) => ({ ...merged, ...config }),
    DEFAULT_CONFIG
  )
}

/**
 * 检查浏览器支持
 */
export function checkBrowserSupport(): {
  isSupported: boolean
  missingFeatures: string[]
  browserInfo: {
    name: string
    version: string
    platform: string
    isMobile: boolean
  }
} {
  const missingFeatures: string[] = []

  // 获取浏览器信息
  const browserInfo = getBrowserInfo()

  if (typeof window === 'undefined') {
    return {
      isSupported: false,
      missingFeatures: ['Window object'],
      browserInfo
    }
  }

  // 检查基础API支持
  if (!navigator.mediaDevices) {
    missingFeatures.push('MediaDevices API')
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    missingFeatures.push('getUserMedia API')
  }

  if (!window.MediaRecorder) {
    missingFeatures.push('MediaRecorder API')
  }

  if (!window.AudioContext && !(window as any).webkitAudioContext) {
    missingFeatures.push('AudioContext API')
  }

  // 检查HTTPS要求（除了localhost）
  if (typeof location !== 'undefined' &&
      location.protocol !== 'https:' &&
      !location.hostname.includes('localhost') &&
      location.hostname !== '127.0.0.1') {
    missingFeatures.push('HTTPS Protocol (required for microphone access)')
  }

  // 特定浏览器的兼容性检查
  const isSupported = checkBrowserCompatibility(browserInfo, missingFeatures)

  return {
    isSupported: isSupported && missingFeatures.length === 0,
    missingFeatures,
    browserInfo,
  }
}

/**
 * 获取浏览器信息
 */
function getBrowserInfo(): {
  name: string
  version: string
  platform: string
  isMobile: boolean
} {
  if (typeof navigator === 'undefined') {
    return {
      name: 'Unknown',
      version: 'Unknown',
      platform: 'Unknown',
      isMobile: false
    }
  }

  const userAgent = navigator.userAgent
  const platform = navigator.platform || 'Unknown'
  const isMobile = /iPhone|iPad|iPod|Android|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)

  let name = 'Unknown'
  let version = 'Unknown'

  // 检测浏览器类型和版本
  if (userAgent.includes('Firefox')) {
    name = 'Firefox'
    const match = userAgent.match(/Firefox\/(\d+\.\d+)/)
    version = match ? match[1] : 'Unknown'
  } else if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
    name = 'Chrome'
    const match = userAgent.match(/Chrome\/(\d+\.\d+)/)
    version = match ? match[1] : 'Unknown'
  } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
    name = 'Safari'
    const match = userAgent.match(/Version\/(\d+\.\d+)/)
    version = match ? match[1] : 'Unknown'
  } else if (userAgent.includes('Edg')) {
    name = 'Edge'
    const match = userAgent.match(/Edg\/(\d+\.\d+)/)
    version = match ? match[1] : 'Unknown'
  }

  return { name, version, platform, isMobile }
}

/**
 * 检查特定浏览器的兼容性
 */
function checkBrowserCompatibility(
  browserInfo: { name: string; version: string; isMobile: boolean },
  missingFeatures: string[]
): boolean {
  const { name, version, isMobile } = browserInfo

  // Firefox特殊处理
  if (name === 'Firefox') {
    const versionNum = parseFloat(version)
    if (versionNum < 29) {
      missingFeatures.push('Firefox version too old (requires 29+)')
      return false
    }
    // Firefox在某些情况下Permissions API支持有限，但getUserMedia工作正常
    return true
  }

  // Chrome特殊处理
  if (name === 'Chrome') {
    const versionNum = parseFloat(version)
    if (versionNum < 47) {
      missingFeatures.push('Chrome version too old (requires 47+)')
      return false
    }
    return true
  }

  // Safari特殊处理
  if (name === 'Safari') {
    const versionNum = parseFloat(version)
    if (isMobile && versionNum < 11) {
      missingFeatures.push('Safari iOS version too old (requires 11+)')
      return false
    }
    if (!isMobile && versionNum < 11) {
      missingFeatures.push('Safari macOS version too old (requires 11+)')
      return false
    }
    return true
  }

  // Edge特殊处理
  if (name === 'Edge') {
    const versionNum = parseFloat(version)
    if (versionNum < 79) {
      missingFeatures.push('Edge version too old (requires 79+)')
      return false
    }
    return true
  }

  // 其他浏览器默认支持
  return true
}

/**
 * 获取支持的音频格式
 */
export function getSupportedFormats(): string[] {
  if (typeof window === 'undefined' || !window.MediaRecorder) {
    return []
  }

  const formats = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/wav',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ]

  return formats.filter(format => MediaRecorder.isTypeSupported(format))
}

/**
 * 获取最佳音频格式
 */
export function getBestAudioFormat(): string {
  const supportedFormats = getSupportedFormats()

  // 优先级顺序：Opus > WebM > MP4 > WAV > OGG
  const preferredFormats = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/wav',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ]

  for (const format of preferredFormats) {
    if (supportedFormats.includes(format)) {
      return format
    }
  }

  return supportedFormats[0] || 'audio/wav'
}

/**
 * 获取录音选项
 */
export function getRecordingOptions(config: VoiceConfig): MediaRecorderOptions {
  const format = getBestAudioFormat()

  const options: MediaRecorderOptions = {
    mimeType: format,
  }

  // 只在支持的情况下设置比特率，并进行跨平台兼容性检查
  try {
    if (MediaRecorder.isTypeSupported(format)) {
      // 根据格式设置合适的比特率
      if (format.includes('opus') || format.includes('webm')) {
        options.audioBitsPerSecond = Math.min(config.sampleRate * 8, 128000) // 限制最大比特率
      } else if (format.includes('mp4')) {
        options.audioBitsPerSecond = Math.min(config.sampleRate * 6, 96000)
      }
      // WAV和OGG格式通常不需要设置比特率
    }
  } catch (error) {
    console.warn('Failed to set audio bitrate, using default:', error)
  }

  return options
}

/**
 * 导出配置为 JSON
 */
export function exportConfig(config: VoiceConfig): string {
  const exportData = {
    ...config,
    // 不导出敏感信息
    apiKey: config.apiKey ? '***' : '',
    exportedAt: new Date().toISOString(),
  }

  return JSON.stringify(exportData, null, 2)
}

/**
 * 从 JSON 导入配置
 */
export function importConfig(jsonString: string): VoiceConfig {
  try {
    const imported = JSON.parse(jsonString)
    const errors = validateVoiceConfig(imported)

    if (errors.length > 0) {
      throw new Error(`配置验证失败: ${errors.join(', ')}`)
    }

    return { ...DEFAULT_CONFIG, ...imported }
  } catch (error) {
    throw new Error(`配置导入失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}
