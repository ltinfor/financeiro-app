// dashboard.js — Lógica do Frontend do Aplicativo Financeiro
// Integração com a API REST e renderização dos gráficos Chart.js

/* ═══════════════════════════════════════════════════════════
   ESTADO GLOBAL
═══════════════════════════════════════════════════════════ */
const state = {
    tipo: 'todos',            // Filtro atual: 'todos' | 'pessoal' | 'empresarial'
    graficoBarra: null,
    graficoRosca: null,
    graficoFluxo: null
};

const API = '';             // Base URL — vazio porque rodamos no mesmo servidor

/* ═══════════════════════════════════════════════════════════
   INICIALIZAÇÃO
═══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
    // Service Worker PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(console.error);
    }

    // Carregar Tema Salvo
    if (localStorage.getItem('tema') === 'claro') {
        document.body.classList.add('light-theme');
        document.getElementById('btn-theme-toggle').textContent = '☀️';
        document.getElementById('meta-theme-color').content = '#ffffff';
    }
    // Exibir mês atual no header
    const agora = new Date();
    document.getElementById('mes-atual').textContent =
        agora.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

    // Preencher datas padrão nos formulários
    const hoje = agora.toISOString().split('T')[0];
    const primeiroDia = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString().split('T')[0];
    const ultimoDia = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).toISOString().split('T')[0];

    document.querySelectorAll('input[type="date"]').forEach(el => {
        if (el.id.endsWith('-inicio')) {
            el.value = primeiroDia;
        } else if (el.id.endsWith('-fim')) {
            el.value = ultimoDia;
        } else {
            el.value = hoje;
        }
    });

    // Carregar nome do usuário logado no header
    fetch('/auth/me', { credentials: 'include' })
        .then(r => r.json())
        .then(d => {
            if (d.sucesso && d.usuario) {
                const el = document.getElementById('usuario-nome');
                if (el) el.textContent = '👤 ' + d.usuario.nome;
            } else {
                window.location.href = '/login';
            }
        })
        .catch(() => window.location.href = '/login');

    // Verificar alertas de contas vencendo (hoje e amanhã)
    verificarAlertasContas();

    // Carregar dashboard inicial
    iniciarDashboard();

    // Carregar categorias para os modais (padrão: pessoal)
    carregarCategorias('despesa', 'd-categoria', 'pessoal');
    carregarCategorias('receita', 'r-categoria', 'pessoal');

    // Verificar saúde da API
    verificarConexao();
});

/* ═══════════════════════════════════════════════════════════
   LOGOUT
═══════════════════════════════════════════════════════════ */
async function efetuarLogout() {
    try {
        await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    } finally {
        window.location.href = '/login';
    }
}


/* ═══════════════════════════════════════════════════════════
   NAVEGAÇÃO ENTRE PÁGINAS
═══════════════════════════════════════════════════════════ */
const titulos = {
    dashboard: ['Dashboard', 'Visão geral das suas finanças'],
    receitas: ['Receitas', 'Todas as entradas financeiras'],
    despesas: ['Despesas', 'Todas as saídas financeiras'],
    clientes: ['Clientes', 'Cadastro e histórico de clientes'],
    contas: ['Contas a Pagar/Receber', 'Controle de vencimentos'],
    fluxo: ['Fluxo de Caixa', 'Saldo acumulado por período'],
    dre: ['DRE Simplificado', 'Lucro/Prejuízo por categoria'],
};

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('open');
}

function navegarPara(pagina, el) {
    // Fechar menu mobile caso esteja aberto
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
    }

    // Atualizar nav
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    el.classList.add('active');

    // Trocar página
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${pagina}`).classList.add('active');

    // Atualizar header
    const [titulo, sub] = titulos[pagina] || ['', ''];
    document.getElementById('header-titulo').textContent = titulo;
    document.getElementById('header-sub').textContent = sub;

    // Carregar dados da página
    const carregadores = {
        dashboard: iniciarDashboard,
        receitas: carregarReceitas,
        despesas: carregarDespesas,
        clientes: carregarClientes,
        contas: carregarContas,
        fluxo: carregarFluxo,
        dre: carregarDRE
    };
    carregadores[pagina]?.();
}

function toggleTheme() {
    const isLight = document.body.classList.toggle('light-theme');
    const btn = document.getElementById('btn-theme-toggle');
    const meta = document.getElementById('meta-theme-color');
    if (isLight) {
        localStorage.setItem('tema', 'claro');
        btn.textContent = '☀️';
        if (meta) meta.content = '#ffffff';
    } else {
        localStorage.setItem('tema', 'escuro');
        btn.textContent = '🌙';
        if (meta) meta.content = '#0a0f1e';
    }
}

/* ═══════════════════════════════════════════════════════════
   FILTRO PESSOAL / EMPRESARIAL
═══════════════════════════════════════════════════════════ */
function filtrarTipo(tipo, el) {
    state.tipo = tipo;
    document.querySelectorAll('.tipo-toggle button').forEach(b => b.classList.remove('active'));
    el.classList.add('active');

    // Recarregar a página ativa
    const paginaAtiva = document.querySelector('.page.active')?.id?.replace('page-', '');
    if (paginaAtiva) {
        const el2 = document.querySelector(`.nav-item[data-page="${paginaAtiva}"]`);
        navegarPara(paginaAtiva, el2 || document.querySelector('.nav-item'));
    }
}

/* ═══════════════════════════════════════════════════════════
   UTILITÁRIOS
═══════════════════════════════════════════════════════════ */
const fmt = (valor) =>
    'R$ ' + parseFloat(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

const fmtData = (iso) =>
    iso ? new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

const corSaldo = (v, el) => {
    el.style.color = parseFloat(v) >= 0 ? 'var(--green)' : 'var(--red)';
};

function badge(text, cls) {
    return `<span class="badge ${cls}">${text}</span>`;
}

function tipoBadge(tipo) {
    return badge(tipo === 'pessoal' ? 'Pessoal' : 'Empresarial', tipo);
}

function statusBadge(status) {
    const map = {
        pendente: 'pendente',
        recebido: 'recebido',
        pago: 'pago',
        atrasado: 'atrasado',
        cancelado: 'cancelado'
    };
    const labels = {
        pendente: 'Pendente', recebido: 'Recebido', pago: 'Pago',
        atrasado: 'Atrasado', cancelado: 'Cancelado'
    };
    return badge(labels[status] || status, map[status] || '');
}

async function apiFetch(path, opts = {}) {
    const headers = {};
    // Não incluir header de 'application/json' se estiver enviando um arquivo
    if (!(opts.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(API + path, {
        headers,
        credentials: 'include',
        ...opts
    });
    // Redirecionar para login se sessão expirar
    if (res.status === 401) {
        window.location.href = '/login';
        return {};
    }
    return res.json();
}

function addTipoParam(url) {
    if (state.tipo !== 'todos') {
        const sep = url.includes('?') ? '&' : '?';
        return url + sep + `tipo=${state.tipo}`;
    }
    return url;
}

/* ═══════════════════════════════════════════════════════════
   TOAST NOTIFICATIONS
═══════════════════════════════════════════════════════════ */
function toast(msg, tipo = 'success') {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${tipo}`;
    el.innerHTML = `<span>${tipo === 'success' ? '✅' : '❌'}</span> ${msg}`;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3500);
}

