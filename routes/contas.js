// routes/contas.js
// CRUD completo para Contas a Pagar / Receber com controle de vencimentos

import express from 'express';
import supabase from '../config/supabase.js';

const router = express.Router();

// GET /api/contas — Lista contas com filtros
// Query params: tipo_conta (pagar|receber), tipo (pessoal|empresarial), status, vencendo_em_dias, inicio, fim
router.get('/', async (req, res) => {
    try {
        const { tipo_conta, tipo, status, vencendo_em_dias, inicio, fim } = req.query;

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

        // Filtro por data
        if (inicio && fim) {
            query = query.gte('vencimento', inicio).lte('vencimento', fim);
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
        const { tipo, inicio, fim } = req.query;

        let query = supabase
            .from('contas_pagar_receber')
            .select('tipo_conta, status, valor');

        if (tipo) query = query.eq('tipo', tipo);
        if (inicio && fim) {
            query = query.gte('vencimento', inicio).lte('vencimento', fim);
        }

        const { data, error } = await query;

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

        const { data, error } = await supabase
            .from('contas_pagar_receber')
            .insert([{
                descricao,
                valor: parseFloat(valor),
                tipo_conta,
                tipo,
                categoria_id: categoria_id ? parseInt(categoria_id) : null,
                vencimento,
                status: status || 'pendente',
                recibo_url: recibo_url || null,
                parcelas_total: parcelas_total || 1,
                observacoes: observacoes || null
            }])
            .select('*')
            .single();

        if (error) throw error;

        res.status(201).json({ sucesso: true, dados: data });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// PUT /api/contas/:id — Atualiza uma conta (ex: marcar como pago)
router.put('/:id', async (req, res) => {
    try {
        const atualizacoes = req.body;
        if (atualizacoes.valor) atualizacoes.valor = parseFloat(atualizacoes.valor);

        // Se marcando como pago, registra a data de pagamento
        let marcandoComoPago = false;
        if (atualizacoes.status === 'pago') {
            marcandoComoPago = true;
            if (!atualizacoes.data_pagamento) {
                atualizacoes.data_pagamento = new Date().toISOString().split('T')[0];
            }
        }

        const { data: contaAtualizada, error } = await supabase
            .from('contas_pagar_receber')
            .update(atualizacoes)
            .eq('id', req.params.id)
            .select('*')
            .single();

        if (error) throw error;

        // --- INTEGRAÇÃO COM RECEITAS E DESPESAS ---
        // Quando a conta for baixada (marcada como paga no atualizar), gerar no fluxo principal de Receitas ou Despesas.
        if (marcandoComoPago && contaAtualizada) {
            let catId = contaAtualizada.categoria_id;

            // Se a conta não tem categoria, buscar uma categoria padrão (Outras)
            if (!catId) {
                const grupoBusca = contaAtualizada.tipo_conta === 'pagar' ? 'despesa' : 'receita';

                // Tenta achar 'Outras Despesas'/'Outras Receitas'
                const { data: catFallback } = await supabase
                    .from('categorias')
                    .select('id')
                    .eq('tipo', contaAtualizada.tipo)
                    .eq('grupo', grupoBusca)
                    .ilike('nome', 'Outras%')
                    .limit(1)
                    .single();

                if (catFallback) {
                    catId = catFallback.id;
                } else {
                    // Pega qualquer categoria válida como último recurso
                    const { data: catAny } = await supabase
                        .from('categorias')
                        .select('id')
                        .eq('tipo', contaAtualizada.tipo)
                        .eq('grupo', grupoBusca)
                        .limit(1)
                        .single();
                    if (catAny) catId = catAny.id;
                }
            }

            if (contaAtualizada.tipo_conta === 'pagar') {
                const resD = await supabase.from('despesas').insert([{
                    descricao: `Ref. Conta a Pagar: ${contaAtualizada.descricao}`,
                    valor: contaAtualizada.valor,
                    data: contaAtualizada.data_pagamento || new Date().toISOString().split('T')[0],
                    categoria_id: catId,
                    tipo: contaAtualizada.tipo,
                    status: 'pago',
                    observacoes: contaAtualizada.observacoes || 'Gerado automaticamente ao baixar conta a pagar.'
                }]);
                if (resD.error) console.error('Erro na integração (Despesa):', resD.error);
            } else if (contaAtualizada.tipo_conta === 'receber') {
                const resR = await supabase.from('receitas').insert([{
                    descricao: `Ref. Conta a Receber: ${contaAtualizada.descricao}`,
                    valor: contaAtualizada.valor,
                    data: contaAtualizada.data_pagamento || new Date().toISOString().split('T')[0],
                    categoria_id: catId,
                    tipo: contaAtualizada.tipo,
                    status: 'recebido',
                    observacoes: contaAtualizada.observacoes || 'Gerado automaticamente ao baixar conta a receber.'
                }]);
                if (resR.error) console.error('Erro na integração (Receita):', resR.error);
            }
        }

        res.json({ sucesso: true, dados: contaAtualizada });
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
