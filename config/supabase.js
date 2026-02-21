// config/supabase.js
// Instância centralizada do cliente Supabase
// Importar este módulo em todas as rotas que precisam de acesso ao banco

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERRO: Variáveis SUPABASE_URL e SUPABASE_ANON_KEY não encontradas.');
  console.error('   Certifique-se de que o arquivo .env existe e está preenchido corretamente.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

export default supabase;
