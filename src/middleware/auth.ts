import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export interface AuthenticatedRequest extends Request {
  apiKey?: string;
}

export function authenticateApiKey(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    res.status(401).json({ success: false, error: 'API key required' });
    return;
  }

  if (apiKey !== config.softIA.apiKey) {
    res.status(401).json({ success: false, error: 'Invalid API key' });
    return;
  }

  req.apiKey = apiKey;
  next();
}

export function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string;

  if (apiKey) {
    if (apiKey === config.softIA.apiKey) {
      req.apiKey = apiKey;
    }
  }

  next();
}