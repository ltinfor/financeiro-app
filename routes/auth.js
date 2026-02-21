// routes/auth.js
// Rotas de autenticação: login, logout e dados do usuário logado

import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import supabase from '../config/supabase.js';

const router = express.Router();

// Tempo de expiração do token JWT (7 dias)
const JWT_EXPIRY = '7d';
// Tempo de expiração do cookie (7 dias em ms)
const COOKIE_MAXAGE = 7 * 24 * 60 * 60 * 1000;

/**
 * POST /auth/login
 * Body: { email, senha }
 * Resposta: { sucesso, usuario } + seta cookie JWT
 */
router.post('/login', async (req, res) => {
    try {
        const { email, senha } = req.body;

        // Validação básica dos campos
        if (!email || !senha) {
            return res.status(400).json({
                sucesso: false,
                erro: 'E-mail e senha são obrigatórios.'
            });
        }

        // Buscar usuário pelo e-mail
        const { data: usuario, error } = await supabase
            .from('usuarios')
            .select('id, nome, email, senha_hash, ativo')
            .eq('email', email.toLowerCase().trim())
            .single();

        if (error || !usuario) {
            // Mensagem genérica para não revelar se o e-mail existe
            return res.status(401).json({
                sucesso: false,
                erro: 'E-mail ou senha incorretos.'
            });
        }

        // Verificar se o usuário está ativo
        if (!usuario.ativo) {
            return res.status(403).json({
                sucesso: false,
                erro: 'Usuário desativado. Entre em contato com o administrador.'
            });
        }

        // Comparar senha com o hash armazenado
        const senhaCorreta = await bcrypt.compare(senha, usuario.senha_hash);
        if (!senhaCorreta) {
            return res.status(401).json({
                sucesso: false,
                erro: 'E-mail ou senha incorretos.'
            });
        }

        // Gerar o token JWT
        const payload = { id: usuario.id, nome: usuario.nome, email: usuario.email };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRY });

        // Atualizar último login
        await supabase
            .from('usuarios')
            .update({ ultimo_login: new Date().toISOString() })
            .eq('id', usuario.id);

        // Definir cookie seguro (httpOnly impede acesso via JS)
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', // HTTPS em produção
            sameSite: 'strict',
            maxAge: COOKIE_MAXAGE
        });

        res.json({
            sucesso: true,
            usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email }
        });

    } catch (err) {
        console.error('Erro no login:', err);
        res.status(500).json({ sucesso: false, erro: 'Erro interno do servidor.' });
    }
});

/**
 * POST /auth/logout
 * Limpa o cookie de sessão
 */
router.post('/logout', (req, res) => {
    res.clearCookie('token', { httpOnly: true, sameSite: 'strict' });
    res.json({ sucesso: true, mensagem: 'Logout realizado com sucesso.' });
});

/**
 * POST /auth/recuperar-senha
 * Solicitação de redefinição de senha
 */
router.post('/recuperar-senha', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ sucesso: false, erro: 'E-mail é obrigatório.' });
    }

    try {
        // A lógica de envio de e-mail (NodeMailer / Resend) entraria aqui
        // usando a tabela `usuarios` ou token de recuperação.
        // Simulando delay de segurança
        await new Promise(resolve => setTimeout(resolve, 800));

        // Sempre retornar sucesso por boas práticas de segurança (evitar enumerar emails validos na API)
        res.json({
            sucesso: true,
            mensagem: 'Se o e-mail existir, um link de recuperação será enviado para a caixa de entrada.'
        });
    } catch (err) {
        console.error('Erro na recuperação:', err);
        res.status(500).json({ sucesso: false, erro: 'Erro interno ao processar recuperação.' });
    }
});

/**
 * GET /auth/me
 * Retorna dados do usuário autenticado (sem senha)
 */
router.get('/me', async (req, res) => {
    const token = req.cookies?.token;
    if (!token) {
        return res.status(401).json({ sucesso: false, erro: 'Não autenticado.' });
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);

        const { data: usuario } = await supabase
            .from('usuarios')
            .select('id, nome, email, ultimo_login, criado_em')
            .eq('id', payload.id)
            .single();

        res.json({ sucesso: true, usuario });
    } catch {
        res.clearCookie('token');
        res.status(401).json({ sucesso: false, erro: 'Sessão inválida.' });
    }
});

export default router;
