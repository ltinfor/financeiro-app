// routes/clientes.js — CRUD de Clientes + Histórico de Serviços
import express from 'express';
import supabase from '../config/supabase.js';

const router = express.Router();

/* ── GET /api/clientes ─────────────────────────────────── */
router.get('/', async (req, res) => {
    try {
        const { status, busca } = req.query;

        let query = supabase
            .from('clientes')
            .select('*')
            .order('nome');

        if (status) query = query.eq('status', status);
        if (busca) query = query.or(`nome.ilike.%${busca}%,cpf_cnpj.ilike.%${busca}%,email.ilike.%${busca}%,telefone.ilike.%${busca}%`);

        const { data, error } = await query;
        if (error) throw error;
        res.json({ sucesso: true, dados: data });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

/* ── GET /api/clientes/:id ─────────────────────────────── */
router.get('/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('clientes')
            .select('*, clientes_historico(*)')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ sucesso: false, erro: 'Cliente não encontrado.' });

        // Ordenar histórico por data desc
        if (data.clientes_historico) {
            data.clientes_historico.sort((a, b) => new Date(b.data) - new Date(a.data));
        }

        res.json({ sucesso: true, dados: data });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

/* ── POST /api/clientes ────────────────────────────────── */
router.post('/', async (req, res) => {
    console.log('POST /api/clientes body:', req.body);
    try {
        const campos = ['nome', 'tipo_pessoa', 'cpf_cnpj', 'email', 'telefone', 'whatsapp',
            'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'estado',
            'status', 'observacoes'];

        const body = {};
        campos.forEach(c => { if (req.body[c] !== undefined) body[c] = req.body[c]; });

        if (!body.nome?.trim()) {
            return res.status(400).json({ sucesso: false, erro: 'Nome é obrigatório.' });
        }

        const { data, error } = await supabase
            .from('clientes')
            .insert([body])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json({ sucesso: true, dados: data });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

/* ── PUT /api/clientes/:id ─────────────────────────────── */
router.put('/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('clientes')
            .update(req.body)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        res.json({ sucesso: true, dados: data });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

/* ── DELETE /api/clientes/:id ──────────────────────────── */
router.delete('/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('clientes')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ sucesso: true });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

/* ────────────────────────────────────────────────────────
   HISTÓRICO DE SERVIÇOS
─────────────────────────────────────────────────────── */

/* ── GET /api/clientes/:id/historico ───────────────────── */
router.get('/:id/historico', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('clientes_historico')
            .select('*')
            .eq('cliente_id', req.params.id)
            .order('data', { ascending: false });

        if (error) throw error;
        res.json({ sucesso: true, dados: data });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

/* ── POST /api/clientes/:id/historico ──────────────────── */
router.post('/:id/historico', async (req, res) => {
    try {
        const { servico, descricao, valor, data, status } = req.body;

        if (!servico?.trim()) {
            return res.status(400).json({ sucesso: false, erro: 'Nome do serviço é obrigatório.' });
        }

        const { data: resultado, error } = await supabase
            .from('clientes_historico')
            .insert([{
                cliente_id: req.params.id,
                servico,
                descricao,
                valor: valor || null,
                data: data || new Date().toISOString().split('T')[0],
                status: status || 'concluido'
            }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json({ sucesso: true, dados: resultado });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

/* ── DELETE /api/clientes/historico/:hid ───────────────── */
router.delete('/historico/:hid', async (req, res) => {
    try {
        const { error } = await supabase
            .from('clientes_historico')
            .delete()
            .eq('id', req.params.hid);

        if (error) throw error;
        res.json({ sucesso: true });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

export default router;
