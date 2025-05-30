/**
 * 语音权限管理 Hook
 * 处理麦克风权限请求、检查和状态管理
 */

import { useState, useEffect, useCallback } from 'react'
import {
  VoicePermission,
  VoicePermissionState,
  UseVoicePermissionReturn
} from '@/types/voice'
import { checkBrowserSupport } from '@/lib/voice/config'

/**
 * 语音权限管理 Hook
 */
export function useVoicePermission(): UseVoicePermissionReturn {
  const [permission, setPermission] = useState<VoicePermission>({
    state: 'unknown',
    isSupported: false,
    canRequest: false,
  })

  /**
   * 检查浏览器支持
   */
  const checkSupport = useCallback(() => {
    const support = checkBrowserSupport()
    return support.isSupported
  }, [])

  /**
   * 检查权限状态
   */
  const checkPermission = useCallback(async (): Promise<VoicePermissionState> => {
    // 检查浏览器环境
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return 'unknown'
    }

    // 检查浏览器支持
    if (!checkSupport()) {
      return 'denied'
    }

    try {
      // 使用 Permissions API 检查权限（如果支持）
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const result = await navigator.permissions.query({ name: 'microphone' as PermissionName })

          switch (result.state) {
            case 'granted':
              return 'granted'
            case 'denied':
              return 'denied'
            case 'prompt':
              return 'prompt'
            default:
              return 'unknown'
          }
        } catch (error) {
          // Permissions API 可能不支持 microphone 查询（特别是Firefox）
          console.warn('Permissions API query failed, falling back to getUserMedia test:', error)
        }
      }

      // 如果 Permissions API 不可用或失败，尝试通过 getUserMedia 检查
      // 这是Firefox等浏览器的兼容性处理
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          },
          video: false
        })

        // 立即停止流
        stream.getTracks().forEach(track => track.stop())
        return 'granted'
      } catch (error: any) {
        console.warn('getUserMedia test failed:', error)

        // 更详细的错误处理，特别针对Firefox
        switch (error.name) {
          case 'NotAllowedError':
          case 'PermissionDeniedError':
            return 'denied'
          case 'NotFoundError':
            // 没有找到麦克风设备
            return 'denied'
          case 'NotReadableError':
            // 设备被其他应用占用
            return 'prompt'
          case 'OverconstrainedError':
            // 约束条件无法满足，尝试更宽松的条件
            try {
              const fallbackStream = await navigator.mediaDevices.getUserMedia({ audio: true })
              fallbackStream.getTracks().forEach(track => track.stop())
              return 'granted'
            } catch (fallbackError) {
              return 'prompt'
            }
          case 'SecurityError':
            // HTTPS要求或其他安全限制
            return 'denied'
          default:
            return 'prompt'
        }
      }
    } catch (error) {
      console.warn('Permission check failed:', error)
      return 'unknown'
    }
  }, [checkSupport])

  /**
   * 请求权限
   */
  const requestPermission = useCallback(async (): Promise<VoicePermissionState> => {
    // 检查浏览器环境
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return 'unknown'
    }

    // 检查浏览器支持
    if (!checkSupport()) {
      setPermission(prev => ({
        ...prev,
        state: 'denied',
        canRequest: false,
      }))
      return 'denied'
    }

    try {
      // 请求麦克风权限，使用渐进式降级策略
      let stream: MediaStream | null = null

      try {
        // 首先尝试高质量配置
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false
        })
      } catch (constraintError) {
        console.warn('High-quality audio constraints failed, trying basic:', constraintError)

        // 如果高质量配置失败，尝试基本配置
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false
          })
        } catch (basicError) {
          console.warn('Basic audio request failed:', basicError)
          throw basicError
        }
      }

      // 立即停止流
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
      }

      const newState: VoicePermissionState = 'granted'
      setPermission(prev => ({
        ...prev,
        state: newState,
        canRequest: false,
      }))

      return newState
    } catch (error: any) {
      console.warn('Permission request failed:', error)

      let newState: VoicePermissionState = 'unknown'

      // 详细的错误处理，特别针对不同浏览器
      switch (error.name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
          newState = 'denied'
          break
        case 'NotFoundError':
          // 没有找到麦克风设备
          newState = 'denied'
          break
        case 'NotReadableError':
          // 设备被其他应用占用
          newState = 'prompt'
          break
        case 'OverconstrainedError':
          // 约束条件无法满足
          newState = 'prompt'
          break
        case 'SecurityError':
          // HTTPS要求或其他安全限制
          newState = 'denied'
          break
        case 'AbortError':
          // 用户取消或超时
          newState = 'prompt'
          break
        default:
          newState = 'prompt'
      }

      setPermission(prev => ({
        ...prev,
        state: newState,
        canRequest: newState === 'prompt',
      }))

      return newState
    }
  }, [checkSupport])

  /**
   * 监听权限变化
   */
  useEffect(() => {
    let permissionStatus: PermissionStatus | null = null

    const setupPermissionListener = async () => {
      if (typeof navigator === 'undefined' || !navigator.permissions) {
        return
      }

      try {
        permissionStatus = await navigator.permissions.query({
          name: 'microphone' as PermissionName
        })

        const handlePermissionChange = () => {
          if (permissionStatus) {
            setPermission(prev => ({
              ...prev,
              state: permissionStatus!.state as VoicePermissionState,
              canRequest: permissionStatus!.state === 'prompt',
            }))
          }
        }

        permissionStatus.addEventListener('change', handlePermissionChange)

        // 初始状态设置
        handlePermissionChange()
      } catch (error) {
        // Permissions API 可能不支持 microphone 查询
        console.warn('Failed to setup permission listener:', error)
      }
    }

    setupPermissionListener()

    return () => {
      if (permissionStatus) {
        permissionStatus.removeEventListener('change', () => {})
      }
    }
  }, [])

  /**
   * 初始化权限状态
   */
  useEffect(() => {
    const initializePermission = async () => {
      const isSupported = checkSupport()
      const state = await checkPermission()

      setPermission({
        state,
        isSupported,
        canRequest: state === 'prompt' && isSupported,
      })
    }

    initializePermission()
  }, [checkSupport, checkPermission])

  return {
    permission,
    requestPermission,
    checkPermission,
  }
}