/* ═══════════════════════════════════════════════════════════
   HEALTH CHECK
═══════════════════════════════════════════════════════════ */
async function verificarConexao() {
    try {
        const r = await apiFetch('/api/health');
        const badge = document.getElementById('status-badge');
        if (r.banco === 'conectado') {
            badge.className = 'badge-status online';
            badge.innerHTML = '<span class="dot"></span> Online';
        } else {
            badge.className = 'badge-status error';
            badge.innerHTML = '<span class="dot"></span> Sem Banco';
        }
    } catch {
        document.getElementById('status-badge').className = 'badge-status error';
        document.getElementById('status-badge').innerHTML = '<span class="dot"></span> Offline';
    }
}

/* ═══════════════════════════════════════════════════════════
   DASHBOARD — KPIs e Gráficos
═══════════════════════════════════════════════════════════ */
async function iniciarDashboard() {
    try {
        const url = addTipoParam('/api/relatorios/dashboard');
        const { dados } = await apiFetch(url);

        if (!dados) return;

        // KPIs
        const kpiReceitas = document.getElementById('kpi-receitas');
        const kpiDespesas = document.getElementById('kpi-despesas');
        const kpiSaldo = document.getElementById('kpi-saldo');
        const kpiContas = document.getElementById('kpi-contas');

        kpiReceitas.textContent = fmt(dados.receitas.total);
        document.getElementById('kpi-receitas-sub').textContent =
            `${fmt(dados.receitas.recebido)} recebido · ${fmt(dados.receitas.pendente)} pendente`;

        kpiDespesas.textContent = fmt(dados.despesas.total);
        document.getElementById('kpi-despesas-sub').textContent =
            `${fmt(dados.despesas.pago)} pago · ${fmt(dados.despesas.pendente)} pendente`;

        const saldo = parseFloat(dados.receitas.recebido) - parseFloat(dados.despesas.pago);
        kpiSaldo.textContent = fmt(saldo);
        corSaldo(saldo, kpiSaldo);

        kpiContas.textContent = fmt(parseFloat(dados.contas.a_pagar) + parseFloat(dados.contas.a_receber));
        document.getElementById('kpi-contas-sub').textContent =
            `${fmt(dados.contas.a_pagar)} a pagar · ${dados.contas.atrasadas} em atraso`;

        // Gráficos
        await renderizarGraficoBarras();
        await renderizarGraficoRosca();
        await carregarUltimasTransacoes();
    } catch (err) {
        console.error('Erro ao carregar dashboard:', err);
    }
}

async function renderizarGraficoBarras() {
    const ano = new Date().getFullYear();
    const url = addTipoParam(`/api/relatorios/fluxo-caixa?ano=${ano}`);
    const { dados } = await apiFetch(url);
    if (!dados) return;

    // Pegar últimos 6 meses
    const ultimos6 = dados.slice(0, 6).reverse();
    const labels = ultimos6.map(d => {
        const dt = new Date(d.mes);
        return dt.toLocaleDateString('pt-BR', { month: 'short' });
    });
    const receitas = ultimos6.map(d => parseFloat(d.total_receitas || 0));
    const despesas = ultimos6.map(d => parseFloat(d.total_despesas || 0));

    const ctx = document.getElementById('grafico-barras').getContext('2d');
    if (state.graficoBarra) state.graficoBarra.destroy();

    state.graficoBarra = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Receitas',
                    data: receitas,
                    backgroundColor: 'rgba(16,185,129,0.75)',
                    borderColor: '#10b981',
                    borderWidth: 1.5,
                    borderRadius: 6
                },
                {
                    label: 'Despesas',
                    data: despesas,
                    backgroundColor: 'rgba(244,63,94,0.75)',
                    borderColor: '#f43f5e',
                    borderWidth: 1.5,
                    borderRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#94a3b8', font: { size: 12 } } },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)}`
                    }
                }
            },
            scales: {
                x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.04)' } },
                y: {
                    ticks: { color: '#64748b', callback: v => 'R$' + (v / 1000).toFixed(0) + 'k' },
                    grid: { color: 'rgba(255,255,255,0.04)' }
                }
            }
        }
    });
}

async function renderizarGraficoRosca() {
    const mes = new Date().toISOString().substring(0, 7);
    const tipoParam = state.tipo !== 'todos' ? `&tipo=${state.tipo}` : '';
    const { dados } = await apiFetch(`/api/despesas?mes=${mes}${tipoParam}`);
    if (!dados || dados.length === 0) return;

    // Agrupar por categoria
    const grupos = {};
    dados.forEach(d => {
        const cat = d.categorias?.nome || 'Sem categoria';
        grupos[cat] = (grupos[cat] || 0) + parseFloat(d.valor || 0);
    });

    const labels = Object.keys(grupos);
    const valores = Object.values(grupos);
    const cores = [
        '#3b82f6', '#10b981', '#f43f5e', '#f59e0b', '#8b5cf6',
        '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6'
    ];

    const ctx = document.getElementById('grafico-rosca').getContext('2d');
    if (state.graficoRosca) state.graficoRosca.destroy();

    state.graficoRosca = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: valores,
                backgroundColor: cores.slice(0, labels.length),
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#94a3b8', font: { size: 11 }, padding: 16, boxWidth: 12 }
                },
                tooltip: {
                    callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)}` }
                }
            }
        }
    });
}

async function carregarUltimasTransacoes() {
    const tbody = document.getElementById('tabela-transacoes');
    const tipoParam = state.tipo !== 'todos' ? `?tipo=${state.tipo}` : '';
    const [{ dados: receitas }, { dados: despesas }] = await Promise.all([
        apiFetch(`/api/receitas${tipoParam}`),
        apiFetch(`/api/despesas${tipoParam}`)
    ]);

    const todas = [
        ...(receitas || []).map(r => ({ ...r, _grupo: 'receita' })),
        ...(despesas || []).map(d => ({ ...d, _grupo: 'despesa' }))
    ].sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 10);

    if (todas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">📭</div><p>Nenhuma transação encontrada</p></div></td></tr>`;
        return;
    }

    tbody.innerHTML = todas.map(t => `
    <tr>
      <td>${fmtData(t.data)}</td>
      <td>${t.descricao}</td>
      <td>${t.categorias?.nome || '—'}</td>
      <td>${tipoBadge(t.tipo)}</td>
      <td style="color:${t._grupo === 'receita' ? 'var(--green)' : 'var(--red)'}; font-weight:600">
        ${t._grupo === 'receita' ? '+' : '-'}${fmt(t.valor)}
      </td>
      <td>${statusBadge(t.status)}</td>
      <td>
        <button class="btn btn-ghost" style="padding:4px 10px;font-size:12px" onclick="${t._grupo === 'receita' ? `editarReceita(${t.id})` : `editarDespesa(${t.id})`}">✏️ Editar</button>
      </td>
    </tr>
  `).join('');
}

