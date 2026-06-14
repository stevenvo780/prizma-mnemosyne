import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export interface AuthenticatedRequest extends Request {
  apiKey?: string;
}

export function authenticateApiKey(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string;
  
  if (!apiKey) {
    return res.status(401).json({ success: false, error: 'API key required' });
  }
  
  if (apiKey !== config.softIA.apiKey) {
    return res.status(401).json({ success: false, error: 'Invalid API key' });
  }
  
  req.apiKey = apiKey;
  next();
}

export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string;
  
  if (apiKey) {
    if (apiKey === config.softIA.apiKey) {
      req.apiKey = apiKey;
    }
  }
  
  next();
}