/**
 * 检查是否可以使用语音功能
 */
export function useVoiceAvailable(): boolean {
  const { permission } = useVoicePermission()
  return permission.isSupported && permission.state === 'granted'
}

/**
 * 权限状态的人类可读描述
 */
export function getPermissionDescription(state: VoicePermissionState): {
  title: string
  description: string
  action?: string
} {
  switch (state) {
    case 'granted':
      return {
        title: '麦克风权限已授予',
        description: '您可以使用语音输入功能',
      }

    case 'denied':
      return {
        title: '麦克风权限被拒绝',
        description: '请在浏览器设置中允许访问麦克风',
        action: '前往设置',
      }

    case 'prompt':
      return {
        title: '需要麦克风权限',
        description: '点击下方按钮授予麦克风访问权限',
        action: '授予权限',
      }

    case 'unknown':
    default:
      return {
        title: '权限状态未知',
        description: '无法确定麦克风权限状态',
        action: '检查权限',
      }
  }
}

/**
 * 获取权限设置指导
 */
export function getPermissionGuide(): {
  title: string
  steps: string[]
} {
  const isMobile = typeof navigator !== 'undefined' &&
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

  if (isMobile) {
    return {
      title: '移动端权限设置',
      steps: [
        '点击浏览器地址栏旁的设置图标',
        '找到"网站设置"或"权限"选项',
        '找到麦克风权限并设置为"允许"',
        '刷新页面后重试',
        '如仍无法使用，请尝试Chrome或Safari最新版本',
      ],
    }
  }

  return {
    title: '桌面端权限设置',
    steps: [
      '点击浏览器地址栏左侧的锁定/信息图标',
      '找到"麦克风"或"权限"选项',
      '将麦克风权限设置为"允许"',
      '刷新页面后重试',
      '如仍有问题，请检查系统麦克风设置',
    ],
  }
}