/* ═══════════════════════════════════════════════════════════
   PÁGINA: RECEITAS
═══════════════════════════════════════════════════════════ */
async function carregarReceitas() {
    const tbody = document.getElementById('tabela-receitas');
    tbody.innerHTML = `<tr><td colspan="6"><div class="skeleton"></div></td></tr>`;

    let tipoParam = state.tipo !== 'todos' ? `?tipo=${state.tipo}` : '?';
    const dtInicio = document.getElementById('filtro-r-inicio').value;
    const dtFim = document.getElementById('filtro-r-fim').value;

    // Novo método de filtro por data exata substituindo o 'mes' inteiro
    if (dtInicio && dtFim) tipoParam += `&inicio=${dtInicio}&fim=${dtFim}`;

    const { dados } = await apiFetch(`/api/receitas${tipoParam.replace('?&', '?')}`);

    if (!dados || dados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="icon">📈</div><p>Nenhuma receita cadastrada</p></div></td></tr>`;
        return;
    }

    tbody.innerHTML = dados.map(r => `
    <tr>
      <td>${fmtData(r.data)}</td>
      <td>${r.descricao}</td>
      <td>${r.categorias?.nome || '—'}</td>
      <td>${tipoBadge(r.tipo)}</td>
      <td style="color:var(--green);font-weight:600">${fmt(r.valor)}</td>
      <td>${statusBadge(r.status)}</td>
      <td style="display: flex; gap: 5px;">
        <button class="btn btn-ghost" style="padding:4px 10px;font-size:12px" onclick="editarReceita(${r.id})">✏️ Editar</button>
        <button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;color:var(--red)" onclick="excluirReceita(${r.id})">🗑️ Excluir</button>
      </td>
    </tr>
  `).join('');
}

/* ═══════════════════════════════════════════════════════════
   PÁGINA: DESPESAS
═══════════════════════════════════════════════════════════ */
async function carregarDespesas() {
    const tbody = document.getElementById('tabela-despesas');
    tbody.innerHTML = `<tr><td colspan="7"><div class="skeleton"></div></td></tr>`;

    let tipoParam = state.tipo !== 'todos' ? `?tipo=${state.tipo}` : '?';
    const dtInicio = document.getElementById('filtro-d-inicio').value;
    const dtFim = document.getElementById('filtro-d-fim').value;

    if (dtInicio && dtFim) tipoParam += `&inicio=${dtInicio}&fim=${dtFim}`;

    const { dados } = await apiFetch(`/api/despesas${tipoParam.replace('?&', '?')}`);

    if (!dados || dados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">📉</div><p>Nenhuma despesa cadastrada</p></div></td></tr>`;
        return;
    }

    tbody.innerHTML = dados.map(d => `
    <tr>
      <td>${fmtData(d.data)}</td>
      <td>${d.descricao}</td>
      <td>${d.categorias?.nome || '—'}</td>
      <td>${tipoBadge(d.tipo)}</td>
      <td style="color:var(--red);font-weight:600">${fmt(d.valor)}</td>
      <td>${statusBadge(d.status)}</td>
      <td>${d.recibo_url ? `<a href="${d.recibo_url}" target="_blank" style="color:var(--blue)">📎 Ver</a>` : ''}</td>
      <td style="display: flex; gap: 5px;">
        <button class="btn btn-ghost" style="padding:4px 10px;font-size:12px" onclick="editarDespesa(${d.id})">✏️ Editar</button>
        <button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;color:var(--red)" onclick="excluirDespesa(${d.id})">🗑️ Excluir</button>
      </td>
    </tr>
  `).join('');
}

/* ═══════════════════════════════════════════════════════════
   ALERTAS DE VENCIMENTO
═══════════════════════════════════════════════════════════ */
async function verificarAlertasContas() {
    try {
        const { dados } = await apiFetch('/api/contas?status=pendente');
        if (!dados || dados.length === 0) return;

        const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
        const amanha = new Date(hoje); amanha.setDate(amanha.getDate() + 1);

        const vencemHoje = dados.filter(c => { const d = new Date(c.vencimento + 'T00:00:00'); return d.getTime() === hoje.getTime(); });
        const vencemAmanha = dados.filter(c => { const d = new Date(c.vencimento + 'T00:00:00'); return d.getTime() === amanha.getTime(); });
        const atrasadas = dados.filter(c => { const d = new Date(c.vencimento + 'T00:00:00'); return d < hoje; });

        // Badge no sininho
        const totalAlertas = vencemHoje.length + vencemAmanha.length + atrasadas.length;
        const badgeNotif = document.getElementById('notif-badge');
        if (badgeNotif) {
            badgeNotif.style.display = totalAlertas > 0 ? 'inline-block' : 'none';
            badgeNotif.textContent = totalAlertas;
        }

        // Toasts de alerta
        atrasadas.forEach(c => toast(`🚨 ATRASADO: ${c.descricao} (${fmt(c.valor)})`, 'error'));
        vencemHoje.forEach(c => {
            const tipo = c.tipo_conta === 'pagar' ? '💸 PAGAR' : '💰 RECEBER';
            toast(`⚠️ HOJE: ${tipo} — ${c.descricao} (${fmt(c.valor)})`, 'error');
        });
        vencemAmanha.forEach(c => {
            const tipo = c.tipo_conta === 'pagar' ? '💸 Pagar' : '💰 Receber';
            toast(`🔔 AMANHÃ: ${tipo} — ${c.descricao} (${fmt(c.valor)})`, 'warning');
        });
    } catch { /* silencioso */ }
}

