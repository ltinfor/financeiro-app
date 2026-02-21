-- ============================================================
-- COLE TODO ESTE BLOCO NO SUPABASE SQL EDITOR E EXECUTE
-- Projeto: kklvdmdmacgabaykccdj.supabase.co
-- ============================================================

-- 1. Função de timestamp (necessária para o trigger)
CREATE OR REPLACE FUNCTION fn_atualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Tabela de usuários do sistema
CREATE TABLE IF NOT EXISTS usuarios (
  id            SERIAL PRIMARY KEY,
  nome          VARCHAR(100)  NOT NULL,
  email         VARCHAR(150)  NOT NULL UNIQUE,
  senha_hash    TEXT          NOT NULL,
  ativo         BOOLEAN       DEFAULT TRUE,
  ultimo_login  TIMESTAMPTZ,
  criado_em     TIMESTAMPTZ   DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ   DEFAULT NOW()
);

-- 3. Trigger de atualização automática
DROP TRIGGER IF EXISTS trg_usuarios_atualizar ON usuarios;
CREATE TRIGGER trg_usuarios_atualizar
  BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION fn_atualizar_timestamp();

-- 4. Inserir usuário admin
-- Email: comercial@oliveiravittae.com.br
-- Senha: Lco@79703488$$  (hash bcrypt, salt 12)
INSERT INTO usuarios (nome, email, senha_hash, ativo)
VALUES (
  'Administrador',
  'comercial@oliveiravittae.com.br',
  '$2b$12$QW2n.T1LaG42JtPmiKp.GOp09KJtv.xnle7E0ViosEw9gNzI8waB6',
  true
)
ON CONFLICT (email) DO UPDATE SET senha_hash = EXCLUDED.senha_hash;

-- 5. Confirmar (deve retornar 1 linha)
SELECT id, nome, email, ativo, criado_em FROM usuarios;
