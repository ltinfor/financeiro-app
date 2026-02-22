// server.js — Servidor principal do Aplicativo Financeiro
// Execute: npm start

// PRIMEIRO import DEVE ser o dotenv — assim as vars ficam disponíveis
// para todos os outros módulos antes de serem inicializados
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';

// ── Verificação antecipada de variáveis críticas ──────────────
const ausentes = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'JWT_SECRET']
    .filter(v => !process.env[v]);

if (ausentes.length > 0) {
    console.error('\n❌ Variáveis não configuradas no .env:');
    ausentes.forEach(v => console.error(`   • ${v}`));
    process.exit(1);
}

// ── Importações de rotas e middleware ─────────────────────────
import rotasAuth from './routes/auth.js';
import rotasReceitas from './routes/receitas.js';
import rotasDespesas from './routes/despesas.js';
import rotasClientes from './routes/clientes.js';
import rotasContas from './routes/contas.js';
import rotasRelatorios from './routes/relatorios.js';
import rotasProjetos from './routes/projetos.js';
import rotasEquipamentos from './routes/equipamentos.js';
import { autenticarAPI, autenticarPagina } from './middleware/autenticar.js';
import { auditarAcao } from './middleware/logger.js';
import supabase from './config/supabase.js';

const app = express();
const PORT = process.env.PORT || 3001; // alterado para evitar conflito

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PUBLIC = join(__dirname, 'public');

// ── Middlewares globais ───────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false })); // CSP desligado pois usamos CDN
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    limit: 150, // limiter ajustado para uso padrão sem estourar o limite jogando a API para fora
    message: { sucesso: false, erro: 'Muitas requisições. Tente mais tarde.' }
});
app.use('/api/', limiter); // Limiter apenas na API para não bloquear arquivos estáticos
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ============================================================
// ARQUIVOS ESTÁTICOS PÚBLICOS — um a um (jamais a pasta inteira)
// Isso impede que index.html seja acessível sem autenticação
// ============================================================
app.get('/style.css', (req, res) => res.sendFile(join(PUBLIC, 'style.css')));
app.get('/logo.png', (req, res) => res.sendFile(join(PUBLIC, 'logo.png')));
app.use('/uploads', express.static(join(__dirname, 'uploads'))); // Servir recibos e anexos

// ============================================================
// ROTAS PÚBLICAS (sem autenticação)
// ============================================================

// Autenticação
app.use('/auth', rotasAuth);

// Página de login — serve login.html EXPLICITAMENTE
app.get('/login', (req, res) => {
    res.sendFile(join(PUBLIC, 'login.html'));
});

// Health check
app.get('/api/health', async (req, res) => {
    try {
        const { error } = await supabase
            .from('categorias')
            .select('count', { count: 'exact', head: true });
        if (error) throw error;
        res.json({ status: 'online', banco: 'conectado', timestamp: new Date().toISOString() });
    } catch (err) {
        res.status(503).json({ status: 'online', banco: 'erro', detalhe: err.message });
    }
});

// ============================================================
// ROTAS PROTEGIDAS DA API — exigem JWT válido
// ============================================================
app.use('/api/', auditarAcao); // Injeta a trilha lógica
app.use('/api/receitas', autenticarAPI, rotasReceitas);
app.use('/api/despesas', autenticarAPI, rotasDespesas);
app.use('/api/contas', autenticarAPI, rotasContas);
app.use('/api/clientes', autenticarAPI, rotasClientes); // Proteção Aplicada
app.use('/api/relatorios', autenticarAPI, rotasRelatorios);
app.use('/api/projetos', autenticarAPI, rotasProjetos);
app.use('/api/equipamentos', autenticarAPI, rotasEquipamentos);

app.get('/api/categorias', autenticarAPI, async (req, res) => {
    try {
        const { tipo, grupo } = req.query;
        let query = supabase.from('categorias').select('*').eq('ativo', true).order('nome');
        if (tipo) query = query.eq('tipo', tipo);
        if (grupo) query = query.eq('grupo', grupo);
        const { data, error } = await query;
        if (error) throw error;
        res.json({ sucesso: true, dados: data });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// ============================================================
// PÁGINAS PROTEGIDAS — exigem autenticação
// Qualquer acesso sem JWT válido redireciona para /login
// ============================================================

// Arquivo JS do dashboard — protegido (não deve ser acessível sem login)
app.get('/dashboard.js', autenticarPagina, (req, res) => {
    res.sendFile(join(PUBLIC, 'dashboard.js'));
});

// Dashboard principal
app.get('/', autenticarPagina, (req, res) => {
    res.sendFile(join(PUBLIC, 'index.html'));
});

// Qualquer outra rota: redireciona para login se não autenticado
app.get('*', autenticarPagina, (req, res) => {
    res.sendFile(join(PUBLIC, 'index.html'));
});

// ── Inicialização de Rotinas (CRON) ───────────────────────────
cron.schedule('0 8 * * *', () => {
    // Isso vai rodar todos os dias às 8:00 AM do servidor
    console.log('[CRON] Verificando contas a vencer no dia...');
    // Adicionar lógica de disparo de e-mails para diretoria aqui futuramente usando node-mailer
});

// ── Inicialização ─────────────────────────────────────────────
app.listen(PORT, () => {
    console.log('');
    console.log('  💰 Aplicativo Financeiro — Servidor Iniciado');
    console.log('  ─────────────────────────────────────────────');
    console.log(`  🌐 Dashboard:  http://localhost:${PORT}`);
    console.log(`  🔑 Login:      http://localhost:${PORT}/login`);
    console.log(`  ✅ Health:     http://localhost:${PORT}/api/health`);
    console.log('  ─────────────────────────────────────────────');
    console.log(`  Supabase:      ${process.env.SUPABASE_URL}`);
    console.log(`  JWT_SECRET:    ✅ Configurado`);
    console.log('');
});