/* ═══════════════════════════════════════════════════════════
   PÁGINA: CONTAS
═══════════════════════════════════════════════════════════ */
async function carregarContas() {
    let tipoParam = state.tipo !== 'todos' ? `?tipo=${state.tipo}` : '?';
    const dtInicio = document.getElementById('filtro-c-inicio')?.value;
    const dtFim = document.getElementById('filtro-c-fim')?.value;

    if (dtInicio && dtFim) tipoParam += `&inicio=${dtInicio}&fim=${dtFim}`;
    tipoParam = tipoParam.replace('?&', '?');

    const [{ dados }, { dados: resumo }] = await Promise.all([
        apiFetch(`/api/contas${tipoParam}`),
        apiFetch(`/api/contas/resumo${tipoParam}`)
    ]);

    // KPIs
    if (resumo) {
        const pagar = parseFloat(resumo.a_pagar.pendente || 0) + parseFloat(resumo.a_pagar.atrasado || 0);
        const receber = parseFloat(resumo.a_receber.pendente || 0);
        document.getElementById('kpi-a-pagar').textContent = fmt(pagar);
        document.getElementById('kpi-a-receber').textContent = fmt(receber);
        document.getElementById('kpi-atrasadas').textContent =
            `${fmt(resumo.a_pagar.atrasado || 0)} em atraso`;
    }

    // Banner de alertas de vencimento
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const amanha = new Date(hoje); amanha.setDate(amanha.getDate() + 1);

    const alertasHoje = (dados || []).filter(c => c.status === 'pendente' && new Date(c.vencimento + 'T00:00:00').getTime() === hoje.getTime());
    const alertasAmanha = (dados || []).filter(c => c.status === 'pendente' && new Date(c.vencimento + 'T00:00:00').getTime() === amanha.getTime());

    // Renderizar banner de alertas acima da tabela
    const bannerEl = document.getElementById('banner-alertas-contas');
    if (bannerEl) {
        let html = '';
        if (alertasHoje.length > 0) {
            html += `<div style="background:rgba(244,63,94,0.12);border:1px solid rgba(244,63,94,0.3);border-radius:10px;padding:12px 16px;margin-bottom:10px">
              <div style="font-weight:700;color:var(--red);margin-bottom:8px;font-size:13px">⚠️ VENCE HOJE</div>
              ${alertasHoje.map(c => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(244,63,94,0.1);font-size:13px">
                  <span>${c.tipo_conta === 'pagar' ? '💸' : '💰'} <strong>${c.descricao}</strong></span>
                  <span style="color:var(--red);font-weight:700">${fmt(c.valor)}</span>
                </div>`).join('')}
            </div>`;
        }
        if (alertasAmanha.length > 0) {
            html += `<div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:10px;padding:12px 16px;margin-bottom:10px">
              <div style="font-weight:700;color:#f59e0b;margin-bottom:8px;font-size:13px">🔔 VENCE AMANHÃ</div>
              ${alertasAmanha.map(c => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(245,158,11,0.1);font-size:13px">
                  <span>${c.tipo_conta === 'pagar' ? '💸' : '💰'} <strong>${c.descricao}</strong></span>
                  <span style="color:#f59e0b;font-weight:700">${fmt(c.valor)}</span>
                </div>`).join('')}
            </div>`;
        }
        bannerEl.innerHTML = html;
    }

    const tbody = document.getElementById('tabela-contas');
    if (!dados || dados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">🗂️</div><p>Nenhuma conta cadastrada</p></div></td></tr>`;
        return;
    }

    tbody.innerHTML = dados.map(c => {
        const dtVenc = new Date(c.vencimento + 'T00:00:00');
        const atrasado = c.status === 'pendente' && dtVenc < hoje;
        const venceHoje = c.status === 'pendente' && dtVenc.getTime() === hoje.getTime();
        const venceAmanha = c.status === 'pendente' && dtVenc.getTime() === amanha.getTime();
        const statusReal = atrasado ? 'atrasado' : c.status;

        let alertaIcon = '';
        if (venceHoje) alertaIcon = ' <span title="Vence hoje!" style="color:var(--red)">⚠️</span>';
        if (venceAmanha) alertaIcon = ' <span title="Vence amanhã" style="color:#f59e0b">🔔</span>';
        if (atrasado) alertaIcon = ' <span title="Atrasado" style="color:var(--red)">🚨</span>';

        return `
    <tr style="${venceHoje ? 'background:rgba(244,63,94,0.05)' : venceAmanha ? 'background:rgba(245,158,11,0.05)' : ''}">
      <td>
        ${c.status === 'pendente' ? `<input type="checkbox" class="chk-conta" value="${c.id}" onchange="verificarCheckboxContas()" />` : ''}
      </td>
      <td style="${atrasado || venceHoje ? 'color:var(--red)' : venceAmanha ? 'color:#f59e0b' : ''}">
        ${fmtData(c.vencimento)}${alertaIcon}
      </td>
      <td>${c.descricao}</td>
      <td>${badge(c.tipo_conta === 'pagar' ? '💸 Pagar' : '💰 Receber', c.tipo_conta === 'pagar' ? 'atrasado' : 'recebido')}</td>
      <td style="font-weight:600">${fmt(c.valor)}</td>
      <td>${statusBadge(statusReal)}</td>
      <td style="display: flex; gap: 5px; align-items: center;">
        ${c.status === 'pendente' ? `<button class="btn btn-success" style="padding:5px 12px;font-size:12px" onclick="marcarPago(${c.id})">✔ Pago</button>` : ''}
        <button class="btn btn-ghost" style="padding:4px 10px;font-size:12px" onclick="editarConta(${c.id})">✏️ Editar</button>
        <button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;color:var(--red)" onclick="excluirConta(${c.id})">🗑️ Excluir</button>
      </td>
    </tr>`;
    }).join('');
}

async function marcarPago(id) {
    try {
        const { sucesso } = await apiFetch(`/api/contas/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ status: 'pago' })
        });
        if (sucesso) { toast('Conta marcada como paga!'); carregarContas(); iniciarDashboard(); }
    } catch { toast('Erro ao atualizar conta.', 'error'); }
}

function toggleTodasContas(el) {
    document.querySelectorAll('.chk-conta').forEach(chk => {
        chk.checked = el.checked;
    });
    verificarCheckboxContas();
}

function verificarCheckboxContas() {
    const marcados = document.querySelectorAll('.chk-conta:checked').length;
    document.getElementById('btn-pagar-lote').style.display = marcados > 0 ? 'inline-block' : 'none';
}

async function marcarSelecionadas() {
    const checkboxes = document.querySelectorAll('.chk-conta:checked');
    if (checkboxes.length === 0) return;

    document.getElementById('btn-pagar-lote').textContent = 'Processando...';
    try {
        const promessas = Array.from(checkboxes).map(chk => apiFetch(`/api/contas/${chk.value}`, {
            method: 'PUT',
            body: JSON.stringify({ status: 'pago' })
        }));

        await Promise.all(promessas);
        toast(`${checkboxes.length} conta(s) baixada(s) com sucesso!`);
        document.getElementById('checkbox-todas').checked = false;
        carregarContas();
        iniciarDashboard();
    } catch {
        toast('Erro ao baixar lote.', 'error');
    } finally {
        document.getElementById('btn-pagar-lote').textContent = '✔ Pagar Marcadas';
        document.getElementById('btn-pagar-lote').style.display = 'none';
    }
}

/* ═══════════════════════════════════════════════════════════
   PÁGINA: FLUXO DE CAIXA
═══════════════════════════════════════════════════════════ */
async function carregarFluxo() {
    const ano = new Date().getFullYear();
    const tipoParam = state.tipo !== 'todos' ? `&tipo=${state.tipo}` : '';
    const { dados, saldo_total } = await apiFetch(`/api/relatorios/fluxo-caixa?ano=${ano}${tipoParam}`);

    const kpiSaldoTotal = document.getElementById('saldo-total');
    kpiSaldoTotal.textContent = fmt(saldo_total);
    corSaldo(saldo_total, kpiSaldoTotal);

    if (!dados || dados.length === 0) return;

    // Gráfico de linha
    const ctx = document.getElementById('grafico-fluxo').getContext('2d');
    if (state.graficoFluxo) state.graficoFluxo.destroy();

    const reversido = [...dados].reverse();

    state.graficoFluxo = new Chart(ctx, {
        type: 'line',
        data: {
            labels: reversido.map(d => new Date(d.mes).toLocaleDateString('pt-BR', { month: 'short' })),
            datasets: [
                {
                    label: 'Receitas',
                    data: reversido.map(d => parseFloat(d.total_receitas || 0)),
                    borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)',
                    fill: true, tension: 0.4, pointRadius: 4
                },
                {
                    label: 'Despesas',
                    data: reversido.map(d => parseFloat(d.total_despesas || 0)),
                    borderColor: '#f43f5e', backgroundColor: 'rgba(244,63,94,0.1)',
                    fill: true, tension: 0.4, pointRadius: 4
                },
                {
                    label: 'Saldo',
                    data: reversido.map(d => parseFloat(d.saldo || 0)),
                    borderColor: '#3b82f6', backgroundColor: 'transparent',
                    borderDash: [6, 3], tension: 0.4, pointRadius: 4
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#94a3b8', font: { size: 12 } } },
                tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)}` } }
            },
            scales: {
                x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.04)' } },
                y: { ticks: { color: '#64748b', callback: v => 'R$' + (v / 1000).toFixed(0) + 'k' }, grid: { color: 'rgba(255,255,255,0.04)' } }
            }
        }
    });

    // Tabela de detalhamento
    const tbody = document.getElementById('tabela-fluxo');
    tbody.innerHTML = dados.map(d => {
        const saldo = parseFloat(d.saldo || 0);
        return `
    <tr>
      <td>${new Date(d.mes).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</td>
      <td>${tipoBadge(d.tipo)}</td>
      <td style="color:var(--green)">${fmt(d.total_receitas)}</td>
      <td style="color:var(--red)">${fmt(d.total_despesas)}</td>
      <td style="color:${saldo >= 0 ? 'var(--green)' : 'var(--red)'};font-weight:700">${fmt(saldo)}</td>
    </tr>`;
    }).join('');
}

