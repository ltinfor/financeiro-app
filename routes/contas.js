// routes/contas.js
// CRUD completo para Contas a Pagar / Receber com controle de vencimentos

import express from 'express';
import supabase from '../config/supabase.js';

const router = express.Router();

// GET /api/contas — Lista contas com filtros
// Query params: tipo_conta (pagar|receber), tipo (pessoal|empresarial), status, vencendo_em_dias
router.get('/', async (req, res) => {
    try {
        const { tipo_conta, tipo, status, vencendo_em_dias, mes } = req.query;

        let query = supabase
            .from('contas_pagar_receber')
            .select(`
        *,
        categorias (id, nome, tipo, grupo)
      `)
            .order('vencimento', { ascending: true });

        if (tipo_conta) query = query.eq('tipo_conta', tipo_conta);
        if (tipo) query = query.eq('tipo', tipo);
        if (status) query = query.eq('status', status);

        if (mes) {
            const ano = mes.split('-')[0];
            const m = mes.split('-')[1];
            const ultimoDia = new Date(ano, m, 0).getDate();
            query = query
                .gte('vencimento', `${mes}-01`)
                .lte('vencimento', `${mes}-${ultimoDia}`);
        }

        // Filtro: contas vencendo nos próximos N dias
        if (vencendo_em_dias) {
            const hoje = new Date();
            const limite = new Date();
            limite.setDate(hoje.getDate() + parseInt(vencendo_em_dias));
            query = query
                .gte('vencimento', hoje.toISOString().split('T')[0])
                .lte('vencimento', limite.toISOString().split('T')[0]);
        }

        const { data, error } = await query;
        if (error) throw error;

        res.json({ sucesso: true, dados: data, total: data.length });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// GET /api/contas/resumo — Resumo rápido por status
router.get('/resumo', async (req, res) => {
    try {
        const { mes } = req.query;
        let query = supabase
            .from('contas_pagar_receber')
            .select('tipo_conta, status, valor, vencimento');

        if (mes) {
            const ano = mes.split('-')[0];
            const m = mes.split('-')[1];
            const ultimoDia = new Date(ano, m, 0).getDate();
            const gteDate = `${mes}-01`;
            const lteDate = `${mes}-${ultimoDia}`;
            console.log(`[DEBUG] Contas/Resumo - Filtro de mês: ${mes} | GTE: ${gteDate} | LTE: ${lteDate}`);
            query = query
                .gte('vencimento', gteDate)
                .lte('vencimento', lteDate);
        }

        const { data, error } = await query;
        console.log(`[DEBUG] Contas/Resumo - Dados encontrados: ${data ? data.length : 0}`);

        if (error) throw error;

        const resumo = {
            a_pagar: { pendente: 0, pago: 0, atrasado: 0, total: 0 },
            a_receber: { pendente: 0, pago: 0, atrasado: 0, total: 0 }
        };

        data.forEach(c => {
            const chave = c.tipo_conta === 'pagar' ? 'a_pagar' : 'a_receber';
            resumo[chave][c.status] = (resumo[chave][c.status] || 0) + parseFloat(c.valor);
            resumo[chave].total += parseFloat(c.valor);
        });

        res.json({ sucesso: true, dados: resumo });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// GET /api/contas/:id — Busca uma conta por ID
router.get('/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('contas_pagar_receber')
            .select('*, categorias (id, nome)')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ sucesso: false, erro: 'Conta não encontrada.' });

        res.json({ sucesso: true, dados: data });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// POST /api/contas — Cria uma nova conta a pagar/receber
router.post('/', async (req, res) => {
    try {
        const {
            descricao, valor, tipo_conta, tipo, categoria_id,
            vencimento, status, recibo_url, parcelas_total, observacoes
        } = req.body;

        if (!descricao || !valor || !tipo_conta || !tipo || !vencimento) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Campos obrigatórios: descricao, valor, tipo_conta, tipo, vencimento.'
            });
        }

        const isRecorrente = req.body.recorrente === true || req.body.recorrente === 'true';
        const repeticoes = isRecorrente ? (req.body.parcelas_total ? parseInt(req.body.parcelas_total) : 12) : 1;
        const registros = [];

        for (let i = 0; i < repeticoes; i++) {
            let dataVenc = new Date(vencimento + 'T12:00:00'); // T12 para evitar conflito de fuso horário
            dataVenc.setMonth(dataVenc.getMonth() + i);
            let novoVenc = dataVenc.toISOString().split('T')[0];

            let novaDescricao = descricao;
            if (isRecorrente) novaDescricao += ` (${i + 1}/${repeticoes})`;

            registros.push({
                descricao: novaDescricao,
                valor: parseFloat(valor),
                tipo_conta,
                tipo,
                categoria_id: categoria_id ? parseInt(categoria_id) : null,
                vencimento: novoVenc,
                status: status || 'pendente',
                recibo_url: recibo_url || null,
                parcelas_total: isRecorrente ? repeticoes : (parcelas_total ? parseInt(parcelas_total) : 1),
                parcela_atual: isRecorrente ? i + 1 : 1,
                observacoes: observacoes || null
            });
        }

        const { data, error } = await supabase
            .from('contas_pagar_receber')
            .insert(registros)
            .select('*');

        if (error) throw error;

        res.status(201).json({ sucesso: true, dados: data });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// PUT /api/contas/:id — Atualiza uma conta (ex: marcar como pago)
router.put('/:id', async (req, res) => {
    try {
        // Usa desconstrução segura para não referenciar o req.body original e apagar campos extras
        const isRecorrente = req.body.recorrente === true || req.body.recorrente === 'true';
        let mesesRecorrencia = 12;
        if (isRecorrente) {
            mesesRecorrencia = req.body.parcelas_total ? parseInt(req.body.parcelas_total) : 12;
        }

        const atualizacoes = { ...req.body };
        delete atualizacoes.recorrente;

        if (atualizacoes.valor) atualizacoes.valor = parseFloat(atualizacoes.valor);

        // Se marcando como pago, registra a data de pagamento
        if (atualizacoes.status === 'pago' && !atualizacoes.data_pagamento) {
            atualizacoes.data_pagamento = new Date().toISOString().split('T')[0];
        }

        // Se for promovida a recorrente
        if (isRecorrente) {
            atualizacoes.descricao = atualizacoes.descricao ? (atualizacoes.descricao + ` (1/${mesesRecorrencia})`) : `Conta recorrente (1/${mesesRecorrencia})`;
            atualizacoes.parcelas_total = mesesRecorrencia;
            atualizacoes.parcela_atual = 1;
        }

        const { data, error } = await supabase
            .from('contas_pagar_receber')
            .update(atualizacoes)
            .eq('id', req.params.id)
            .select('*')
            .single();

        if (error) throw error;

        // Gerar contas adicionais se foi marcado como recorrente
        if (isRecorrente && data) {
            const registrosExtras = [];
            for (let i = 1; i < mesesRecorrencia; i++) {
                let dataVenc = new Date(data.vencimento + 'T12:00:00');
                dataVenc.setMonth(dataVenc.getMonth() + i);
                let novoVenc = dataVenc.toISOString().split('T')[0];

                registrosExtras.push({
                    descricao: data.descricao.replace(`(1/${mesesRecorrencia})`, `(${i + 1}/${mesesRecorrencia})`),
                    valor: data.valor,
                    tipo_conta: data.tipo_conta,
                    tipo: data.tipo,
                    categoria_id: data.categoria_id || null,
                    vencimento: novoVenc,
                    status: 'pendente',
                    parcelas_total: 12,
                    parcela_atual: i + 1,
                    observacoes: data.observacoes || null
                });
            }
            if (registrosExtras.length > 0) {
                await supabase.from('contas_pagar_receber').insert(registrosExtras);
            }
        }

        res.json({ sucesso: true, dados: data });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// DELETE /api/contas/:id — Remove uma conta
router.delete('/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('contas_pagar_receber')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;

        res.json({ sucesso: true, mensagem: 'Conta removida com sucesso.' });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

export default router;
