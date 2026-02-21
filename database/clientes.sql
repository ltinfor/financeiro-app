-- ============================================================
-- MÓDULO DE CLIENTES
-- Execute no Supabase SQL Editor
-- ============================================================

-- Tabela principal de clientes
CREATE TABLE IF NOT EXISTS clientes (
  id            SERIAL PRIMARY KEY,
  nome          VARCHAR(150) NOT NULL,
  tipo_pessoa   VARCHAR(10)  DEFAULT 'fisica' CHECK (tipo_pessoa IN ('fisica','juridica')),
  cpf_cnpj      VARCHAR(20),
  email         VARCHAR(150),
  telefone      VARCHAR(20),
  whatsapp      VARCHAR(20),
  cep           VARCHAR(10),
  logradouro    VARCHAR(200),
  numero        VARCHAR(10),
  complemento   VARCHAR(100),
  bairro        VARCHAR(100),
  cidade        VARCHAR(100),
  estado        VARCHAR(2),
  status        VARCHAR(10)  DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
  observacoes   TEXT,
  criado_em     TIMESTAMPTZ  DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ  DEFAULT NOW()
);

-- Trigger de atualização automática
DROP TRIGGER IF EXISTS trg_clientes_atualizar ON clientes;
CREATE TRIGGER trg_clientes_atualizar
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION fn_atualizar_timestamp();

-- Tabela de histórico de serviços por cliente
CREATE TABLE IF NOT EXISTS clientes_historico (
  id          SERIAL PRIMARY KEY,
  cliente_id  INT          NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  data        DATE         NOT NULL DEFAULT CURRENT_DATE,
  servico     VARCHAR(200) NOT NULL,
  descricao   TEXT,
  valor       NUMERIC(10,2),
  status      VARCHAR(20)  DEFAULT 'concluido' CHECK (status IN ('concluido','pendente','cancelado')),
  criado_em   TIMESTAMPTZ  DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_clientes_nome    ON clientes(nome);
CREATE INDEX IF NOT EXISTS idx_clientes_cpfcnpj ON clientes(cpf_cnpj);
CREATE INDEX IF NOT EXISTS idx_historico_cliente ON clientes_historico(cliente_id);