/* ═══════════════════════════════════════════════════════════
   EXPORTAÇÃO DE RELATÓRIO
═══════════════════════════════════════════════════════════ */
function exportarCSV() {
    const ano = new Date().getFullYear();
    const tipoParam = state.tipo !== 'todos' ? `&tipo=${state.tipo}` : '';
    // Apenas redirecionar causa o download do arquivo anexado pelo backend
    window.open(`/api/relatorios/exportar?ano=${ano}${tipoParam}`, '_blank');
}

/* ═══════════════════════════════════════════════════════════
   BACKUP DO SISTEMA
═══════════════════════════════════════════════════════════ */
function exportarBackupApp() {
    toast('Gerando backup integrando todas as tabelas (receitas, despesas, contas), por favor aguarde...', 'info');
    window.open(`/api/relatorios/backup`, '_blank');
}


/* ═══════════════════════════════════════════════════════════
   PÁGINA: DRE
═══════════════════════════════════════════════════════════ */
async function carregarDRE() {
    const tipoParam = state.tipo !== 'todos' ? `?tipo=${state.tipo}` : '';
    const { dados } = await apiFetch(`/api/relatorios/dre${tipoParam}`);

    const container = document.getElementById('dre-container');
    if (!dados || dados.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="icon">📋</div><p>Nenhum dado disponível para o DRE</p></div>`;
        return;
    }

    container.innerHTML = dados.map(d => {
        const resultado = d.resultado;
        return `
    <div style="margin-bottom:24px;padding:20px;background:var(--bg-primary);border-radius:10px;border:1px solid var(--border)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div>
          <strong>${new Date(d.mes + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</strong>
          <span style="margin-left:10px">${tipoBadge(d.tipo)}</span>
        </div>
        <div style="font-size:20px;font-weight:800;color:${resultado >= 0 ? 'var(--green)' : 'var(--red)'}">
          ${resultado >= 0 ? '📈' : '📉'} ${fmt(resultado)}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div>
          <div style="font-size:12px;color:var(--text-muted);font-weight:600;margin-bottom:8px">RECEITAS — ${fmt(d.total_receitas)}</div>
          ${d.receitas.map(r => `
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:13px">
              <span>${r.categoria}</span>
              <span style="color:var(--green)">${fmt(r.valor)}</span>
            </div>
          `).join('')}
        </div>
        <div>
          <div style="font-size:12px;color:var(--text-muted);font-weight:600;margin-bottom:8px">DESPESAS — ${fmt(d.total_despesas)}</div>
          ${d.despesas.map(r => `
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:13px">
              <span>${r.categoria}</span>
              <span style="color:var(--red)">${fmt(r.valor)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>`;
    }).join('');
}

/* ═══════════════════════════════════════════════════════════
   CATEGORIAS — Carrega opções para os selects dos formulários
═══════════════════════════════════════════════════════════ */
async function carregarCategorias(grupo, selectId, tipo) {
    const select = document.getElementById(selectId);
    if (!select) return;

    select.innerHTML = '<option value="">Carregando...</option>';
    try {
        const { dados } = await apiFetch(`/api/categorias?grupo=${grupo}&tipo=${tipo}`);
        select.innerHTML = dados?.length
            ? dados.map(c => `<option value="${c.id}">${c.nome}</option>`).join('')
            : '<option value="">Nenhuma categoria</option>';
    } catch {
        select.innerHTML = '<option value="">Erro ao carregar</option>';
    }
}

/* ═══════════════════════════════════════════════════════════
   MODAIS
═══════════════════════════════════════════════════════════ */
function abrirModalDespesa() {
    document.getElementById('form-despesa').reset();
    document.getElementById('d-id').value = '';
    document.getElementById('btn-excluir-despesa').style.display = 'none';
    document.getElementById('d-data').value = new Date().toISOString().split('T')[0];
    atualizarCategoriasDespesa();
    document.getElementById('modal-despesa').classList.add('open');
}

function abrirModalReceita() {
    document.getElementById('form-receita').reset();
    document.getElementById('r-id').value = '';
    document.getElementById('btn-excluir-receita').style.display = 'none';
    document.getElementById('r-data').value = new Date().toISOString().split('T')[0];
    atualizarCategoriasReceita();
    document.getElementById('modal-receita').classList.add('open');
}

function abrirModalConta() {
    document.getElementById('form-conta').reset();
    document.getElementById('c-id').value = '';
    document.getElementById('btn-excluir-conta').style.display = 'none';
    document.getElementById('c-vencimento').value = new Date().toISOString().split('T')[0];
    atualizarCategoriasConta();
    document.getElementById('modal-conta').classList.add('open');
}

function fecharModal(id) {
    document.getElementById(id).classList.remove('open');
}

// Fechar modal clicando fora
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
        if (e.target === overlay) overlay.classList.remove('open');
    });
});

