import express from 'express';
import { z } from 'zod';
import {
    forgotPasswordSchema,
    loginSchema,
    registerSchema,
    resetPasswordSchema
} from '../schemas/auth';
import {
    login,
    logoutSession,
    refreshSession,
    registerUser,
    requestPasswordReset,
    resetPassword,
    REFRESH_TOKEN_TTL_DAYS
} from '../services/authService';
import { authenticateRequest, type AuthenticatedRequest } from '../middleware/rbac';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';

const router: express.Router = express.Router();

function getContext(req: express.Request) {
    return {
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || undefined
    };
}

function requireCsrf(req: express.Request, res: express.Response) {
    const cookieToken = req.cookies['csrf'];
    const headerToken = req.get('x-csrf-token');

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
        res.status(403).json({ success: false, message: 'CSRF validation failed' });
        return false;
    }

    return true;
}

function setSessionCookies(res: express.Response, refreshToken: string, csrfToken: string) {
    const secure = process.env.NODE_ENV === 'production';
    // Frontend and API are deployed on different vercel.app subdomains, which are
    // cross-site to each other (vercel.app is on the public suffix list). SameSite=Lax
    // cookies are never sent on cross-site XHR/fetch, so the refresh cookie would
    // silently stop working in production — SameSite=None (+ Secure, required by spec)
    // is needed there. Locally, frontend/API share the "localhost" site, so Lax is fine
    // and avoids requiring HTTPS in dev.
    const sameSite = secure ? 'none' as const : 'lax' as const;
    // Without maxAge these default to session cookies, which browsers are free
    // to evict on tab/background lifecycle events well before the 30-day token
    // in the DB actually expires — give them a matching lifetime explicitly.
    const maxAge = 1000 * 60 * 60 * 24 * REFRESH_TOKEN_TTL_DAYS;
    res.cookie('rt', refreshToken, {
        httpOnly: true,
        secure,
        sameSite,
        path: '/api/v1/auth/refresh',
        maxAge
    });

    res.cookie('csrf', csrfToken, {
        httpOnly: false,
        secure,
        sameSite,
        path: '/',
        maxAge
    });
}

router.post('/register', async (req, res, next) => {
    try {
        const parsed = registerSchema.parse(req.body);
        const user = await registerUser(parsed);
        res.status(201).json({ success: true, message: 'Registered', data: { id: user.id, email: user.email } });
    } catch (error) {
        next(error);
    }
});

router.post('/login', async (req, res, next) => {
    try {
        const parsed = loginSchema.parse(req.body);
        const session = await login(parsed, getContext(req));
        setSessionCookies(res, session.refreshToken, session.csrfToken);
        res.json({
            success: true,
            message: 'Logged in',
            data: {
                accessToken: session.accessToken,
                csrfToken: session.csrfToken,
                user: {
                    id: session.user.id,
                    email: session.user.email,
                    firstName: session.user.firstName,
                    lastName: session.user.lastName,
                    roles: session.user.roles.map((r: any) => r.role),
                    departmentId: session.user.departmentId,
                    department: session.user.department,
                    mustChangePassword: session.user.mustChangePassword ?? false,
                }
            }
        });
    } catch (error) {
        next(error);
    }
});

router.post('/refresh', async (req, res, next) => {
    try {
        if (!requireCsrf(req, res)) {
            return;
        }

        const refreshToken = req.cookies['rt'] || req.body.refreshToken;
        if (!refreshToken) {
            res.status(401).json({ success: false, message: 'Missing refresh token' });
            return;
        }

        const session = await refreshSession(refreshToken, getContext(req));
        setSessionCookies(res, session.refreshToken, session.csrfToken);
        res.json({
            success: true,
            message: 'Session refreshed',
            data: { accessToken: session.accessToken, csrfToken: session.csrfToken },
        });
    } catch (error) {
        next(error);
    }
});

router.post('/logout', async (req, res, next) => {
    try {
        if (!requireCsrf(req, res)) {
            return;
        }

        const refreshToken = req.cookies['rt'] || req.body.refreshToken;
        if (refreshToken) {
            await logoutSession(refreshToken, getContext(req));
        }

        const secure = process.env.NODE_ENV === 'production';
        res.clearCookie('rt', { httpOnly: true, secure, sameSite: 'lax', path: '/api/v1/auth/refresh' });
        res.clearCookie('csrf', { secure, sameSite: 'lax', path: '/' });
        res.json({ success: true, message: 'Logged out' });
    } catch (error) {
        next(error);
    }
});

router.post('/forgot-password', async (req, res, next) => {
    try {
        const parsed = forgotPasswordSchema.parse(req.body);
        await requestPasswordReset(parsed, getContext(req));
        res.json({ success: true, message: 'If the account exists, a reset email has been sent' });
    } catch (error) {
        next(error);
    }
});

router.post('/reset-password', async (req, res, next) => {
    try {
        const parsed = resetPasswordSchema.parse(req.body);
        await resetPassword(parsed, getContext(req));
        res.json({ success: true, message: 'Password updated' });
    } catch (error) {
        next(error);
    }
});

const changePasswordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

router.post('/change-password', authenticateRequest, async (req: AuthenticatedRequest, res, next) => {
    try {
        const userId = req.auth?.sub;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Authentication required' });
            return;
        }
        const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            res.status(404).json({ success: false, message: 'User not found' });
            return;
        }

        const valid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!valid) {
            res.status(400).json({ success: false, message: 'Current password is incorrect' });
            return;
        }

        const newHash = await bcrypt.hash(newPassword, 12);
        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash: newHash, passwordChangedAt: new Date(), mustChangePassword: false },
        });

        res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
        next(error);
    }
});

export default router;
