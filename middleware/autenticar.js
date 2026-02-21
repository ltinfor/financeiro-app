// middleware/autenticar.js
// Lê JWT_SECRET dentro das funções (não no nível do módulo)
// para garantir que dotenv já foi carregado

import jwt from 'jsonwebtoken';

/**
 * Middleware para rotas de API (/api/*)
 * Retorna JSON 401 se não autenticado
 */
export function autenticarAPI(req, res, next) {
    const JWT_SECRET = process.env.JWT_SECRET;

    if (!JWT_SECRET) {
        return res.status(503).json({ sucesso: false, erro: 'Servidor mal configurado. JWT_SECRET ausente.' });
    }

    const token = req.cookies?.token;
    if (!token) {
        return res.status(401).json({
            sucesso: false,
            erro: 'Não autenticado. Faça login para continuar.',
            redirect: '/login'
        });
    }

    try {
        req.usuario = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.clearCookie('token');
        return res.status(401).json({
            sucesso: false,
            erro: 'Sessão expirada. Faça login novamente.',
            redirect: '/login'
        });
    }
}

/**
 * Middleware para páginas HTML
 * Redireciona para /login se não autenticado
 */
export function autenticarPagina(req, res, next) {
    const JWT_SECRET = process.env.JWT_SECRET;

    if (!JWT_SECRET) {
        return res.redirect('/login');
    }

    const token = req.cookies?.token;
    if (!token) {
        return res.redirect('/login');
    }

    try {
        req.usuario = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.clearCookie('token');
        return res.redirect('/login');
    }
}
