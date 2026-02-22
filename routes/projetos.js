import express from 'express';
import supabase from '../config/supabase.js';

const router = express.Router();

// GET /api/projetos
router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('projetos')
            .select('*')
            .order('criado_em', { ascending: false });

        if (error) throw error;
        res.json({ sucesso: true, dados: data });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// GET /api/projetos/:id
router.get('/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('projetos')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;
        res.json({ sucesso: true, dados: data });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// POST /api/projetos
router.post('/', async (req, res) => {
    try {
        const { nome, descricao, data_inicio, data_fim, status, orcamento } = req.body;

        const { data, error } = await supabase
            .from('projetos')
            .insert([{ nome, descricao, data_inicio, data_fim, status, orcamento }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json({ sucesso: true, dados: data });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// PUT /api/projetos/:id
router.put('/:id', async (req, res) => {
    try {
        const { nome, descricao, data_inicio, data_fim, status, orcamento } = req.body;

        const { data, error } = await supabase
            .from('projetos')
            .update({ nome, descricao, data_inicio, data_fim, status, orcamento })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        res.json({ sucesso: true, dados: data });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// DELETE /api/projetos/:id
router.delete('/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('projetos')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ sucesso: true, mensagem: 'Projeto excluído com sucesso.' });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

export default router;