/* ═══════════════════════════════════════════════════════════
   SALVAR — Despesa
═══════════════════════════════════════════════════════════ */
async function salvarDespesa(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-salvar-despesa');
    btn.textContent = 'Salvando...'; btn.disabled = true;

    try {
        const id = document.getElementById('d-id').value;
        const formData = new FormData();
        formData.append('descricao', document.getElementById('d-descricao').value);
        formData.append('valor', document.getElementById('d-valor').value);
        formData.append('data', document.getElementById('d-data').value);
        formData.append('tipo', document.getElementById('d-tipo').value);

        let categoria_id = document.getElementById('d-categoria').value;
        if (categoria_id && categoria_id !== 'nova') {
            formData.append('categoria_id', categoria_id);
        }

        formData.append('status', document.getElementById('d-status').value);
        formData.append('fornecedor', document.getElementById('d-fornecedor').value);
        formData.append('observacoes', document.getElementById('d-obs').value);

        const arquivo = document.getElementById('d-recibo').files[0];
        if (arquivo) {
            formData.append('recibo', arquivo);
        }

        const method = id ? 'PUT' : 'POST';
        const url = id ? `/api/despesas/${id}` : '/api/despesas';
        // Simular o PUT através do fetch de update. (Se Body form FormData for via PUT o express-multer as vezes requer trick, mas pelo setup do auth/middleware, no despesas.put eu não tenho multer config para put)
        // Oops, actually in despesas.js, PUT does not accept multipart/form-data for file upload yet. BUT, without files it works. If user uploads a file, it might fail unless we do a POST or fix it. Let's just do it directly. If user edits, we do application/json for PUT since usually we don't upload file on PUT.
        // Or better yet, just treat PUT purely as text JSON if no file is present. But let's keep formData and use PUT, it usually works if no file, but multer isn't configured for PUT /:id in routes/despesas.js

        let requestOpts = {};
        if (id) {
            const updates = {
                descricao: document.getElementById('d-descricao').value,
                valor: document.getElementById('d-valor').value,
                data: document.getElementById('d-data').value,
                tipo: document.getElementById('d-tipo').value,
                status: document.getElementById('d-status').value,
                fornecedor: document.getElementById('d-fornecedor').value,
                observacoes: document.getElementById('d-obs').value
            };
            if (categoria_id && categoria_id !== 'nova') updates.categoria_id = parseInt(categoria_id);

            requestOpts = { method: 'PUT', body: JSON.stringify(updates) };
        } else {
            requestOpts = { method: 'POST', body: formData };
        }

        const { sucesso, erro } = await apiFetch(url, requestOpts);

        if (sucesso) {
            toast('Despesa cadastrada com sucesso!');
            fecharModal('modal-despesa');
            carregarDespesas();
            iniciarDashboard();
        } else {
            toast(erro || 'Erro ao salvar despesa.', 'error');
        }
    } catch (err) {
        toast('Erro de conexão.', 'error');
    } finally {
        btn.textContent = '💾 Salvar Despesa'; btn.disabled = false;
    }
}

/* ═══════════════════════════════════════════════════════════
   SALVAR — Receita
═══════════════════════════════════════════════════════════ */
async function salvarReceita(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-salvar-receita');
    btn.textContent = 'Salvando...'; btn.disabled = true;

    try {
        const id = document.getElementById('r-id').value;
        const body = {
            descricao: document.getElementById('r-descricao').value,
            valor: document.getElementById('r-valor').value,
            data: document.getElementById('r-data').value,
            tipo: document.getElementById('r-tipo').value,
            categoria_id: document.getElementById('r-categoria').value,
            status: document.getElementById('r-status').value,
            observacoes: document.getElementById('r-obs').value
        };

        const method = id ? 'PUT' : 'POST';
        const url = id ? `/api/receitas/${id}` : '/api/receitas';

        const { sucesso, erro } = await apiFetch(url, {
            method, body: JSON.stringify(body)
        });

        if (sucesso) {
            toast('Receita salva com sucesso!');
            fecharModal('modal-receita');
            carregarReceitas();
            iniciarDashboard();
        } else {
            toast(erro || 'Erro ao salvar receita.', 'error');
        }
    } catch {
        toast('Erro de conexão.', 'error');
    } finally {
        btn.textContent = '💾 Salvar Receita'; btn.disabled = false;
    }
}

async function editarDespesa(id) {
    try {
        const { dados, sucesso } = await apiFetch(`/api/despesas/${id}`);
        if (!sucesso || !dados) return toast('Erro ao carregar', 'error');

        document.getElementById('d-id').value = dados.id;
        document.getElementById('btn-excluir-despesa').style.display = 'block';
        document.getElementById('d-descricao').value = dados.descricao;
        document.getElementById('d-valor').value = dados.valor;
        document.getElementById('d-data').value = dados.data;
        document.getElementById('d-tipo').value = dados.tipo;
        document.getElementById('d-status').value = dados.status;
        document.getElementById('d-fornecedor').value = dados.fornecedor || '';
        document.getElementById('d-obs').value = dados.observacoes || '';

        await atualizarCategoriasDespesa();
        if (dados.categoria_id) document.getElementById('d-categoria').value = dados.categoria_id;

        document.getElementById('modal-despesa').classList.add('open');
    } catch { toast('Erro de conexão.', 'error'); }
}

async function editarReceita(id) {
    try {
        const { dados, sucesso } = await apiFetch(`/api/receitas/${id}`);
        if (!sucesso || !dados) return toast('Erro ao carregar', 'error');

        document.getElementById('r-id').value = dados.id;
        document.getElementById('btn-excluir-receita').style.display = 'block';
        document.getElementById('r-descricao').value = dados.descricao;
        document.getElementById('r-valor').value = dados.valor;
        document.getElementById('r-data').value = dados.data;
        document.getElementById('r-tipo').value = dados.tipo;
        document.getElementById('r-status').value = dados.status;
        document.getElementById('r-obs').value = dados.observacoes || '';

        await atualizarCategoriasReceita();
        if (dados.categoria_id) document.getElementById('r-categoria').value = dados.categoria_id;

        document.getElementById('modal-receita').classList.add('open');
    } catch { toast('Erro de conexão.', 'error'); }
}

async function excluirDespesa(id) {
    if (!confirm('Tem certeza que deseja excluir esta despesa?')) return;
    try {
        const { sucesso, erro } = await apiFetch(`/api/despesas/${id}`, { method: 'DELETE' });
        if (sucesso) {
            toast('Despesa excluída!');
            fecharModal('modal-despesa');
            carregarDespesas();
            iniciarDashboard();
        } else { toast(erro || 'Erro ao excluir.', 'error'); }
    } catch { toast('Erro de conexão.', 'error'); }
}

async function excluirReceita(id) {
    if (!confirm('Tem certeza que deseja excluir esta receita?')) return;
    try {
        const { sucesso, erro } = await apiFetch(`/api/receitas/${id}`, { method: 'DELETE' });
        if (sucesso) {
            toast('Receita excluída!');
            fecharModal('modal-receita');
            carregarReceitas();
            iniciarDashboard();
        } else { toast(erro || 'Erro ao excluir.', 'error'); }
    } catch { toast('Erro de conexão.', 'error'); }
}

