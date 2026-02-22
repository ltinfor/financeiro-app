import express from 'express';
import supabase from '../config/supabase.js';

const router = express.Router();

// GET /api/equipamentos
router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('equipamentos')
            .select('*, projetos(nome)')
            .order('criado_em', { ascending: false });

        if (error) throw error;
        res.json({ sucesso: true, dados: data });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// GET /api/equipamentos/:id
router.get('/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('equipamentos')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;
        res.json({ sucesso: true, dados: data });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// POST /api/equipamentos
router.post('/', async (req, res) => {
    try {
        const { nome, numero_serie, data_aquisicao, valor, status, projeto_id, descricao } = req.body;

        const { data, error } = await supabase
            .from('equipamentos')
            .insert([{ nome, numero_serie, data_aquisicao, valor, status, projeto_id, descricao }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json({ sucesso: true, dados: data });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// PUT /api/equipamentos/:id
router.put('/:id', async (req, res) => {
    try {
        const { nome, numero_serie, data_aquisicao, valor, status, projeto_id, descricao } = req.body;

        const { data, error } = await supabase
            .from('equipamentos')
            .update({ nome, numero_serie, data_aquisicao, valor, status, projeto_id, descricao })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        res.json({ sucesso: true, dados: data });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// DELETE /api/equipamentos/:id
router.delete('/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('equipamentos')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ sucesso: true, mensagem: 'Equipamento excluído com sucesso.' });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

export default router;
