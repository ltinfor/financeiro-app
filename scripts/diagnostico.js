import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import dns from 'dns';
import { promisify } from 'util';

const lookup = promisify(dns.lookup);

async function diagnosticar() {
    console.log('\n🔍 Iniciando Diagnóstico de Conexão...');
    console.log('------------------------------------');

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;

    if (!url || !key) {
        console.error('❌ ERRO: SUPABASE_URL ou SUPABASE_ANON_KEY não configurados no .env');
        return;
    }

    const host = url.replace('https://', '').split('/')[0];
    console.log(`📌 Testando host: ${host}`);

    // 1. Teste de DNS
    try {
        const address = await lookup(host);
        console.log(`✅ DNS: Resolvido para ${address.address}`);
    } catch (err) {
        console.error(`❌ DNS: Falha ao resolver host (${err.code}).`);
        console.error('👉 O projeto no Supabase pode estar pausado ou a URL está incorreta.');
        return;
    }

    // 2. Teste de Conectividade com Supabase-js
    try {
        const supabase = createClient(url, key);
        console.log('⏳ Testando consulta simples ao banco...');
        
        // Tenta buscar as categorias (tabela que costuma existir)
        const { error } = await supabase.from('categorias').select('count', { count: 'exact', head: true });
        
        if (error) {
            console.error(`❌ API Supabase: Erro na consulta (${error.code}: ${error.message})`);
        } else {
            console.log('✅ API Supabase: Conexão estabelecida com sucesso!');
        }
    } catch (err) {
        console.error('❌ API Supabase: Erro inesperado ao conectar:', err.message);
    }
    
    console.log('------------------------------------');
    console.log('🎉 Diagnóstico concluído.\n');
}

diagnosticar();
