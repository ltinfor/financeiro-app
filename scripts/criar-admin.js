// scripts/criar-admin.js
// Script para criar o primeiro usuário administrador
// Execute UMA VEZ: node scripts/criar-admin.js
//
// Pré-requisitos:
//   1. .env preenchido com SUPABASE_URL e SUPABASE_ANON_KEY
//   2. Tabela 'usuarios' já criada no Supabase (database/usuarios.sql)

import bcrypt from 'bcryptjs';
import readline from 'readline';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// ─── Verificações iniciais ──────────────────────────────────
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.error('\n❌ Configure as variáveis SUPABASE_URL e SUPABASE_ANON_KEY no .env\n');
    process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// ─── Helper para leitura de input ──────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const perguntar = (pergunta, ocultar = false) =>
    new Promise(resolve => {
        if (ocultar) {
            // Oculta o input da senha no terminal
            process.stdout.write(pergunta);
            process.stdin.setRawMode?.(true);
            process.stdin.resume();
            let senha = '';
            process.stdin.once('data', chunk => {
                senha = chunk.toString().replace(/[\r\n]/, '');
                process.stdin.setRawMode?.(false);
                process.stdout.write('\n');
                resolve(senha);
            });
        } else {
            rl.question(pergunta, resolve);
        }
    });

// ─── Função principal ───────────────────────────────────────
async function criarAdmin() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║   Aplicativo Financeiro — Criar Admin  ║');
    console.log('╚════════════════════════════════════════╝\n');

    const nome = await perguntar('  Nome completo: ');
    const email = await perguntar('  E-mail:        ');
    const senha = await perguntar('  Senha (min. 8 caracteres): ');

    // Validações
    if (!nome.trim() || !email.trim() || !senha.trim()) {
        console.error('\n❌ Todos os campos são obrigatórios.\n');
        process.exit(1);
    }

    if (senha.length < 8) {
        console.error('\n❌ A senha deve ter pelo menos 8 caracteres.\n');
        process.exit(1);
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        console.error('\n❌ E-mail inválido.\n');
        process.exit(1);
    }

    // Verificar se e-mail já existe
    const { data: existente } = await supabase
        .from('usuarios')
        .select('id')
        .eq('email', email.toLowerCase().trim())
        .single();

    if (existente) {
        console.error(`\n❌ Já existe um usuário com o e-mail "${email}".\n`);
        process.exit(1);
    }

    // Gerar hash da senha (salt 12 = bcrypt padrão seguro)
    console.log('\n  ⏳ Gerando hash da senha...');
    const senhaHash = await bcrypt.hash(senha, 12);

    // Inserir no banco
    const { data, error } = await supabase
        .from('usuarios')
        .insert([{
            nome: nome.trim(),
            email: email.toLowerCase().trim(),
            senha_hash: senhaHash,
            ativo: true
        }])
        .select('id, nome, email, criado_em')
        .single();

    if (error) {
        console.error('\n❌ Erro ao criar usuário:', error.message, '\n');
        process.exit(1);
    }

    console.log('\n  ✅ Usuário criado com sucesso!');
    console.log('  ─────────────────────────────────');
    console.log(`  ID:       ${data.id}`);
    console.log(`  Nome:     ${data.nome}`);
    console.log(`  E-mail:   ${data.email}`);
    console.log(`  Criado:   ${new Date(data.criado_em).toLocaleString('pt-BR')}`);
    console.log('\n  Acesse o app e faça login com essas credenciais.\n');

    rl.close();
    process.exit(0);
}

criarAdmin().catch(err => {
    console.error('\n❌ Erro inesperado:', err.message, '\n');
    process.exit(1);
});
