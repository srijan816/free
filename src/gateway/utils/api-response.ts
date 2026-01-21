export interface ApiMeta {
  timestamp: string;
  request_id: string;
  pagination?: {
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
  summary?: Record<string, unknown>;
}

export function successResponse<T>(requestId: string, data: T, meta: Partial<ApiMeta> = {}) {
  return {
    success: true as const,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      request_id: requestId,
      ...meta
    }
  };
}

export function errorResponse(
  requestId: string,
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    field_errors?: Array<{ field: string; message: string; code: string }>;
  }
) {
  return {
    success: false as const,
    error,
    meta: {
      timestamp: new Date().toISOString(),
      request_id: requestId
    }
  };
}
