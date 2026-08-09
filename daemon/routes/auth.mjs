import { asyncHandler, AppError } from '../lib/route-utils.mjs';
import {
  hashPassword,
  verifyPassword,
  createToken,
  makeId,
  authMiddleware,
  blacklistCurrentToken,
} from '../lib/auth.mjs';
import { prepare } from '../db/connection.mjs';
import { authRateLimit, recordFailedLogin, clearFailedLogin } from '../lib/rate-limit.mjs';

function validatePassword(password) {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one digit';
  return null;
}

export function registerAuthRoutes(app) {
  app.post(
    '/api/v1/auth/register',
    authRateLimit,
    asyncHandler(async (req, res) => {
      const { email, password, name } = req.body;
      if (!email || !password) throw new AppError('Email and password required', 400);
      const passwordError = validatePassword(password);
      if (passwordError) throw new AppError(passwordError, 400);

      const existing = prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (existing) throw new AppError('Email already registered', 409);

      const id = makeId('usr_');
      const passwordHash = await hashPassword(password);
      prepare('INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)').run(
        id,
        email,
        name || '',
        passwordHash,
      );

      const token = createToken({ sub: id, email, role: 'user' });
      res.status(201).json({
        user: { id, email, name: name || '', role: 'user', tier: 'free' },
        token,
      });
    }),
  );

  app.post(
    '/api/v1/auth/login',
    authRateLimit,
    asyncHandler(async (req, res) => {
      const { email, password } = req.body;
      if (!email || !password) throw new AppError('Email and password required', 400);

      const user = prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (!user) {
        recordFailedLogin(email);
        throw new AppError('Invalid email or password', 401);
      }

      const valid = await verifyPassword(password, user.password_hash);
      if (!valid) {
        recordFailedLogin(email);
        throw new AppError('Invalid email or password', 401);
      }

      clearFailedLogin(email);

      const token = createToken({ sub: user.id, email: user.email, role: user.role });
      res.json({
        user: { id: user.id, email: user.email, name: user.name, role: user.role, tier: user.tier },
        token,
      });
    }),
  );

  app.get(
    '/api/v1/auth/me',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const user = prepare('SELECT id, email, name, role, tier, created_at FROM users WHERE id = ?').get(req.user.id);
      if (!user) throw new AppError('User not found', 404);
      res.json({ user });
    }),
  );

  app.post('/api/v1/auth/logout', authMiddleware(), (req, res) => {
    blacklistCurrentToken(req);
    res.json({ success: true, message: 'Token revoked.' });
  });

  app.post(
    '/api/v1/auth/change-password',
    authMiddleware(),
    asyncHandler(async (req, res) => {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) throw new AppError('Current and new password required', 400);
      const passwordError = validatePassword(newPassword);
      if (passwordError) throw new AppError(passwordError, 400);

      const user = prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
      if (!user) throw new AppError('User not found', 404);

      const valid = await verifyPassword(currentPassword, user.password_hash);
      if (!valid) throw new AppError('Current password is incorrect', 401);

      const newHash = await hashPassword(newPassword);
      prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(newHash, user.id);
      res.json({ success: true });
    }),
  );
}
