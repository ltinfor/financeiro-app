-- ============================================================
-- APLICATIVO FINANCEIRO - SCHEMA COMPLETO
-- Banco de Dados: PostgreSQL via Supabase
-- ============================================================
-- Execute este script no SQL Editor do Supabase
-- ============================================================

-- Habilitar extensão para UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. TABELA DE CATEGORIAS
-- Tabela mãe que define categorias para receitas e despesas.
-- Diferencia rigidamente entre Pessoal e Empresarial.
-- ============================================================
CREATE TABLE IF NOT EXISTS categorias (
  id           SERIAL PRIMARY KEY,
  nome         VARCHAR(100)  NOT NULL,
  tipo         VARCHAR(20)   NOT NULL CHECK (tipo IN ('pessoal', 'empresarial')),
  grupo        VARCHAR(20)   NOT NULL CHECK (grupo IN ('receita', 'despesa', 'ambos')),
  descricao    TEXT,
  ativo        BOOLEAN       DEFAULT TRUE,
  criado_em    TIMESTAMPTZ   DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_categorias_tipo  ON categorias(tipo);
CREATE INDEX IF NOT EXISTS idx_categorias_grupo ON categorias(grupo);

-- ============================================================
-- 2. TABELA DE RECEITAS
-- Registra todas as entradas financeiras.
-- ============================================================
CREATE TABLE IF NOT EXISTS receitas (
  id            SERIAL PRIMARY KEY,
  descricao     VARCHAR(255)    NOT NULL,
  valor         NUMERIC(15, 2)  NOT NULL CHECK (valor > 0),
  data          DATE            NOT NULL DEFAULT CURRENT_DATE,
  categoria_id  INTEGER         NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,
  tipo          VARCHAR(20)     NOT NULL CHECK (tipo IN ('pessoal', 'empresarial')),
  status        VARCHAR(20)     NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'recebido', 'cancelado')),
  observacoes   TEXT,
  criado_em     TIMESTAMPTZ     DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ     DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_receitas_data         ON receitas(data);
CREATE INDEX IF NOT EXISTS idx_receitas_tipo         ON receitas(tipo);
CREATE INDEX IF NOT EXISTS idx_receitas_status       ON receitas(status);
CREATE INDEX IF NOT EXISTS idx_receitas_categoria_id ON receitas(categoria_id);

-- ============================================================
-- 3. TABELA DE DESPESAS
-- Registra todas as saídas financeiras com suporte a recibos.
-- ============================================================
CREATE TABLE IF NOT EXISTS despesas (
  id            SERIAL PRIMARY KEY,
  descricao     VARCHAR(255)    NOT NULL,
  valor         NUMERIC(15, 2)  NOT NULL CHECK (valor > 0),
  data          DATE            NOT NULL DEFAULT CURRENT_DATE,
  categoria_id  INTEGER         NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,
  tipo          VARCHAR(20)     NOT NULL CHECK (tipo IN ('pessoal', 'empresarial')),
  status        VARCHAR(20)     NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'cancelado')),
  recibo_url    TEXT,           -- Link do anexo / recibo
  fornecedor    VARCHAR(150),
  observacoes   TEXT,
  criado_em     TIMESTAMPTZ     DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ     DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_despesas_data         ON despesas(data);
CREATE INDEX IF NOT EXISTS idx_despesas_tipo         ON despesas(tipo);
CREATE INDEX IF NOT EXISTS idx_despesas_status       ON despesas(status);
CREATE INDEX IF NOT EXISTS idx_despesas_categoria_id ON despesas(categoria_id);

-- ============================================================
-- 4. TABELA DE CONTAS A PAGAR / RECEBER
-- Controla vencimentos e status de cada compromisso financeiro.
-- ============================================================
CREATE TABLE IF NOT EXISTS contas_pagar_receber (
  id             SERIAL PRIMARY KEY,
  descricao      VARCHAR(255)    NOT NULL,
  valor          NUMERIC(15, 2)  NOT NULL CHECK (valor > 0),
  tipo_conta     VARCHAR(10)     NOT NULL CHECK (tipo_conta IN ('pagar', 'receber')),
  tipo           VARCHAR(20)     NOT NULL CHECK (tipo IN ('pessoal', 'empresarial')),
  categoria_id   INTEGER         REFERENCES categorias(id) ON DELETE SET NULL,
  vencimento     DATE            NOT NULL,
  data_pagamento DATE,           -- Preenchida quando efetivamente pago/recebido
  status         VARCHAR(20)     NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'atrasado', 'cancelado')),
  recibo_url     TEXT,
  parcelas_total INTEGER         DEFAULT 1 CHECK (parcelas_total >= 1),
  parcela_atual  INTEGER         DEFAULT 1,
  observacoes    TEXT,
  criado_em      TIMESTAMPTZ     DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ     DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_contas_vencimento  ON contas_pagar_receber(vencimento);
