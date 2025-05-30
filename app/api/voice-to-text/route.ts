/**
 * 语音转文字 API 接口 - 兼容性重定向
 * 重定向到新的标准接口 /api/voice/transcribe
 *
 * @deprecated 请使用 /api/voice/transcribe 接口
 */

import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    // 获取原始请求数据
    const formData = await req.formData()

    // 重定向到新的标准接口
    const response = await fetch(new URL('/api/voice/transcribe', req.url), {
      method: 'POST',
      body: formData,
      headers: {
        // 保留必要的请求头
        'User-Agent': req.headers.get('User-Agent') || '',
      },
    })

    // 获取新接口的响应
    const data = await response.json()

    // 如果新接口返回成功，转换为旧格式以保持兼容性
    if (data.success && data.result) {
      return NextResponse.json({
        text: data.result.text,
        duration: data.result.duration,
        language: data.result.language,
      }, { status: response.status })
    }

    // 如果新接口返回错误，转换为旧格式
    if (data.error) {
      return NextResponse.json({
        error: data.error.message || '识别失败',
        code: data.error.code || 'UNKNOWN_ERROR',
        suggestion: data.error.suggestion,
      }, { status: response.status })
    }

    // 其他情况直接返回原响应
    return NextResponse.json(data, { status: response.status })

  } catch (error: any) {
    console.error('Voice-to-text redirect error:', error)
    return NextResponse.json({
      error: '服务暂时不可用，请稍后重试',
      code: 'SERVICE_UNAVAILABLE',
      suggestion: '请检查网络连接或联系技术支持'
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    message: '此接口已废弃，请使用 /api/voice/transcribe',
    redirect: '/api/voice/transcribe',
    status: 'deprecated'
  }, { status: 301 })
}