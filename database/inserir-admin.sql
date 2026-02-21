-- ============================================================
-- INSERIR USUÁRIO ADMIN — Execute no Supabase SQL Editor
-- APÓS ter executado: database/schema.sql e database/usuarios.sql
-- ============================================================

INSERT INTO usuarios (nome, email, senha_hash, ativo)
VALUES (
  'Administrador',
  'comercial@oliveiravittae.com.br',
  '$2b$12$QW2n.T1LaG42JtPmiKp.GOp09KJtv.xnle7E0ViosEw9gNzI8waB6',
  true
)
ON CONFLICT (email) DO UPDATE SET senha_hash = EXCLUDED.senha_hash;

-- Confirmar inserção
SELECT id, nome, email, ativo, criado_em FROM usuarios;
