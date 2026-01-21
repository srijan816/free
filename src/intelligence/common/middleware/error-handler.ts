import { NextFunction, Request, Response } from 'express';

export const errorHandler = (
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: error.message
    }
  });
};
