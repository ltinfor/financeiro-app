// routes/despesas.js
// CRUD completo para o módulo de Despesas (com suporte a recibo_url)

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import supabase from '../config/supabase.js';

const router = express.Router();

// Configuração do Multer para salvar os arquivos
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'recibo-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage });

// GET /api/despesas — Lista todas as despesas com filtros opcionais
// Query params: tipo (pessoal|empresarial), status, mes (YYYY-MM), categoria_id
router.get('/', async (req, res) => {
    try {
        const { tipo, status, mes, inicio, fim, categoria_id } = req.query;

        let query = supabase
            .from('despesas')
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

// GET /api/despesas/:id — Busca uma despesa por ID
router.get('/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('despesas')
            .select('*, categorias (id, nome)')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ sucesso: false, erro: 'Despesa não encontrada.' });

        res.json({ sucesso: true, dados: data });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// POST /api/despesas — Cria uma nova despesa
// Body/FormData: { descricao, valor, data, categoria_id, tipo, status, recibo_url|d-recibo-file, fornecedor, observacoes }
router.post('/', upload.single('recibo'), async (req, res) => {
    try {
        const { descricao, valor, data, categoria_id, tipo, status, recibo_url, fornecedor, observacoes } = req.body;

        let pathRecibo = recibo_url || null;
        if (req.file) {
            // Se usuário mandou um documento local
            pathRecibo = `/uploads/${req.file.filename}`;
        }

        // Validações básicas
        if (!descricao || !valor || !categoria_id || !tipo) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Campos obrigatórios ausentes: descricao, valor, categoria_id, tipo.'
            });
        }

        const { data: novaDespesa, error } = await supabase
            .from('despesas')
            .insert([{
                descricao,
                valor: parseFloat(valor),
                data: data || new Date().toISOString().split('T')[0],
                categoria_id: parseInt(categoria_id),
                tipo,
                status: status || 'pendente',
                recibo_url: pathRecibo,
                fornecedor: fornecedor || null,
                observacoes: observacoes || null
            }])
            .select('*, categorias (id, nome)')
            .single();

        if (error) throw error;

        res.status(201).json({ sucesso: true, dados: novaDespesa });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// PUT /api/despesas/:id — Atualiza uma despesa
router.put('/:id', async (req, res) => {
    try {
        const atualizacoes = req.body;
        if (atualizacoes.valor) atualizacoes.valor = parseFloat(atualizacoes.valor);

        const { data, error } = await supabase
            .from('despesas')
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

// DELETE /api/despesas/:id — Remove uma despesa
router.delete('/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('despesas')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;

        res.json({ sucesso: true, mensagem: 'Despesa removida com sucesso.' });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

export default router;