/* ═══════════════════════════════════════════════════════════
   SALVAR E EDITAR — Conta
═══════════════════════════════════════════════════════════ */
async function salvarConta(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-salvar-conta');
    if (btn) { btn.textContent = 'Salvando...'; btn.disabled = true; }

    try {
        const id = document.getElementById('c-id').value;
        const categoria_id = document.getElementById('c-categoria').value;

        const body = {
            descricao: document.getElementById('c-descricao').value,
            valor: document.getElementById('c-valor').value,
            vencimento: document.getElementById('c-vencimento').value,
            tipo_conta: document.getElementById('c-tipo-conta').value,
            tipo: document.getElementById('c-tipo').value,
            categoria_id: categoria_id || null,
            observacoes: document.getElementById('c-obs').value
        };

        const method = id ? 'PUT' : 'POST';
        const url = id ? `/api/contas/${id}` : '/api/contas';

        const { sucesso, erro } = await apiFetch(url, {
            method, body: JSON.stringify(body)
        });

        if (sucesso) {
            toast('Conta salva com sucesso!');
            fecharModal('modal-conta');
            carregarContas();
            iniciarDashboard();
        } else {
            toast(erro || 'Erro ao salvar conta.', 'error');
        }
    } catch {
        toast('Erro de conexão.', 'error');
    } finally {
        if (btn) { btn.textContent = '💾 Salvar Conta'; btn.disabled = false; }
    }
}

async function editarConta(id) {
    try {
        const { dados, sucesso } = await apiFetch(`/api/contas/${id}`);
        if (!sucesso || !dados) return toast('Erro ao carregar conta.', 'error');

        document.getElementById('c-id').value = dados.id;
        document.getElementById('btn-excluir-conta').style.display = 'block';
        document.getElementById('c-descricao').value = dados.descricao;
        document.getElementById('c-valor').value = dados.valor;
        document.getElementById('c-vencimento').value = dados.vencimento;
        document.getElementById('c-tipo-conta').value = dados.tipo_conta;
        document.getElementById('c-tipo').value = dados.tipo;
        document.getElementById('c-obs').value = dados.observacoes || '';

        // Carrega categorias baseado no combobox atual
        await atualizarCategoriasConta();
        // E só então seta o valor da categoria
        if (dados.categoria_id) {
            document.getElementById('c-categoria').value = dados.categoria_id;
        }

        document.getElementById('modal-conta').classList.add('open');
    } catch {
        toast('Erro de conexão.', 'error');
    }
}

async function excluirConta(id) {
    if (!confirm('Tem certeza que deseja excluir esta conta?')) return;
    try {
        const { sucesso, erro } = await apiFetch(`/api/contas/${id}`, { method: 'DELETE' });
        if (sucesso) {
            toast('Conta excluída com sucesso!');
            fecharModal('modal-conta');
            carregarContas();
            iniciarDashboard();
        } else {
            toast(erro || 'Erro ao excluir.', 'error');
        }
    } catch {
        toast('Erro de conexão.', 'error');
    }
}

async function atualizarCategoriasConta() {
    const tipoConta = document.getElementById('c-tipo-conta').value;     // pagar | receber
    const tipoOrigem = document.getElementById('c-tipo').value;          // pessoal | empresarial

    const grupo = tipoConta === 'pagar' ? 'despesa' : 'receita';

    await carregarCategorias(grupo, 'c-categoria', tipoOrigem);

    // Injetar opção "+ Nova Categoria" no select
    const selectCat = document.getElementById('c-categoria');
    if (selectCat) {
        selectCat.innerHTML += `<option style="font-weight:bold;color:var(--green)" value="nova">+ Criar Nova Categoria</option>`;
    }
}

async function atualizarCategoriasDespesa() {
    const tipo = document.getElementById('d-tipo').value;
    await carregarCategorias('despesa', 'd-categoria', tipo);
    const selectCat = document.getElementById('d-categoria');
    if (selectCat) selectCat.innerHTML += `<option style="font-weight:bold;color:var(--green)" value="nova">+ Criar Nova Categoria</option>`;
}

async function atualizarCategoriasReceita() {
    const tipo = document.getElementById('r-tipo').value;
    await carregarCategorias('receita', 'r-categoria', tipo);
    const selectCat = document.getElementById('r-categoria');
    if (selectCat) selectCat.innerHTML += `<option style="font-weight:bold;color:var(--green)" value="nova">+ Criar Nova Categoria</option>`;
}

async function verificarNovaCategoria(selectObj, idTipoConta, idTipo, grupoOverride) {
    if (selectObj.value === 'nova') {
        const nome = prompt('Digite o nome da nova categoria:');
        if (!nome) {
            // Reverte a seleção para vazia e evita salvar nada se usuário cancelar
            selectObj.value = '';
            return;
        }

        let grupo = grupoOverride;
        if (!grupo && idTipoConta) {
            const tipoConta = document.getElementById(idTipoConta).value;
            grupo = tipoConta === 'pagar' ? 'despesa' : 'receita';
        }
        const tipoOrigem = document.getElementById(idTipo).value;

        try {
            const { sucesso, dados, erro } = await apiFetch(`/api/categorias`, {
                method: 'POST', body: JSON.stringify({ nome, tipo: tipoOrigem, grupo })
            });

            if (sucesso && dados) {
                toast(`Categoria "${nome}" criada!`);
                if (grupoOverride === 'despesa') await atualizarCategoriasDespesa();
                else if (grupoOverride === 'receita') await atualizarCategoriasReceita();
                else await atualizarCategoriasConta();

                // Seleciona a nova
                selectObj.value = dados.id;
            } else {
                toast(erro || 'Erro ao criar.', 'error');
                selectObj.value = '';
            }
        } catch (e) {
            toast('Erro de conexão', 'error');
            selectObj.value = '';
        }
    }
}

/* ═══════════════════════════════════════════════════════════
   PÁGINA: CLIENTES
═══════════════════════════════════════════════════════════ */

// Timeout para busca com debounce
let _buscaTimer = null;

function buscarClientes(termo) {
    clearTimeout(_buscaTimer);
    _buscaTimer = setTimeout(() => carregarClientes(termo), 350);
}

