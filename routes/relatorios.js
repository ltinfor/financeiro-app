// routes/relatorios.js
// Endpoints de Fluxo de Caixa e DRE Simplificado

import express from 'express';
import supabase from '../config/supabase.js';

const router = express.Router();

// GET /api/relatorios/fluxo-caixa
// Retorna saldo por mês e tipo usando a view vw_fluxo_caixa
// Query params: tipo (pessoal|empresarial), ano (YYYY)
router.get('/fluxo-caixa', async (req, res) => {
    try {
        const { tipo, ano } = req.query;

        let query = supabase
            .from('vw_fluxo_caixa')
            .select('*')
            .order('mes', { ascending: false });

        if (tipo) query = query.eq('tipo', tipo);
        if (ano) {
            query = query
                .gte('mes', `${ano}-01-01`)
                .lte('mes', `${ano}-12-31`);
        }

        const { data, error } = await query;
        if (error) throw error;

        // Calcular saldo acumulado
        const saldoAcumulado = data.reduce((acc, row) => acc + parseFloat(row.saldo || 0), 0);

        res.json({
            sucesso: true,
            dados: data,
            saldo_total: saldoAcumulado.toFixed(2)
        });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// GET /api/relatorios/dre
// DRE Simplificado Mensal usando a view vw_dre_mensal
// Query params: tipo (pessoal|empresarial), mes (YYYY-MM), ano (YYYY)
router.get('/dre', async (req, res) => {
    try {
        const { tipo, mes, ano } = req.query;

        let query = supabase
            .from('vw_dre_mensal')
            .select('*')
            .order('mes', { ascending: false });

        if (tipo) query = query.eq('tipo', tipo);
        if (mes) query = query.gte('mes', `${mes}-01`).lt('mes', new Date(mes + '-01').setMonth(new Date(mes + '-01').getMonth() + 1));
        if (ano) {
            query = query
                .gte('mes', `${ano}-01-01`)
                .lte('mes', `${ano}-12-31`);
        }

        const { data, error } = await query;
        if (error) throw error;

        // Agrupar por mês para facilitar renderização no frontend
        const agrupado = {};
        data.forEach(row => {
            const chave = `${row.mes?.substring(0, 7)}_${row.tipo}`;
            if (!agrupado[chave]) {
                agrupado[chave] = {
                    mes: row.mes?.substring(0, 7),
                    tipo: row.tipo,
                    receitas: [],
                    despesas: [],
                    total_receitas: 0,
                    total_despesas: 0,
                    resultado: 0
                };
            }
            if (row.grupo === 'receita') {
                agrupado[chave].receitas.push({ categoria: row.categoria, valor: row.total_receitas });
                agrupado[chave].total_receitas += parseFloat(row.total_receitas || 0);
            } else {
                agrupado[chave].despesas.push({ categoria: row.categoria, valor: row.total_despesas });
                agrupado[chave].total_despesas += parseFloat(row.total_despesas || 0);
            }
            agrupado[chave].resultado = agrupado[chave].total_receitas - agrupado[chave].total_despesas;
        });

        res.json({ sucesso: true, dados: Object.values(agrupado) });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// GET /api/relatorios/dashboard
// Retorna um resumo consolidado para o painel principal
router.get('/dashboard', async (req, res) => {
    try {
        const mesAtual = new Date().toISOString().substring(0, 7); // YYYY-MM
        const inicioMes = `${mesAtual}-01`;
        const fimMes = new Date(mesAtual + '-01');
        fimMes.setMonth(fimMes.getMonth() + 1);
        const fimMesStr = fimMes.toISOString().split('T')[0];

        // Buscar receitas, despesas e contas em paralelo
        const [{ data: receitas }, { data: despesas }, { data: contas }] = await Promise.all([
            supabase.from('receitas').select('valor, tipo, status').gte('data', inicioMes).lt('data', fimMesStr),
            supabase.from('despesas').select('valor, tipo, status').gte('data', inicioMes).lt('data', fimMesStr),
            supabase.from('contas_pagar_receber').select('valor, tipo_conta, status').lte('vencimento', fimMesStr).neq('status', 'pago')
        ]);

        const somarPor = (arr, campo, valorCampo, statusFiltro) =>
            (arr || [])
                .filter(i => (!statusFiltro || i.status === statusFiltro))
                .reduce((s, i) => s + parseFloat(i.valor || 0), 0);

        res.json({
            sucesso: true,
            dados: {
                mes: mesAtual,
                receitas: {
                    total: somarPor(receitas).toFixed(2),
                    recebido: somarPor(receitas, 'status', 'recebido', 'recebido').toFixed(2),
                    pendente: somarPor(receitas, 'status', 'pendente', 'pendente').toFixed(2)
                },
                despesas: {
                    total: somarPor(despesas).toFixed(2),
                    pago: somarPor(despesas, 'status', 'pago', 'pago').toFixed(2),
                    pendente: somarPor(despesas, 'status', 'pendente', 'pendente').toFixed(2)
                },
                contas: {
                    a_pagar: (contas || []).filter(c => c.tipo_conta === 'pagar').reduce((s, c) => s + parseFloat(c.valor || 0), 0).toFixed(2),
                    a_receber: (contas || []).filter(c => c.tipo_conta === 'receber').reduce((s, c) => s + parseFloat(c.valor || 0), 0).toFixed(2),
                    atrasadas: (contas || []).filter(c => c.status === 'atrasado').length
                }
            }
        });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// GET /api/relatorios/exportar
// Exporta os dados de fluxo de caixa para CSV
import { Parser } from 'json2csv';

router.get('/exportar', async (req, res) => {
    try {
        const { tipo, ano } = req.query;
        let query = supabase.from('vw_fluxo_caixa').select('*').order('mes', { ascending: false });

        if (tipo) query = query.eq('tipo', tipo);
        if (ano) query = query.gte('mes', `${ano}-01-01`).lte('mes', `${ano}-12-31`);

        const { data, error } = await query;
        if (error) throw error;

        if (!data || data.length === 0) {
            return res.status(404).send('Nenhum dado encontrado para exportar.');
        }

        const parser = new Parser({ fields: ['mes', 'tipo', 'total_receitas', 'total_despesas', 'saldo'] });
        const csv = parser.parse(data);

        res.header('Content-Type', 'text/csv; charset=utf-8');
        res.attachment(`fluxo_caixa_${ano || 'geral'}.csv`);
        return res.send(csv);

    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// GET /api/relatorios/backup
// Exporta todos os dados (receitas, despesas, contas, clientes, categorias)
router.get('/backup', async (req, res) => {
    try {
        const [
            { data: receitas, error: errR },
            { data: despesas, error: errD },
            { data: contas, error: errC },
            { data: clientes, error: errCl },
            { data: categorias, error: errCat }
        ] = await Promise.all([
            supabase.from('receitas').select('*'),
            supabase.from('despesas').select('*'),
            supabase.from('contas_pagar_receber').select('*'),
            supabase.from('clientes').select('*'),
            supabase.from('categorias').select('*')
        ]);

        if (errR || errD || errC || errCl || errCat) {
            throw new Error('Erro ao buscar dados do Supabase.');
        }

        const backupData = {
            data_geracao: new Date().toISOString(),
            receitas: receitas || [],
            despesas: despesas || [],
            contas_pagar_receber: contas || [],
            clientes: clientes || [],
            categorias: categorias || []
        };

        const jsonStr = JSON.stringify(backupData, null, 2);

        res.header('Content-Type', 'application/json; charset=utf-8');
        res.attachment(`backup_financeiro_completo_${new Date().toISOString().split('T')[0]}.json`);
        return res.send(jsonStr);
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

export default router;
