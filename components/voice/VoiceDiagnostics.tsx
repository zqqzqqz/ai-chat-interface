/**
 * 语音功能诊断组件
 * 用于调试和检测语音功能的兼容性问题
 */

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Info,
  Mic,
  Settings,
  RefreshCw
} from 'lucide-react'
import { checkBrowserSupport, getSupportedFormats } from '@/lib/voice/config'
import { useVoicePermission } from './hooks/useVoicePermission'
import { cn } from '@/lib/utils'

interface DiagnosticResult {
  category: string
  name: string
  status: 'success' | 'warning' | 'error' | 'info'
  message: string
  details?: string
}

export function VoiceDiagnostics() {
  const [results, setResults] = useState<DiagnosticResult[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const { permission, requestPermission, checkPermission } = useVoicePermission()

  const runDiagnostics = async () => {
    setIsRunning(true)
    const diagnosticResults: DiagnosticResult[] = []

    try {
      // 1. 浏览器支持检查
      const browserSupport = checkBrowserSupport()
      
      diagnosticResults.push({
        category: '浏览器支持',
        name: '基础API支持',
        status: browserSupport.isSupported ? 'success' : 'error',
        message: browserSupport.isSupported ? '所有必需的API都受支持' : '缺少必需的API',
        details: browserSupport.missingFeatures.length > 0 
          ? `缺少: ${browserSupport.missingFeatures.join(', ')}` 
          : undefined
      })

      diagnosticResults.push({
        category: '浏览器信息',
        name: '浏览器详情',
        status: 'info',
        message: `${browserSupport.browserInfo.name} ${browserSupport.browserInfo.version}`,
        details: `平台: ${browserSupport.browserInfo.platform}, 移动端: ${browserSupport.browserInfo.isMobile ? '是' : '否'}`
      })

      // 2. 权限检查
      const permissionState = await checkPermission()
      diagnosticResults.push({
        category: '权限状态',
        name: '麦克风权限',
        status: permissionState === 'granted' ? 'success' : 
                permissionState === 'denied' ? 'error' : 'warning',
        message: getPermissionMessage(permissionState),
        details: `当前状态: ${permissionState}`
      })

      // 3. 音频格式支持
      const supportedFormats = getSupportedFormats()
      diagnosticResults.push({
        category: '音频格式',
        name: '支持的格式',
        status: supportedFormats.length > 0 ? 'success' : 'error',
        message: `支持 ${supportedFormats.length} 种格式`,
        details: supportedFormats.join(', ') || '无支持的格式'
      })

      // 4. MediaRecorder测试
      if (typeof MediaRecorder !== 'undefined') {
        try {
          const testFormats = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/wav']
          const supportedTestFormats = testFormats.filter(format => 
            MediaRecorder.isTypeSupported(format)
          )
          
          diagnosticResults.push({
            category: 'MediaRecorder',
            name: '录音格式测试',
            status: supportedTestFormats.length > 0 ? 'success' : 'warning',
            message: `${supportedTestFormats.length} 种格式可用`,
            details: supportedTestFormats.join(', ') || '使用默认格式'
          })
        } catch (error) {
          diagnosticResults.push({
            category: 'MediaRecorder',
            name: '录音格式测试',
            status: 'error',
            message: '格式测试失败',
            details: error instanceof Error ? error.message : '未知错误'
          })
        }
      }

      // 5. 网络环境检查
      if (typeof location !== 'undefined') {
        const isSecure = location.protocol === 'https:' || 
                        location.hostname === 'localhost' ||
                        location.hostname === '127.0.0.1'
        
        diagnosticResults.push({
          category: '网络环境',
          name: '安全连接',
          status: isSecure ? 'success' : 'error',
          message: isSecure ? '使用安全连接' : '需要HTTPS连接',
          details: `协议: ${location.protocol}, 主机: ${location.hostname}`
        })
      }

      // 6. API配置检查
      try {
        const configResponse = await fetch('/api/voice/config')
        if (configResponse.ok) {
          const configData = await configResponse.json()
          diagnosticResults.push({
            category: 'API配置',
            name: '配置接口',
            status: 'success',
            message: '配置接口正常',
            details: `状态: ${configData.status}`
          })
        } else {
          diagnosticResults.push({
            category: 'API配置',
            name: '配置接口',
            status: 'error',
            message: '配置接口异常',
            details: `HTTP ${configResponse.status}`
          })
        }
      } catch (error) {
        diagnosticResults.push({
          category: 'API配置',
          name: '配置接口',
          status: 'error',
          message: '无法连接配置接口',
          details: error instanceof Error ? error.message : '网络错误'
        })
      }

      setResults(diagnosticResults)
    } catch (error) {
      console.error('Diagnostics failed:', error)
      diagnosticResults.push({
        category: '诊断错误',
        name: '诊断过程',
        status: 'error',
        message: '诊断过程中发生错误',
        details: error instanceof Error ? error.message : '未知错误'
      })
      setResults(diagnosticResults)
    } finally {
      setIsRunning(false)
    }
  }

  const getPermissionMessage = (state: string): string => {
    switch (state) {
      case 'granted': return '已授权'
      case 'denied': return '已拒绝'
      case 'prompt': return '需要授权'
      default: return '状态未知'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'warning': return <AlertCircle className="h-4 w-4 text-yellow-500" />
      case 'error': return <XCircle className="h-4 w-4 text-red-500" />
      default: return <Info className="h-4 w-4 text-blue-500" />
    }
  }

  const getStatusBadge = (status: string) => {
    const variants = {
      success: 'bg-green-100 text-green-800',
      warning: 'bg-yellow-100 text-yellow-800',
      error: 'bg-red-100 text-red-800',
      info: 'bg-blue-100 text-blue-800'
    }
    
    return variants[status as keyof typeof variants] || variants.info
  }

  useEffect(() => {
    runDiagnostics()
  }, [])

  const groupedResults = results.reduce((acc, result) => {
    if (!acc[result.category]) {
      acc[result.category] = []
    }
    acc[result.category].push(result)
    return acc
  }, {} as Record<string, DiagnosticResult[]>)

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          语音功能诊断
        </CardTitle>
        <div className="flex gap-2">
          <Button 
            onClick={runDiagnostics} 
            disabled={isRunning}
            size="sm"
            variant="outline"
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", isRunning && "animate-spin")} />
            {isRunning ? '诊断中...' : '重新诊断'}
          </Button>
          
          {permission.state === 'prompt' && (
            <Button 
              onClick={requestPermission}
              size="sm"
              variant="outline"
            >
              <Mic className="h-4 w-4 mr-2" />
              请求权限
            </Button>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {Object.entries(groupedResults).map(([category, categoryResults]) => (
          <div key={category} className="space-y-3">
            <h3 className="font-semibold text-lg">{category}</h3>
            <div className="space-y-2">
              {categoryResults.map((result, index) => (
                <div 
                  key={index}
                  className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                >
                  {getStatusIcon(result.status)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{result.name}</span>
                      <Badge className={getStatusBadge(result.status)}>
                        {result.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{result.message}</p>
                    {result.details && (
                      <p className="text-xs text-muted-foreground mt-1 font-mono">
                        {result.details}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        
        {results.length === 0 && !isRunning && (
          <div className="text-center py-8 text-muted-foreground">
            点击"重新诊断"开始检测语音功能
          </div>
        )}
      </CardContent>
    </Card>
  )
}
