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
            const [anoStr, mesStr] = mes.split('-');
            const prevAno = parseInt(anoStr, 10);
            const prevMes = parseInt(mesStr, 10);
            const nextMes = prevMes === 12 ? 1 : prevMes + 1;
            const nextAno = prevMes === 12 ? prevAno + 1 : prevAno;
            const inicioMes = `${mes}-01`;
            const fimMesStr = `${nextAno}-${String(nextMes).padStart(2, '0')}-01`;
            query = query.gte('data', inicioMes).lt('data', fimMesStr);
        }

        let dataInicioCalc = null;
        if (inicio) dataInicioCalc = inicio;
        else if (mes) dataInicioCalc = `${mes}-01`;

        const { data, error } = await query;
        if (error) throw error;

        // Injetar Saldo Anterior apenas se houver um filtro de mes ou inicio, e o saldo for maior que zero
        if (dataInicioCalc) {
            let qReceitaAnt = supabase.from('receitas').select('valor').lt('data', dataInicioCalc).eq('status', 'recebido');
            let qDespesaAnt = supabase.from('despesas').select('valor').lt('data', dataInicioCalc).eq('status', 'pago');

            if (tipo) {
                qReceitaAnt = qReceitaAnt.eq('tipo', tipo);
                qDespesaAnt = qDespesaAnt.eq('tipo', tipo);
            }

            const [{ data: rAnt }, { data: dAnt }] = await Promise.all([qReceitaAnt, qDespesaAnt]);

            const recTot = (rAnt || []).reduce((acc, r) => acc + parseFloat(r.valor), 0);
            const despTot = (dAnt || []).reduce((acc, d) => acc + parseFloat(d.valor), 0);
            const saldoAnterior = recTot - despTot;

            if (saldoAnterior !== 0) {
                data.unshift({
                    id: 'saldo-anterior',
                    descricao: 'Saldo Anterior (Mês Anterior)',
                    valor: saldoAnterior,
                    data: dataInicioCalc,
                    tipo: tipo || 'Geral',
                    status: 'recebido',
                    categorias: { nome: 'Saldo Acumulado' },
                    _isSaldoAnterior: true
                });
            }
        }

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
