import jwt, { SignOptions } from 'jsonwebtoken';

export interface JwtPayload {
  userId: number;
  username: string;
  iat?: number;
  exp?: number;
}

export function signToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  const opts: SignOptions = { expiresIn: (process.env.JWT_EXPIRES_IN ?? '30m') as SignOptions['expiresIn'] };
  return jwt.sign(payload, process.env.JWT_SECRET!, opts);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
}
