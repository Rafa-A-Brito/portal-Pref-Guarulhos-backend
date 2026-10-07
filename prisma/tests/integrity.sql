\set ON_ERROR_STOP on

BEGIN;

CREATE FUNCTION pg_temp.expect_sqlstate(command text, expected_state text)
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
    BEGIN
        EXECUTE command;
    EXCEPTION WHEN OTHERS THEN
        IF SQLSTATE = expected_state THEN
            RETURN;
        END IF;
        RAISE EXCEPTION 'SQLSTATE inesperado: %, esperado: %. Comando: %', SQLSTATE, expected_state, command;
    END;
    RAISE EXCEPTION 'O comando deveria falhar com SQLSTATE %, mas foi aceito: %', expected_state, command;
END;
$function$;

DO $test$
BEGIN
    IF (SELECT count(*) FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('users', 'categoria', 'patrimonio', 'local', 'patrimonio_imagens', 'patrimonio_documentos', 'rota', 'rota_patrimonio', 'audit_log')) <> 9 THEN
        RAISE EXCEPTION 'As 9 tabelas físicas esperadas não foram encontradas';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('users', 'categoria', 'patrimonio', 'local', 'patrimonio_imagens', 'patrimonio_documentos', 'rota', 'rota_patrimonio', 'audit_log')
          AND column_name <> lower(column_name)
    ) THEN
        RAISE EXCEPTION 'Foi encontrada coluna física fora de lowercase/snake_case';
    END IF;

    IF (SELECT count(*) FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE n.nspname = 'public'
          AND c.contype = 'p'
          AND t.relname IN ('users', 'categoria', 'patrimonio', 'local', 'patrimonio_imagens', 'patrimonio_documentos', 'rota', 'rota_patrimonio', 'audit_log')) <> 9 THEN
        RAISE EXCEPTION 'Quantidade inesperada de PKs';
    END IF;

    IF (SELECT count(*) FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE n.nspname = 'public'
          AND c.contype = 'f'
          AND t.relname IN ('users', 'categoria', 'patrimonio', 'local', 'patrimonio_imagens', 'patrimonio_documentos', 'rota', 'rota_patrimonio', 'audit_log')) <> 9 THEN
        RAISE EXCEPTION 'Quantidade inesperada de FKs';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'patrimonio_imagens_one_capa_per_patrimonio_idx'
          AND indexdef LIKE 'CREATE UNIQUE INDEX%'
          AND indexdef LIKE '%WHERE%'
    ) THEN
        RAISE EXCEPTION 'Índice único parcial de capa não encontrado';
    END IF;
END;
$test$;

INSERT INTO users (id, name, email, password_hash)
VALUES
    ('00000000-0000-0000-0000-000000000001', 'Editor', 'editor@example.test', 'hash'),
    ('00000000-0000-0000-0000-000000000002', 'Auditor removível', 'audit@example.test', 'hash');

SELECT pg_temp.expect_sqlstate(
    $command$INSERT INTO users (id, name, email, password_hash)
        VALUES ('00000000-0000-0000-0000-000000000003', 'Duplicado', 'editor@example.test', 'hash')$command$,
    '23505'
);

INSERT INTO categoria (id, nome, slug)
VALUES ('10000000-0000-0000-0000-000000000001', 'Arquitetônico', 'arquitetonico');

SELECT pg_temp.expect_sqlstate(
    $command$INSERT INTO categoria (id, nome, slug)
        VALUES ('10000000-0000-0000-0000-000000000002', 'Outra', 'arquitetonico')$command$,
    '23505'
);

INSERT INTO patrimonio
    (id, name, slug, descricao, descricao_resumida, categoria_id, created_by)
