// routes/usuarios.js
import express from 'express';
import bcrypt from 'bcryptjs';
import supabase from '../config/supabase.js';

const router = express.Router();

// GET /api/usuarios
router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('usuarios')
            .select('id, nome, email, ativo, ultimo_login, criado_em')
            .order('nome');

        if (error) throw error;
        res.json({ sucesso: true, dados: data });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// GET /api/usuarios/:id
router.get('/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('usuarios')
            .select('id, nome, email, ativo')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;
        res.json({ sucesso: true, dados: data });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// POST /api/usuarios
router.post('/', async (req, res) => {
    try {
        const { nome, email, senha, ativo } = req.body;
        if (!nome || !email || !senha) {
            return res.status(400).json({ sucesso: false, erro: 'Nome, E-mail e Senha são obrigatórios.' });
        }

        const emailTrim = email.toLowerCase().trim();
        const senha_hash = await bcrypt.hash(senha, 10);

        const { data, error } = await supabase
            .from('usuarios')
            .insert([{ nome, email: emailTrim, senha_hash, ativo: ativo !== false }])
            .select('id, nome, email')
            .single();

        if (error) throw error;
        res.status(201).json({ sucesso: true, dados: data });
    } catch (err) {
        let errMsg = err.message;
        if (err.code === '23505') errMsg = 'E-mail já cadastrado.';
        res.status(500).json({ sucesso: false, erro: errMsg });
    }
});

// PUT /api/usuarios/:id
router.put('/:id', async (req, res) => {
    try {
        const { nome, email, senha, ativo } = req.body;
        const atualizacoes = { nome, email: email?.toLowerCase()?.trim(), ativo };

        if (senha) {
            atualizacoes.senha_hash = await bcrypt.hash(senha, 10);
        }

        const { data, error } = await supabase
            .from('usuarios')
            .update(atualizacoes)
            .eq('id', req.params.id)
            .select('id, nome, email')
            .single();

        if (error) throw error;
        res.json({ sucesso: true, dados: data });
    } catch (err) {
        let errMsg = err.message;
        if (err.code === '23505') errMsg = 'E-mail já cadastrado.';
        res.status(500).json({ sucesso: false, erro: errMsg });
    }
});

// DELETE /api/usuarios/:id
router.delete('/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('usuarios')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ sucesso: true, mensagem: 'Usuário removido com sucesso.' });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

export default router;
