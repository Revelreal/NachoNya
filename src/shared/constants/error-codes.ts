/**
 * 错误码定义
 * 参考 ISO 14229 (UDS) 诊断协议
 *
 * 格式: [类别][序号]
 * 类别: S=系统, P=进程, T=终端, A=AI, F=文件
 */

export type ErrorLevel = 'info' | 'warning' | 'error';

export interface ErrorDefinition {
  message: string;
  level: ErrorLevel;
}

export const ErrorCodes = {
  // ========== 系统级错误 (Sxxxx) ==========
  S0001: { message: '服务未找到', level: 'error' as ErrorLevel },
  S0002: { message: '服务不可用', level: 'error' as ErrorLevel },
  S0003: { message: '请求超时', level: 'warning' as ErrorLevel },
  S0004: { message: '版本不兼容', level: 'error' as ErrorLevel },
  S0005: { message: '服务内部错误', level: 'error' as ErrorLevel },
  S0006: { message: '消息格式错误', level: 'error' as ErrorLevel },
  S0007: { message: '服务正在启动', level: 'info' as ErrorLevel },
  S0008: { message: '服务正在停止', level: 'info' as ErrorLevel },

  // ========== 进程错误 (Pxxxx) ==========
  P0001: { message: '进程不存在', level: 'warning' as ErrorLevel },
  P0002: { message: '进程权限不足', level: 'error' as ErrorLevel },
  P0003: { message: '进程已挂起', level: 'warning' as ErrorLevel },
  P0004: { message: '无法结束系统进程', level: 'error' as ErrorLevel },

  // ========== 终端错误 (Txxxx) ==========
  T0001: { message: '命令执行超时', level: 'warning' as ErrorLevel },
  T0002: { message: '命令不存在', level: 'error' as ErrorLevel },
  T0003: { message: '命令执行被拒绝', level: 'error' as ErrorLevel },
  T0004: { message: '终端会话丢失', level: 'error' as ErrorLevel },

  // ========== AI 错误 (Axxxx) ==========
  A0001: { message: 'AI 服务不可用', level: 'error' as ErrorLevel },
  A0002: { message: 'AI 请求超时', level: 'warning' as ErrorLevel },
  A0003: { message: 'AI 响应格式错误', level: 'error' as ErrorLevel },
  A0004: { message: 'AI Token 不足', level: 'warning' as ErrorLevel },

  // ========== 文件错误 (Fxxxx) ==========
  F0001: { message: '文件不存在', level: 'info' as ErrorLevel },
  F0002: { message: '文件权限不足', level: 'error' as ErrorLevel },
  F0003: { message: '磁盘空间不足', level: 'error' as ErrorLevel },
  F0004: { message: '路径格式错误', level: 'error' as ErrorLevel },
} as const;

export type ErrorCode = keyof typeof ErrorCodes;

/**
 * 获取错误码定义
 */
export function getErrorDefinition(code: string): ErrorDefinition | undefined {
  return ErrorCodes[code as ErrorCode];
}

/**
 * 创建错误响应
 */
export function createErrorResponse(
  code: ErrorCode,
  requestId: string,
  details?: unknown
): { success: false; error: { code: string; message: string; details?: unknown }; requestId: string } {
  const definition = getErrorDefinition(code);
  return {
    success: false,
    error: {
      code,
      message: definition?.message || 'Unknown error',
      details,
    },
    requestId,
  };
}
