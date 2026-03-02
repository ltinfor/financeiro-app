// routes/relatorios.js
// Endpoints de Fluxo de Caixa e DRE Simplificado

import express from 'express';
import multer from 'multer';
import supabase from '../config/supabase.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

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
        if (mes) {
            const [anoStr, mesStr] = mes.split('-');
            const prevAno = parseInt(anoStr, 10);
            const prevMes = parseInt(mesStr, 10);
            const nextMes = prevMes === 12 ? 1 : prevMes + 1;
            const nextAno = prevMes === 12 ? prevAno + 1 : prevAno;
            const fimMesStr = `${nextAno}-${String(nextMes).padStart(2, '0')}-01`;
            query = query.gte('mes', `${mes}-01`).lt('mes', fimMesStr);
        }
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
        const [anoStr, mesStr] = mesAtual.split('-');
        const prevAno = parseInt(anoStr, 10);
        const prevMes = parseInt(mesStr, 10);
        const nextMes = prevMes === 12 ? 1 : prevMes + 1;
        const nextAno = prevMes === 12 ? prevAno + 1 : prevAno;
        const fimMesStr = `${nextAno}-${String(nextMes).padStart(2, '0')}-01`;

        const { tipo } = req.query;

        let qReceitas = supabase.from('receitas').select('valor, tipo, status').gte('data', inicioMes).lt('data', fimMesStr);
        let qDespesas = supabase.from('despesas').select('valor, tipo, status').gte('data', inicioMes).lt('data', fimMesStr);
        let qContas = supabase.from('contas_pagar_receber').select('valor, tipo_conta, status').gte('vencimento', inicioMes).lt('vencimento', fimMesStr).eq('status', 'pendente');

        let qReceitaAnt = supabase.from('receitas').select('valor').lt('data', inicioMes).eq('status', 'recebido');
        let qDespesaAnt = supabase.from('despesas').select('valor').lt('data', inicioMes).eq('status', 'pago');

        if (tipo) {
            qReceitas = qReceitas.eq('tipo', tipo);
            qDespesas = qDespesas.eq('tipo', tipo);
            // qContas não tem strictamente sempre o mesmo schema para 'tipo', mas vamos assumir se tiver
            qReceitaAnt = qReceitaAnt.eq('tipo', tipo);
            qDespesaAnt = qDespesaAnt.eq('tipo', tipo);
        }

        // Buscar receitas, despesas e contas em paralelo
        const [{ data: receitas }, { data: despesas }, { data: contas }, { data: rAnt }, { data: dAnt }] = await Promise.all([
            qReceitas, qDespesas, qContas, qReceitaAnt, qDespesaAnt
        ]);

        const sumAnt = (arr) => (arr || []).reduce((s, i) => s + parseFloat(i.valor || 0), 0);
        const saldoAnterior = sumAnt(rAnt) - sumAnt(dAnt);

        const somarPor = (arr, campo, valorCampo, statusFiltro) =>
            (arr || [])
                .filter(i => (!statusFiltro || i.status === statusFiltro))
                .reduce((s, i) => s + parseFloat(i.valor || 0), 0);

        res.json({
            sucesso: true,
            dados: {
                mes: mesAtual,
                saldo_anterior: saldoAnterior.toFixed(2),
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

// POST /api/relatorios/restaurar
// Restaura o backup enviado (substitui dados, ou faz upsert simples, por ser perigoso, faremos insert ignore/upsert)
router.post('/restaurar', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ sucesso: false, erro: 'Arquivo de backup não enviado.' });
        }

        const jsonStr = req.file.buffer.toString('utf-8');
        const dados = JSON.parse(jsonStr);

        // Ordem segura de importação: Categorias e Clientes primeiro, depois Movimentações.
        const order = ['categorias', 'clientes', 'receitas', 'despesas', 'contas_pagar_receber'];

        for (const tabela of order) {
            if (dados[tabela] && Array.isArray(dados[tabela]) && dados[tabela].length > 0) {
                // Upsert para ignorar conflitos de ID ou atualizar os existentes
                const { error } = await supabase.from(tabela).upsert(dados[tabela], { onConflict: 'id' });
                if (error) {
                    console.error(`Erro ao restaurar tabela ${tabela}:`, error);
                    throw new Error(`Erro ao restaurar a tabela ${tabela}. Verifique a integridade do backup.`);
                }
            }
        }

        res.json({ sucesso: true, mensagem: 'Backup restaurado com sucesso!' });
    } catch (err) {
        console.error('Erro no restore de backup:', err);
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

export default router;