VALUES
    ('20000000-0000-0000-0000-000000000001', 'Patrimônio 1', 'patrimonio-1', 'Descrição', 'Resumo', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'),
    ('20000000-0000-0000-0000-000000000002', 'Patrimônio 2', 'patrimonio-2', 'Descrição', 'Resumo', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'),
    ('20000000-0000-0000-0000-000000000003', 'Patrimônio 3', 'patrimonio-3', 'Descrição', 'Resumo', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001');

SELECT pg_temp.expect_sqlstate(
    $command$INSERT INTO patrimonio (id, name, slug, descricao, descricao_resumida, categoria_id, created_by)
        VALUES ('20000000-0000-0000-0000-000000000004', 'Duplicado', 'patrimonio-1', 'Descrição', 'Resumo', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001')$command$,
    '23505'
);

INSERT INTO local (id, patrimonio_id, endereco, bairro, latitude, longitude)
VALUES ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Rua A', 'Centro', -23.45, -46.53);

SELECT pg_temp.expect_sqlstate(
    $command$INSERT INTO local (id, patrimonio_id, endereco, bairro)
        VALUES ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Rua B', 'Centro')$command$,
    '23505'
);

SELECT pg_temp.expect_sqlstate(
    $command$INSERT INTO local (id, patrimonio_id, endereco, bairro, latitude)
        VALUES ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'Rua C', 'Centro', -90.0000001)$command$,
    '23514'
);

SELECT pg_temp.expect_sqlstate(
    $command$INSERT INTO local (id, patrimonio_id, endereco, bairro, longitude)
        VALUES ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000003', 'Rua D', 'Centro', 180.0000001)$command$,
    '23514'
);

INSERT INTO patrimonio_imagens (id, patrimonio_id, url, alt, ordem, is_capa)
VALUES ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'https://example.test/1.jpg', 'Imagem 1', 0, true);

SELECT pg_temp.expect_sqlstate(
    $command$INSERT INTO patrimonio_imagens (id, patrimonio_id, url, alt, ordem, is_capa)
        VALUES ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'https://example.test/2.jpg', 'Imagem 2', 1, true)$command$,
    '23505'
);

SELECT pg_temp.expect_sqlstate(
    $command$INSERT INTO patrimonio_imagens (id, patrimonio_id, url, alt, ordem)
        VALUES ('40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'https://example.test/3.jpg', 'Imagem 3', -1)$command$,
    '23514'
);

INSERT INTO patrimonio_documentos (id, patrimonio_id, titulo, url, tipo)
VALUES ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Documento', 'https://example.test/doc.pdf', 'PDF');

SELECT pg_temp.expect_sqlstate(
    $command$INSERT INTO patrimonio_documentos (id, patrimonio_id, titulo, url, tipo)
        VALUES ('50000000-0000-0000-0000-000000000002', '29999999-0000-0000-0000-000000000099', 'Órfão', 'https://example.test/orfao.pdf', 'PDF')$command$,
    '23503'
);

INSERT INTO rota (id, name, slug)
VALUES ('60000000-0000-0000-0000-000000000001', 'Rota 1', 'rota-1');

SELECT pg_temp.expect_sqlstate(
    $command$INSERT INTO rota (id, name, slug)
        VALUES ('60000000-0000-0000-0000-000000000002', 'Rota duplicada', 'rota-1')$command$,
    '23505'
);

INSERT INTO rota_patrimonio (id, rota_id, patrimonio_id, ordem)
VALUES ('70000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 0);

SELECT pg_temp.expect_sqlstate(
    $command$INSERT INTO rota_patrimonio (id, rota_id, patrimonio_id, ordem)
        VALUES ('70000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1)$command$,
    '23505'
);

SELECT pg_temp.expect_sqlstate(
    $command$INSERT INTO rota_patrimonio (id, rota_id, patrimonio_id, ordem)
        VALUES ('70000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 0)$command$,
    '23505'
);

SELECT pg_temp.expect_sqlstate(
    $command$INSERT INTO rota_patrimonio (id, rota_id, patrimonio_id, ordem)
        VALUES ('70000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', -1)$command$,
    '23514'
);

INSERT INTO audit_log (id, user_id, action, entity, entity_id, new_values)
VALUES ('80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'CREATE', 'patrimonio', '20000000-0000-0000-0000-000000000001', '{"status":"RASCUNHO"}'::jsonb);

DELETE FROM users WHERE id = '00000000-0000-0000-0000-000000000002';

DO $test$
BEGIN
    IF (SELECT user_id FROM audit_log WHERE id = '80000000-0000-0000-0000-000000000001') IS NOT NULL THEN
        RAISE EXCEPTION 'ON DELETE SET NULL não preservou o audit_log';
    END IF;
END;
$test$;

SELECT pg_temp.expect_sqlstate(
    $command$DELETE FROM users WHERE id = '00000000-0000-0000-0000-000000000001'$command$,
    '23503'
);

DELETE FROM patrimonio WHERE id = '20000000-0000-0000-0000-000000000001';

DO $test$
BEGIN
    IF EXISTS (SELECT 1 FROM local WHERE patrimonio_id = '20000000-0000-0000-0000-000000000001')
       OR EXISTS (SELECT 1 FROM patrimonio_imagens WHERE patrimonio_id = '20000000-0000-0000-0000-000000000001')
       OR EXISTS (SELECT 1 FROM patrimonio_documentos WHERE patrimonio_id = '20000000-0000-0000-0000-000000000001')
       OR EXISTS (SELECT 1 FROM rota_patrimonio WHERE patrimonio_id = '20000000-0000-0000-0000-000000000001') THEN
        RAISE EXCEPTION 'Cascade de filhos dependentes falhou';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM rota WHERE id = '60000000-0000-0000-0000-000000000001') THEN
        RAISE EXCEPTION 'Excluir patrimônio removeu indevidamente a rota';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM audit_log WHERE id = '80000000-0000-0000-0000-000000000001') THEN
        RAISE EXCEPTION 'Excluir patrimônio removeu indevidamente o audit_log';
    END IF;
END;
$test$;

SELECT 'integrity_tests_passed' AS result;

ROLLBACK;