CREATE INDEX IF NOT EXISTS idx_contas_tipo_conta  ON contas_pagar_receber(tipo_conta);
CREATE INDEX IF NOT EXISTS idx_contas_tipo        ON contas_pagar_receber(tipo);
CREATE INDEX IF NOT EXISTS idx_contas_status      ON contas_pagar_receber(status);

-- ============================================================
-- 5. FUNÇÃO: Atualizar campo atualizado_em automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION fn_atualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para atualização automática de timestamp
DROP TRIGGER IF EXISTS trg_receitas_atualizar   ON receitas;
CREATE TRIGGER trg_receitas_atualizar
  BEFORE UPDATE ON receitas
  FOR EACH ROW EXECUTE FUNCTION fn_atualizar_timestamp();

DROP TRIGGER IF EXISTS trg_despesas_atualizar   ON despesas;
CREATE TRIGGER trg_despesas_atualizar
  BEFORE UPDATE ON despesas
  FOR EACH ROW EXECUTE FUNCTION fn_atualizar_timestamp();

DROP TRIGGER IF EXISTS trg_contas_atualizar     ON contas_pagar_receber;
CREATE TRIGGER trg_contas_atualizar
  BEFORE UPDATE ON contas_pagar_receber
  FOR EACH ROW EXECUTE FUNCTION fn_atualizar_timestamp();

-- ============================================================
-- 6. FUNÇÃO: Atualizar status de contas atrasadas
-- Execute via CRON job no Supabase (pg_cron) ou chamada manual
-- ============================================================
CREATE OR REPLACE FUNCTION fn_atualizar_contas_atrasadas()
RETURNS void AS $$
BEGIN
  UPDATE contas_pagar_receber
  SET    status = 'atrasado'
  WHERE  status = 'pendente'
    AND  vencimento < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 7. VIEW: FLUXO DE CAIXA
-- Saldo = total de receitas recebidas - total de despesas pagas
-- ============================================================
CREATE OR REPLACE VIEW vw_fluxo_caixa AS
  SELECT
    tipo,
    DATE_TRUNC('month', data) AS mes,
    SUM(CASE WHEN tabela = 'receita' THEN valor ELSE 0 END)  AS total_receitas,
    SUM(CASE WHEN tabela = 'despesa' THEN valor ELSE 0 END)  AS total_despesas,
    SUM(CASE
          WHEN tabela = 'receita' THEN  valor
          WHEN tabela = 'despesa' THEN -valor
        END) AS saldo
  FROM (
    SELECT valor, data, tipo, 'receita' AS tabela
    FROM   receitas
    WHERE  status = 'recebido'

    UNION ALL

    SELECT valor, data, tipo, 'despesa' AS tabela
    FROM   despesas
    WHERE  status = 'pago'
  ) AS transacoes
  GROUP BY tipo, mes
  ORDER BY mes DESC, tipo;

-- ============================================================
-- 8. VIEW: DRE SIMPLIFICADO MENSAL
-- Lucro/Prejuízo por categoria, agrupado por mês e tipo
-- ============================================================
CREATE OR REPLACE VIEW vw_dre_mensal AS
  SELECT
    t.tipo,
    DATE_TRUNC('month', t.data) AS mes,
    c.nome                       AS categoria,
    c.grupo,
    SUM(CASE WHEN t.grupo = 'receita' THEN t.valor ELSE 0 END)  AS total_receitas,
    SUM(CASE WHEN t.grupo = 'despesa' THEN t.valor ELSE 0 END)  AS total_despesas,
    SUM(CASE
          WHEN t.grupo = 'receita' THEN  t.valor
          WHEN t.grupo = 'despesa' THEN -t.valor
        END) AS resultado
  FROM (
    SELECT r.valor, r.data, r.tipo, r.categoria_id, 'receita' AS grupo
    FROM   receitas r
    WHERE  r.status = 'recebido'

    UNION ALL

    SELECT d.valor, d.data, d.tipo, d.categoria_id, 'despesa' AS grupo
    FROM   despesas d
    WHERE  d.status = 'pago'
  ) AS t
  JOIN categorias c ON c.id = t.categoria_id
  GROUP BY t.tipo, mes, c.nome, c.grupo
  ORDER BY mes DESC, t.tipo, c.grupo;

