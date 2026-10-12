import { asyncHandler, AppError } from '../lib/route-utils.mjs';
import {
  hashPassword,
  verifyPassword,
  createToken,
  makeId,
  authMiddleware,
  blacklistCurrentToken,
  generateResetToken,
  hashToken,
} from '../lib/auth.mjs';
import { prepare } from '../db/connection.mjs';
import { authRateLimit, refreshRateLimit, recordFailedLogin, clearFailedLogin } from '../lib/rate-limit.mjs';
import { sendPasswordResetEmail } from '../lib/mailer.mjs';
import {
  issueRefreshToken,
  rotateRefreshToken,
  revokeUserRefreshTokens,
} from '../lib/refresh-tokens.mjs';
import { validateBody } from '../lib/validate.mjs';
import {
  RegisterSchema,
  LoginSchema,
  ChangePasswordSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  RefreshTokenSchema,
} from '../lib/schemas.mjs';

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
    validateBody(RegisterSchema),
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

      const token = createToken({ sub: id, email, role: 'user', tv: 0 });
      const refreshToken = issueRefreshToken(id);
      res.status(201).json({
        user: { id, email, name: name || '', role: 'user', tier: 'free' },
        token,
        refreshToken,
      });
    }),
  );

  app.post(
    '/api/v1/auth/login',
    authRateLimit,
    validateBody(LoginSchema),
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

      const token = createToken({ sub: user.id, email: user.email, role: user.role, tv: user.token_version ?? 0 });
      const refreshToken = issueRefreshToken(user.id);
      res.json({
        user: { id: user.id, email: user.email, name: user.name, role: user.role, tier: user.tier },
        token,
        refreshToken,
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

  // Logging out ends every session for the user (all of their refresh tokens are
  // revoked) and blacklists the current access token. Ending all sessions is the
  // safer default; a per-device logout would need per-session token ids.
  app.post('/api/v1/auth/logout', authMiddleware(), (req, res) => {
    blacklistCurrentToken(req);
    revokeUserRefreshTokens(req.user.id);
    res.json({ success: true, message: 'Token revoked.' });
  });

  // Exchange a refresh token for a fresh access token. The presented refresh
  // token is rotated (single-use): a new one is returned and the old is revoked.
  app.post(
    '/api/v1/auth/refresh',
    refreshRateLimit,
    validateBody(RefreshTokenSchema),
    asyncHandler(async (req, res) => {
      const { refreshToken } = req.body;
      if (!refreshToken) throw new AppError('refreshToken required', 400);

      const rotated = rotateRefreshToken(refreshToken);
      if (!rotated) throw new AppError('Invalid or expired refresh token', 401);

      const user = prepare('SELECT id, email, name, role, tier, token_version FROM users WHERE id = ?').get(
        rotated.userId,
      );
      if (!user) throw new AppError('User not found', 401);

      const token = createToken({ sub: user.id, email: user.email, role: user.role, tv: user.token_version ?? 0 });
      res.json({
        token,
        refreshToken: rotated.token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role, tier: user.tier },
      });
    }),
  );

  app.post(
    '/api/v1/auth/change-password',
    authMiddleware(),
    validateBody(ChangePasswordSchema),
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
      // Bumping token_version invalidates every access token minted before this
      // change; revoking refresh tokens stops other sessions minting new ones.
      prepare(
        "UPDATE users SET password_hash = ?, token_version = token_version + 1, updated_at = datetime('now') WHERE id = ?",
      ).run(newHash, user.id);
      revokeUserRefreshTokens(user.id);
      res.json({ success: true });
    }),
  );

  // Start a reset. Always reports success (and is rate limited) so the endpoint
  // cannot be used to discover which emails are registered.
  app.post(
    '/api/v1/auth/forgot-password',
    authRateLimit,
    validateBody(ForgotPasswordSchema),
    asyncHandler(async (req, res) => {
      const email = String(req.body.email || '').trim();
      const generic = {
        success: true,
        message: 'If that email is registered, a reset link has been sent.',
      };
      if (!email) {
        res.json(generic);
        return;
      }

      const user = prepare('SELECT id, email FROM users WHERE email = ?').get(email);
      if (user) {
        const token = generateResetToken();
        const ttlSec = parseInt(process.env.NOKTA_PASSWORD_RESET_TTL_SEC || '3600', 10);
        const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();
        // Only one live reset link per user at a time.
        prepare('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL').run(user.id);
        prepare(
          'INSERT INTO password_resets (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
        ).run(makeId('pr_'), user.id, hashToken(token), expiresAt);

        const base = (process.env.NOKTA_PUBLIC_URL || '').replace(/\/$/, '');
        const resetUrl = `${base}/reset-password?token=${token}`;
        await sendPasswordResetEmail(user.email, resetUrl);
      }

      res.json(generic);
    }),
  );

  // Complete a reset with the one-time token from the email.
  app.post(
    '/api/v1/auth/reset-password',
    authRateLimit,
    validateBody(ResetPasswordSchema),
    asyncHandler(async (req, res) => {
      const { token, password } = req.body;
      if (!token || !password) throw new AppError('Token and new password required', 400);
      const passwordError = validatePassword(password);
      if (passwordError) throw new AppError(passwordError, 400);

      const row = prepare(
        'SELECT id, user_id, expires_at FROM password_resets WHERE token_hash = ? AND used_at IS NULL',
      ).get(hashToken(token));
      if (!row) throw new AppError('Invalid or expired reset token', 400);

      if (new Date(row.expires_at).getTime() < Date.now()) {
        prepare('DELETE FROM password_resets WHERE id = ?').run(row.id);
        throw new AppError('Invalid or expired reset token', 400);
      }

      const newHash = await hashPassword(password);
      prepare(
        "UPDATE users SET password_hash = ?, token_version = token_version + 1, updated_at = datetime('now') WHERE id = ?",
      ).run(newHash, row.user_id);
      // Consume the token and drop any other outstanding ones for this user.
      prepare("UPDATE password_resets SET used_at = datetime('now') WHERE id = ?").run(row.id);
      prepare('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL').run(row.user_id);
      // A reset is a recovery event: kill every live refresh token so a
      // possibly-compromised session cannot mint new access tokens.
      revokeUserRefreshTokens(row.user_id);

      res.json({ success: true, message: 'Password has been reset.' });
    }),
  );
}
