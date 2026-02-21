// scripts/inserir-usuario.mjs
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

const EMAIL = 'comercial@oliveiravittae.com.br';
const SENHA = 'Lco@79703488$$';

console.log('\n  🔧 Inserindo usuário admin no Supabase...');

try {
    const senhaHash = await bcrypt.hash(SENHA, 12);

    const { data, error } = await supabase
        .from('usuarios')
        .upsert(
            { nome: 'Administrador', email: EMAIL, senha_hash: senhaHash, ativo: true },
            { onConflict: 'email' }
        )
        .select('id, nome, email, ativo');

    if (error) {
        console.error('  ❌ Erro do Supabase:', error.message);
        if (error.code === '42P01') {
            console.error('\n  ⚠️  Tabela "usuarios" não existe ainda.');
            console.error('  Execute no Supabase SQL Editor:');
            console.error('    ① database/schema.sql');
            console.error('    ② database/usuarios.sql');
            console.error('  Depois rode este script novamente.\n');
        }
    } else {
        const u = data[0];
        console.log(`  ✅ Usuário ${u.email} (ID: ${u.id}) pronto!`);
        console.log('  Acesse http://localhost:3000 e faça login.\n');
    }
} catch (e) {
    console.error('  ❌ Erro:', e.message);
} finally {
    setTimeout(() => process.exit(0), 500);
}
