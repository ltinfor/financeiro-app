// routes/receitas.js
// CRUD completo para o módulo de Receitas

import express from 'express';
import supabase from '../config/supabase.js';

const router = express.Router();

// GET /api/receitas — Lista todas as receitas com filtros opcionais
// Query params: tipo (pessoal|empresarial), status, mes (YYYY-MM), categoria_id
router.get('/', async (req, res) => {
    try {
        const { tipo, status, mes, inicio, fim, categoria_id } = req.query;

        let query = supabase
            .from('receitas')
            .select(`
        *,
        categorias (id, nome, tipo, grupo)
      `)
            .order('data', { ascending: false });

        if (tipo) query = query.eq('tipo', tipo);
        if (status) query = query.eq('status', status);
        if (categoria_id) query = query.eq('categoria_id', categoria_id);
        if (inicio && fim) {
            query = query.gte('data', inicio).lte('data', fim);
        } else if (mes) {
            const inicioMes = `${mes}-01`;
            const fimMes = new Date(mes + '-01');
            fimMes.setMonth(fimMes.getMonth() + 1);
            query = query.gte('data', inicioMes).lt('data', fimMes.toISOString().split('T')[0]);
        }

        const { data, error } = await query;
        if (error) throw error;

        res.json({ sucesso: true, dados: data, total: data.length });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// GET /api/receitas/:id — Busca uma receita por ID
router.get('/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('receitas')
            .select('*, categorias (id, nome)')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ sucesso: false, erro: 'Receita não encontrada.' });

        res.json({ sucesso: true, dados: data });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// POST /api/receitas — Cria uma nova receita
// Body: { descricao, valor, data, categoria_id, tipo, status, observacoes }
router.post('/', async (req, res) => {
    try {
        const { descricao, valor, data, categoria_id, tipo, status, observacoes } = req.body;

        // Validações básicas
        if (!descricao || !valor || !categoria_id || !tipo) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Campos obrigatórios ausentes: descricao, valor, categoria_id, tipo.'
            });
        }

        const { data: novaReceita, error } = await supabase
            .from('receitas')
            .insert([{
                descricao,
                valor: parseFloat(valor),
                data: data || new Date().toISOString().split('T')[0],
                categoria_id: parseInt(categoria_id),
                tipo,
                status: status || 'pendente',
                observacoes
            }])
            .select('*, categorias (id, nome)')
            .single();

        if (error) throw error;

        res.status(201).json({ sucesso: true, dados: novaReceita });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// PUT /api/receitas/:id — Atualiza uma receita
router.put('/:id', async (req, res) => {
    try {
        const atualizacoes = req.body;
        if (atualizacoes.valor) atualizacoes.valor = parseFloat(atualizacoes.valor);

        const { data, error } = await supabase
            .from('receitas')
            .update(atualizacoes)
            .eq('id', req.params.id)
            .select('*, categorias (id, nome)')
            .single();

        if (error) throw error;

        res.json({ sucesso: true, dados: data });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// DELETE /api/receitas/:id — Remove uma receita
router.delete('/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('receitas')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;

        res.json({ sucesso: true, mensagem: 'Receita removida com sucesso.' });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

export default router;