-- ============================================================
-- 9. DADOS INICIAIS — Categorias padrão
-- ============================================================

-- Categorias Empresariais
INSERT INTO categorias (nome, tipo, grupo, descricao) VALUES
  ('Vendas',               'empresarial', 'receita',  'Receita proveniente de vendas de produtos ou serviços'),
  ('Prestação de Serviços','empresarial', 'receita',  'Receita de serviços prestados'),
  ('Comissões Recebidas',  'empresarial', 'receita',  'Comissões e bonificações'),
  ('Outras Receitas',      'empresarial', 'receita',  'Demais entradas empresariais'),
  ('Fornecedores',         'empresarial', 'despesa',  'Pagamentos a fornecedores'),
  ('Folha de Pagamento',   'empresarial', 'despesa',  'Salários e encargos trabalhistas'),
  ('Aluguel Comercial',    'empresarial', 'despesa',  'Aluguel do espaço comercial'),
  ('Marketing',            'empresarial', 'despesa',  'Publicidade e marketing'),
  ('Impostos e Taxas',     'empresarial', 'despesa',  'Tributos e obrigações fiscais'),
  ('Serviços Contábeis',   'empresarial', 'despesa',  'Honorários contábeis e jurídicos'),
  ('Utilidades',           'empresarial', 'despesa',  'Água, luz, internet, telefone'),
  ('Outras Despesas',      'empresarial', 'despesa',  'Demais saídas empresariais')
ON CONFLICT DO NOTHING;

-- Categorias Pessoais
INSERT INTO categorias (nome, tipo, grupo, descricao) VALUES
  ('Salário',              'pessoal', 'receita',  'Salário recebido'),
  ('Freelance',            'pessoal', 'receita',  'Trabalhos freelance e bicos'),
  ('Rendimentos',          'pessoal', 'receita',  'Investimentos, aluguéis pessoais'),
  ('Outras Receitas',      'pessoal', 'receita',  'Demais entradas pessoais'),
  ('Alimentação',          'pessoal', 'despesa',  'Supermercado, restaurantes'),
  ('Moradia',              'pessoal', 'despesa',  'Aluguel, condomínio, IPTU'),
  ('Transporte',           'pessoal', 'despesa',  'Combustível, transporte público'),
  ('Saúde',                'pessoal', 'despesa',  'Plano de saúde, farmácia, consultas'),
  ('Educação',             'pessoal', 'despesa',  'Cursos, mensalidades, livros'),
  ('Lazer',                'pessoal', 'despesa',  'Entretenimento, viagens, hobbies'),
  ('Vestuário',            'pessoal', 'despesa',  'Roupas e acessórios'),
  ('Outras Despesas',      'pessoal', 'despesa',  'Demais despesas pessoais')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 10. TABELA DE PROJETOS
-- ============================================================
CREATE TABLE IF NOT EXISTS projetos (
  id            SERIAL PRIMARY KEY,
  nome          VARCHAR(255)    NOT NULL,
  descricao     TEXT,
  data_inicio   DATE,
  data_fim      DATE,
  status        VARCHAR(50)     DEFAULT 'ativo' CHECK (status IN ('ativo', 'concluido', 'cancelado')),
  orcamento     NUMERIC(15, 2)  DEFAULT 0,
  criado_em     TIMESTAMPTZ     DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ     DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_projetos_atualizar ON projetos;
CREATE TRIGGER trg_projetos_atualizar
  BEFORE UPDATE ON projetos
  FOR EACH ROW EXECUTE FUNCTION fn_atualizar_timestamp();

-- ============================================================
-- 11. TABELA DE EQUIPAMENTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS equipamentos (
  id            SERIAL PRIMARY KEY,
  nome          VARCHAR(255)    NOT NULL,
  numero_serie  VARCHAR(100),
  data_aquisicao DATE,
  valor         NUMERIC(15, 2)  DEFAULT 0,
  status        VARCHAR(50)     DEFAULT 'ativo' CHECK (status IN ('ativo', 'manutencao', 'inativo')),
  projeto_id    INTEGER         REFERENCES projetos(id) ON DELETE SET NULL,
  descricao     TEXT,
  criado_em     TIMESTAMPTZ     DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ     DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_equipamentos_atualizar ON equipamentos;
CREATE TRIGGER trg_equipamentos_atualizar
  BEFORE UPDATE ON equipamentos
  FOR EACH ROW EXECUTE FUNCTION fn_atualizar_timestamp();