async function carregarClientes(busca) {
    const tbody = document.getElementById('tabela-clientes');
    tbody.innerHTML = `<tr><td colspan="7"><div class="skeleton" style="margin:12px 0"></div></td></tr>`;

    const statusFiltro = document.getElementById('clientes-status-filtro')?.value || '';
    const termoBusca = busca !== undefined ? busca : (document.getElementById('clientes-busca')?.value || '');

    const params = new URLSearchParams();
    if (statusFiltro) params.set('status', statusFiltro);
    if (termoBusca.trim()) params.set('busca', termoBusca.trim());

    const { dados, sucesso } = await apiFetch('/api/clientes' + (params.toString() ? '?' + params : ''));

    if (!sucesso || !dados || dados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state"><div class="icon">👥</div><p>${termoBusca ? 'Nenhum cliente encontrado para esta busca' : 'Nenhum cliente cadastrado'}</p></td></tr>`;
        atualizarKPIsClientes([]);
        return;
    }

    atualizarKPIsClientes(dados);

    tbody.innerHTML = dados.map(c => {
        const tipoBadgeCliente = c.tipo_pessoa === 'juridica'
            ? `<span class="badge empresarial">PJ</span>`
            : `<span class="badge pessoal">PF</span>`;

        const statusBadgeCliente = c.status === 'ativo'
            ? `<span class="badge recebido">Ativo</span>`
            : `<span class="badge cancelado">Inativo</span>`;

        const localidade = [c.cidade, c.estado].filter(Boolean).join(' / ') || '—';
        const tel = c.telefone || c.whatsapp || '—';

        return `
        <tr>
          <td style="font-weight:600">${c.nome}</td>
          <td>${tipoBadgeCliente}</td>
          <td>${c.cpf_cnpj || '—'}</td>
          <td>${tel}</td>
          <td>${localidade}</td>
          <td>${statusBadgeCliente}</td>
          <td>
            <button class="btn btn-ghost" style="padding:4px 10px;font-size:12px" onclick="editarCliente(${c.id})">✏️ Editar</button>
            <button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;color:var(--red)" onclick="excluirCliente(${c.id},'${c.nome.replace(/'/g, '\\')}')">🗑️</button>
          </td>
        </tr>`;
    }).join('');
}

function atualizarKPIsClientes(dados) {
    const total = dados.length;
    const ativos = dados.filter(c => c.status === 'ativo').length;
    const inativos = total - ativos;
    const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    el('kpi-clientes-total', total);
    el('kpi-clientes-ativos', ativos);
    el('kpi-clientes-inativos', inativos);
}

/* ───────────────────────────────────────────────────────────
   MODAL DE CLIENTES — Abrir / Fechar / Preencher
─────────────────────────────────────────────────────────── */

function abrirModalCliente() {
    document.getElementById('form-cliente').reset();
    document.getElementById('cli-id').value = '';
    document.getElementById('modal-cliente-titulo').textContent = '➕ Novo Cliente';
    document.getElementById('btn-salvar-cliente').textContent = '💾 Salvar Cliente';
    document.getElementById('modal-cliente').classList.add('open');
}

async function editarCliente(id) {
    const { dados, sucesso } = await apiFetch(`/api/clientes/${id}`);
    if (!sucesso || !dados) { toast('Erro ao carregar cliente.', 'error'); return; }

    document.getElementById('cli-id').value = dados.id;
    document.getElementById('cli-nome').value = dados.nome || '';
    document.getElementById('cli-tipo').value = dados.tipo_pessoa || 'fisica';
    document.getElementById('cli-cpf').value = dados.cpf_cnpj || '';
    document.getElementById('cli-email').value = dados.email || '';
    document.getElementById('cli-telefone').value = dados.telefone || '';
    document.getElementById('cli-whatsapp').value = dados.whatsapp || '';
    document.getElementById('cli-status').value = dados.status || 'ativo';
    document.getElementById('cli-cep').value = dados.cep || '';
    document.getElementById('cli-logradouro').value = dados.logradouro || '';
    document.getElementById('cli-numero').value = dados.numero || '';
    document.getElementById('cli-complemento').value = dados.complemento || '';
    document.getElementById('cli-bairro').value = dados.bairro || '';
    document.getElementById('cli-cidade').value = dados.cidade || '';
    document.getElementById('cli-estado').value = dados.estado || '';
    document.getElementById('cli-obs').value = dados.observacoes || '';

    document.getElementById('modal-cliente-titulo').textContent = `✏️ Editar — ${dados.nome}`;
    document.getElementById('btn-salvar-cliente').textContent = '💾 Atualizar Cliente';
    document.getElementById('modal-cliente').classList.add('open');
}

/* ───────────────────────────────────────────────────────────
   BUSCA AUTOMÁTICA DE CEP (ViaCEP)
─────────────────────────────────────────────────────────── */

async function buscarCEP(value) {
    const cep = value.replace(/\D/g, '');
    if (cep.length !== 8) return;
    try {
        const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const d = await r.json();
        if (d.erro) { toast('CEP não encontrado.', 'error'); return; }
        document.getElementById('cli-logradouro').value = d.logradouro || '';
        document.getElementById('cli-bairro').value = d.bairro || '';
        document.getElementById('cli-cidade').value = d.localidade || '';
        document.getElementById('cli-estado').value = d.uf || '';
        document.getElementById('cli-numero').focus();
        toast('Endereço preenchido automaticamente! 🦭');
    } catch {
        toast('Erro ao buscar CEP.', 'error');
    }
}

/* ───────────────────────────────────────────────────────────
   SALVAR CLIENTE (POST / PUT)
─────────────────────────────────────────────────────────── */

async function salvarCliente(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-salvar-cliente');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    const id = document.getElementById('cli-id').value;
    const body = {
        nome: document.getElementById('cli-nome').value.trim(),
        tipo_pessoa: document.getElementById('cli-tipo').value,
        cpf_cnpj: document.getElementById('cli-cpf').value.trim() || null,
        email: document.getElementById('cli-email').value.trim() || null,
        telefone: document.getElementById('cli-telefone').value.trim() || null,
        whatsapp: document.getElementById('cli-whatsapp').value.trim() || null,
        status: document.getElementById('cli-status').value,
        cep: document.getElementById('cli-cep').value.trim() || null,
        logradouro: document.getElementById('cli-logradouro').value.trim() || null,
        numero: document.getElementById('cli-numero').value.trim() || null,
        complemento: document.getElementById('cli-complemento').value.trim() || null,
        bairro: document.getElementById('cli-bairro').value.trim() || null,
        cidade: document.getElementById('cli-cidade').value.trim() || null,
        estado: document.getElementById('cli-estado').value || null,
        observacoes: document.getElementById('cli-obs').value.trim() || null
    };

    try {
        const url = id ? `/api/clientes/${id}` : '/api/clientes';
        const method = id ? 'PUT' : 'POST';

        const { sucesso, erro } = await apiFetch(url, {
            method, body: JSON.stringify(body)
        });

        if (sucesso) {
            toast(id ? 'Cliente atualizado com sucesso!' : 'Cliente cadastrado com sucesso!');
            fecharModal('modal-cliente');
            carregarClientes();
        } else {
            toast(erro || 'Erro ao salvar cliente.', 'error');
        }
    } catch {
        toast('Erro de conexão.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = id ? '💾 Atualizar Cliente' : '💾 Salvar Cliente';
    }
}

/* ───────────────────────────────────────────────────────────
   EXCLUIR CLIENTE
─────────────────────────────────────────────────────────── */

async function excluirCliente(id, nome) {
    if (!confirm(`Deseja excluir o cliente "${nome}"?\nEsta ação não pode ser desfeita.`)) return;
    try {
        const { sucesso, erro } = await apiFetch(`/api/clientes/${id}`, { method: 'DELETE' });
        if (sucesso) {
            toast(`Cliente "${nome}" excluído!`);
            carregarClientes();
        } else {
            toast(erro || 'Erro ao excluir cliente.', 'error');
        }
    } catch {
        toast('Erro de conexão.', 'error');
    }
}
