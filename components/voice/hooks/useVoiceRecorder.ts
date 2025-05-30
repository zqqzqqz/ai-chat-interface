/**
 * 语音录音核心 Hook
 * 处理录音逻辑、音频处理和状态管理
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  VoiceConfig,
  VoiceRecordingState,
  UseVoiceRecorderReturn,
  VOICE_CONSTANTS
} from '@/types/voice'
import {
  getRecordingOptions,
  getBestAudioFormat
} from '@/lib/voice/config'
import {
  handleMediaError,
  handleRecorderError,
  createVoiceError,
  VOICE_ERROR_CODES
} from '@/lib/voice/errors'

/**
 * 语音录音 Hook
 */
export function useVoiceRecorder(config: VoiceConfig): UseVoiceRecorderReturn {
  // 状态管理
  const [state, setState] = useState<VoiceRecordingState>({
    isRecording: false,
    isProcessing: false,
    duration: 0,
    audioLevel: 0,
    error: null,
    isReady: false,
  })

  // 引用管理
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const animationRef = useRef<number | null>(null)

  /**
   * 清理资源
   */
  const cleanup = useCallback(() => {
    // 停止录音
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }

    // 停止媒体流
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
      mediaStreamRef.current = null
    }

    // 关闭音频上下文
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    // 清理定时器
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    // 清理动画帧
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }

    // 清理引用
    mediaRecorderRef.current = null
    analyserRef.current = null
    chunksRef.current = []
  }, [])

  /**
   * 更新音频级别
   */
  const updateAudioLevel = useCallback(() => {
    if (!analyserRef.current) return

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteFrequencyData(dataArray)

    // 计算平均音量
    const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length
    const normalizedLevel = Math.min(average / 128, 1) // 归一化到 0-1

    setState(prev => ({
      ...prev,
      audioLevel: normalizedLevel,
    }))

    if (state.isRecording) {
      animationRef.current = requestAnimationFrame(updateAudioLevel)
    }
  }, [state.isRecording])

  /**
   * 开始录音
   */
  const startRecording = useCallback(async (): Promise<void> => {
    try {
      setState(prev => ({
        ...prev,
        error: null,
        isReady: false,
      }))

      // 检查配置
      if (!config.enabled) {
        throw createVoiceError(
          VOICE_ERROR_CODES.CONFIG_MISSING,
          '语音功能未启用',
          '请在设置中启用语音功能'
        )
      }

      // 获取媒体流，使用渐进式降级策略
      let stream: MediaStream

      try {
        // 首先尝试高质量配置
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: config.sampleRate,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        })
      } catch (constraintError) {
        console.warn('High-quality audio constraints failed, trying basic:', constraintError)

        // 如果高质量配置失败，尝试基本配置
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
            },
          })
        } catch (basicError) {
          console.warn('Basic audio constraints failed, trying minimal:', basicError)

          // 最后尝试最小配置
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          })
        }
      }

      mediaStreamRef.current = stream

      // 创建音频上下文用于可视化
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext
        audioContextRef.current = new AudioContext()

        const source = audioContextRef.current.createMediaStreamSource(stream)
        const analyser = audioContextRef.current.createAnalyser()

        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.8

        source.connect(analyser)
        analyserRef.current = analyser
      } catch (error) {
        console.warn('Failed to create audio context for visualization:', error)
      }

      // 创建 MediaRecorder，使用跨平台兼容的配置
      let mediaRecorder: MediaRecorder

      try {
        // 首先尝试推荐的配置
        const options = getRecordingOptions(config)
        mediaRecorder = new MediaRecorder(stream, options)
      } catch (optionsError) {
        console.warn('Preferred MediaRecorder options failed, trying fallback:', optionsError)

        try {
          // 尝试基本配置
          mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'audio/webm;codecs=opus'
          })
        } catch (webmError) {
          console.warn('WebM format failed, trying MP4:', webmError)

          try {
            // 尝试MP4格式
            mediaRecorder = new MediaRecorder(stream, {
              mimeType: 'audio/mp4'
            })
          } catch (mp4Error) {
            console.warn('MP4 format failed, using default:', mp4Error)

            // 最后使用默认配置
            mediaRecorder = new MediaRecorder(stream)
          }
        }
      }

      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      // 设置事件处理器
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        setState(prev => ({
          ...prev,
          isRecording: false,
          isProcessing: false,
        }))
      }

      mediaRecorder.onerror = (event) => {
        const error = handleRecorderError(event.error)
        setState(prev => ({
          ...prev,
          error: error.message,
          isRecording: false,
          isProcessing: false,
        }))
      }

      // 开始录音
      mediaRecorder.start(100) // 每100ms收集一次数据

      setState(prev => ({
        ...prev,
        isRecording: true,
        isReady: true,
        duration: 0,
      }))

      // 开始计时器
      timerRef.current = setInterval(() => {
        setState(prev => {
          const newDuration = prev.duration + 1

          // 检查是否达到最大时长
          if (newDuration >= config.maxDuration) {
            stopRecording()
            return { ...prev, duration: config.maxDuration }
          }

          return { ...prev, duration: newDuration }
        })
      }, 1000)

      // 开始音频可视化
      if (analyserRef.current) {
        updateAudioLevel()
      }

    } catch (error: any) {
      const voiceError = handleMediaError(error)
      setState(prev => ({
        ...prev,
        error: voiceError.message,
        isRecording: false,
        isReady: false,
      }))
      cleanup()
      throw voiceError
    }
  }, [config, updateAudioLevel, cleanup])

  /**
   * 停止录音
   */
  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    try {
      setState(prev => ({
        ...prev,
        isProcessing: true,
      }))

      // 停止录音
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }

      // 等待数据收集完成
      await new Promise<void>((resolve) => {
        if (mediaRecorderRef.current) {
          mediaRecorderRef.current.onstop = () => {
            resolve()
          }
        } else {
          resolve()
        }
      })

      // 检查是否有录音数据
      if (chunksRef.current.length === 0) {
        throw createVoiceError(
          VOICE_ERROR_CODES.NO_AUDIO_DATA,
          '未捕获到录音数据',
          '请重新录音'
        )
      }

      // 创建音频 Blob
      const mimeType = getBestAudioFormat()
      const blob = new Blob(chunksRef.current, { type: mimeType })

      // 检查文件大小
      if (blob.size === 0) {
        throw createVoiceError(
          VOICE_ERROR_CODES.NO_AUDIO_DATA,
          '录音文件为空',
          '请重新录音'
        )
      }

      if (blob.size > VOICE_CONSTANTS.MAX_FILE_SIZE) {
        throw createVoiceError(
          VOICE_ERROR_CODES.FILE_TOO_LARGE,
          '录音文件过大',
          '请录制较短的音频'
        )
      }

      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: null,
      }))

      return blob

    } catch (error: any) {
      setState(prev => ({
        ...prev,
        error: error.message || '停止录音失败',
        isProcessing: false,
      }))
      return null
    } finally {
      cleanup()
    }
  }, [cleanup])

  /**
   * 重置状态
   */
  const reset = useCallback(() => {
    cleanup()
    setState({
      isRecording: false,
      isProcessing: false,
      duration: 0,
      audioLevel: 0,
      error: null,
      isReady: false,
    })
  }, [cleanup])

  // 组件卸载时清理资源
  useEffect(() => {
    return cleanup
  }, [cleanup])

  return {
    state,
    startRecording,
    stopRecording,
    reset,
  }
}

/**
 * 格式化录音时长
 */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

/**
 * 获取录音状态描述
 */
export function getRecordingStateDescription(state: VoiceRecordingState): string {
  if (state.error) {
    return state.error
  }

  if (state.isProcessing) {
    return '正在处理录音...'
  }

  if (state.isRecording) {
    return `录音中 ${formatDuration(state.duration)}`
  }

  if (state.isReady) {
    return '准备就绪'
  }

  return '点击开始录音'
}
