export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: {
    request_id?: string;
    computed_at?: string;
    pagination?: {
      total: number;
      limit: number;
      offset: number;
      has_more: boolean;
    };
  };
}
