// scripts/setup-supabase.mjs
// Usa a Supabase Management REST API para executar SQL diretamente
// Execute: node scripts/setup-supabase.mjs
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import https from 'https';

// Extrai o Project Ref da URL do Supabase
// Ex: https://kklvdmdmacgabaykccdj.supabase.co → kklvdmdmacgabaykccdj
const projectRef = process.env.SUPABASE_URL
    ?.replace('https://', '')
    ?.split('.')[0];

const EMAIL = 'comercial@oliveiravittae.com.br';
const SENHA = 'Lco@79703488$$';

async function executarSQL(sql) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({ query: sql });
        const options = {
            hostname: `${projectRef}.supabase.co`,
            path: '/rest/v1/rpc/exec_sql',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY}`,
                'Content-Length': Buffer.byteLength(body)
            }
        };
        const req = https.request(options, res => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function inserirViaREST(senhaHash) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify([{
            nome: 'Administrador',
            email: EMAIL,
            senha_hash: senhaHash,
            ativo: true
        }]);

        const options = {
            hostname: `${projectRef}.supabase.co`,
            path: '/rest/v1/usuarios',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY}`,
                'Prefer': 'resolution=merge-duplicates,return=representation',
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const req = https.request(options, res => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

console.log('\n  🔧 Configurando banco de dados...');
console.log(`  📌 Projeto: ${projectRef}`);

try {
    const senhaHash = await bcrypt.hash(SENHA, 12);
    const result = await inserirViaREST(senhaHash);

    if (result.status === 201 || result.status === 200) {
        const dados = JSON.parse(result.body);
        console.log(`\n  ✅ Usuário inserido com sucesso!`);
        console.log(`  Email: ${EMAIL}`);
        console.log(`  ID: ${dados[0]?.id}`);
        console.log('\n  Agora acesse http://localhost:3000 e faça login.\n');
    } else if (result.status === 404) {
        console.log('\n  ⚠️  A tabela "usuarios" não existe ainda no Supabase.');
        console.log('  É necessário criá-la primeiro.\n');
        console.log('  SOLUÇÃO: Abra o Supabase SQL Editor e execute:');
        console.log(`  https://supabase.com/dashboard/project/${projectRef}/sql/new\n`);
        console.log('  Cole e execute o conteúdo de: database/usuarios.sql\n');
    } else {
        const err = JSON.parse(result.body || '{}');
        // Verificar se é erro de violação de unicidade (usuário já existe)
        if (err.code === '23505') {
            console.log('\n  ℹ️  Usuário já cadastrado! Atualizando senha...');
            // Tentar PATCH para atualizar
            console.log('  Execute database/inserir-admin.sql no Supabase SQL Editor para atualizar.');
        } else {
            console.error(`\n  ❌ Erro ${result.status}:`, err.message || result.body);
        }
    }
} catch (e) {
    console.error('  ❌ Erro:', e.message);
} finally {
    setTimeout(() => process.exit(0), 300);
}
