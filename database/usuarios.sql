-- ============================================================
-- ADICIONAR AO SCHEMA EXISTENTE: Tabela de Usuários
-- Execute este bloco no SQL Editor do Supabase
-- APÓS ter executado o schema.sql principal
-- ============================================================

-- Tabela de usuários do sistema
CREATE TABLE IF NOT EXISTS usuarios (
  id          SERIAL PRIMARY KEY,
  nome        VARCHAR(100)  NOT NULL,
  email       VARCHAR(150)  NOT NULL UNIQUE,
  senha_hash  TEXT          NOT NULL,   -- Gerado pelo bcrypt (nunca texto puro)
  ativo       BOOLEAN       DEFAULT TRUE,
  ultimo_login TIMESTAMPTZ,
  criado_em   TIMESTAMPTZ   DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para busca por email (login)
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);

-- Trigger de atualização automática
DROP TRIGGER IF EXISTS trg_usuarios_atualizar ON usuarios;
CREATE TRIGGER trg_usuarios_atualizar
  BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION fn_atualizar_timestamp();

-- ============================================================
-- NOTA: Não insira usuários diretamente por SQL.
-- Use o script: node scripts/criar-admin.js
-- Ele garante que a senha seja hasheada corretamente com bcrypt.
-- ============================================================
