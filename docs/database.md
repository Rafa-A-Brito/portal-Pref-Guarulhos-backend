# Banco de dados PostgreSQL

## Modelos conceitual, lógico e físico

O modelo conceitual descreve o domínio sem depender de tecnologia: usuários administram o acervo; patrimônios pertencem a categorias, possuem localização, imagens e documentos e podem integrar rotas; alterações podem ser registradas para auditoria.

O modelo lógico transforma esse domínio em entidades, atributos, chaves e cardinalidades. O DER em `fontes/estrutura de dados (schema)` é a referência lógica principal deste projeto.

O modelo físico define como o modelo lógico é implementado no PostgreSQL. Ele está representado por `prisma/schema.prisma` e pelas migrations versionadas em `prisma/migrations`. Nessa camada são definidos tipos PostgreSQL, nulabilidade, defaults, índices, constraints, chaves estrangeiras e regras de exclusão.

## Entidades e relacionamentos

- `categoria` 1:N `patrimonio`: cada patrimônio possui exatamente uma categoria.
- `patrimonio` 1:0..1 `local`: `local.patrimonio_id` é único, impedindo duas localizações para o mesmo patrimônio.
- `patrimonio` 1:N `patrimonio_imagens` e `patrimonio_documentos`.
- `patrimonio` N:N `rota`, resolvido por `rota_patrimonio`.
- `users` 1:N `audit_log`; o lado do usuário é opcional no log para suportar ações do sistema e a preservação do histórico após a exclusão de um usuário.
- `users` também se relaciona com `patrimonio.created_by` e `patrimonio.updated_by`, extensões já existentes para autoria editorial.

## DER e implementação física

| Tabela do DER | Modelo Prisma | Implementação e diferenças justificadas |
| --- | --- | --- |
| `users` | `User` | Todos os campos do DER; `passwordHash`, `isActive`, `createdAt` e `updatedAt` mantêm o contrato camelCase do backend e usam `@map`. |
| `categoria` | `Categoria` | Inclui o `slug` documentado, único. Preserva `created_at` e `updated_at` como extensão técnica. |
| `patrimonio` | `Patrimonio` | Inclui `descricao_resumida` e `importancia_cultural`. O campo Prisma `nome` é mapeado para o `name` do DER; `publicadoEm` é mapeado para `published_at`. |
| `patrimonio_secoes` | `PatrimonioSecao` | Ícone, título, texto e posição editorial por patrimônio. |
| `patrimonio_fatos` | `PatrimonioFato` | Rótulo/valor textuais e posição editorial por patrimônio. |
| `patrimonio_ligacoes` | `PatrimonioLigacao` | Associação dirigida entre dois patrimônios, texto editorial e posição. |
| `local` | `Localizacao` | O nome Prisma existente foi preservado; a tabela física é `local`. Mantém a cardinalidade 1:1 por `UNIQUE (patrimonio_id)`. |
| `patrimonio_imagens` | `PatrimonioImagem` | Inclui `credito` e `fonte`. `textoAlternativo` e `principal` são mapeados para `alt` e `is_capa`. |
| `patrimonio_documentos` | `PatrimonioDocumento` | Inclui `tipo`, `fonte` e `data_documento`; preserva `mime_type` e `created_at`. |
| `rota` | `Rota` | Todos os campos do DER. O campo Prisma `nome` é mapeado para `name`. |
| `rota_patrimonio` | `RotaPatrimonio` | Adota o UUID `id` documentado como PK. O antigo par usado como PK composta foi preservado como `UNIQUE (rota_id, patrimonio_id)`, além de `UNIQUE (rota_id, ordem)`. |
| `audit_log` | `AuditLog` | Nova estrutura com usuário opcional, identificador genérico de entidade, snapshots `JSONB` e timestamp. |

Os nomes dos modelos e propriedades usados pelo JavaScript não foram renomeados. `@map` e `@@map` separam o contrato do Prisma Client da nomenclatura física `snake_case` exigida no PostgreSQL. Os tipos enum físicos também foram mapeados para `role`, `situacao_patrimonio` e `status_publicacao`.

## Campos adicionais preservados

Os campos abaixo não pertencem ao núcleo do DER, mas já faziam parte do schema e foram preservados por utilidade técnica ou por possível uso futuro:

- `categoria.created_at` e `categoria.updated_at`;
- `patrimonio.situacao`, `created_by`, `updated_by` e `arquivado_em`;
- `local.numero`, `complemento`, `cidade`, `uf` e `cep`;
- `patrimonio_imagens.created_at`;
- `patrimonio_documentos.mime_type` e `created_at`.

Não foi removido nenhum enum, campo ou relacionamento preexistente. Os campos `created_by` e `updated_by` registram autoria editorial, enquanto `audit_log` é uma estrutura mais geral para eventos auditáveis; eles não são redundantes.

## Tipos, nulabilidade e defaults

- Identificadores usam `UUID`, com `gen_random_uuid()` como default no PostgreSQL.
- Textos com limite de negócio conhecido usam `VARCHAR(n)`; conteúdo longo e URLs usam `TEXT`.
- `old_values` e `new_values` usam `JSONB`, permitindo snapshots estruturados e consultas nativas do PostgreSQL.
- Coordenadas usam `DECIMAL(10,7)`, evitando perda de precisão binária.
- `data_documento` usa `DATE`, pois representa uma data documental sem horário.
- Instantes técnicos usam `TIMESTAMPTZ(3)`, armazenando um instante independente do fuso com precisão de milissegundos.
- Chaves, relações obrigatórias, nomes essenciais, URLs, slugs, status e campos de autenticação são `NOT NULL`.
- História, importância cultural, metadados de fonte, data do documento, coordenadas, complemento de endereço, atualização por usuário e snapshots de auditoria são opcionais porque podem ser desconhecidos ou inaplicáveis.
- `descricao` é um texto legado opcional; a pesquisa completa fica nas seções. `numero_exibicao` e `ordem_exibicao` são opcionais durante a transição de registros remanescentes.
- `descricao_resumida` é obrigatória por fazer parte do contrato de apresentação esperado pela interface. `tipo` do documento também é obrigatório para permitir classificação consistente.
- Defaults principais: UUID automático; `EDITOR`; usuário ativo; `RASCUNHO`; `NAO_INFORMADO`; `is_capa = false`; `ordem = 0` para imagens; cidade `Guarulhos`; UF `SP`; timestamps de criação e atualização com o instante atual.
- O enum de situação também inclui `DEMOLIDO`, permitindo manter na consulta pública bens perdidos como registros históricos sem classificá-los como situação desconhecida.

`@updatedAt` é aplicado pelo Prisma Client. O default de `updated_at` também permite inserções SQL diretas coerentes, mas qualquer escrita fora do Prisma é responsável por atualizar o valor em alterações posteriores.

## Integridade, unicidade, checks e índices

São únicos:

- `users.email`;
- os slugs de categoria, patrimônio e rota;
- `categoria.nome`, preservando a regra já existente;
- `local.patrimonio_id`, que implementa o lado 1:1;
- `(rota_id, patrimonio_id)`, impedindo repetição do mesmo patrimônio em uma rota;
- `(rota_id, ordem)`, impedindo duas posições iguais na mesma rota;
- `patrimonio.numero_exibicao` e `patrimonio.ordem_exibicao` quando preenchidos;
- `(patrimonio_id, ordem)` em seções e fatos;
- par origem/destino e `(patrimonio_origem_id, ordem)` em ligações;
- `patrimonio_imagens.patrimonio_id` apenas quando `is_capa = true`, por índice único parcial, permitindo no máximo uma capa por patrimônio.

Checks adicionados diretamente à migration, pois não são expressos de forma portável no schema Prisma usado pelo projeto:

- `patrimonio_imagens.ordem >= 0`;
- `rota_patrimonio.ordem >= 0`;
- `local.latitude` nula ou entre `-90` e `90`;
- `local.longitude` nula ou entre `-180` e `180`.
- número de exibição positivo, ordens editoriais não negativas e origem/destino diferentes nas ligações.

Há índices para status, categoria combinada com status, todas as FKs que não são cobertas por uma chave única iniciada pela mesma coluna, consulta de auditoria por entidade/data e ordenação de imagens. Índices `UNIQUE` de e-mail e slugs também servem às respectivas buscas. O índice composto `(categoria_id, status)` atende buscas apenas por categoria por causa da ordem de suas colunas; existe um índice separado para buscas apenas por status.

## Regras `ON DELETE`

| Relação | Regra | Consequência |
| --- | --- | --- |
| `categoria` → `patrimonio` | `RESTRICT` | Uma categoria referenciada não pode ser excluída. O patrimônio deve ser recategorizado ou arquivado antes. |
| `users` → `patrimonio.created_by` / `updated_by` | `RESTRICT` | Preserva a autoria editorial e impede excluir usuários ainda referenciados. Desativar o usuário por `is_active = false` é o fluxo preferido. |
| `patrimonio` → `local`, imagens e documentos | `CASCADE` | Esses filhos não possuem significado útil sem o patrimônio. O status `ARQUIVADO` deve ser preferido à exclusão física; caso a exclusão física seja explicitamente executada, não ficam órfãos. |
| `patrimonio` → seções, fatos e ligações de origem/destino | `CASCADE` | Remove os dependentes editoriais e as ligações recebidas quando um patrimônio é excluído. |
| `rota` / `patrimonio` → `rota_patrimonio` | `CASCADE` | Remove somente a associação dependente quando um dos pais é removido. Não exclui o patrimônio ao excluir uma rota, nem a rota ao excluir um patrimônio. |
| `users` → `audit_log` | `SET NULL` | A exclusão do usuário mantém o histórico; `user_id` torna-se nulo. Logs de ações do sistema já podem nascer sem usuário. |

`RESTRICT` faz a operação de exclusão falhar enquanto houver referências. Isso é intencional para categoria e autoria, coerente com a preservação do acervo histórico. Nenhuma cascade parte de `audit_log`.

## Auditoria

`audit_log` está estruturalmente pronta para receber eventos. `entity_id` é um UUID genérico e não possui FK para outras entidades; a combinação `entity` + `entity_id` identifica logicamente o alvo. `old_values` e `new_values` guardam snapshots opcionais em `JSONB`.

A migration não cria triggers. A seed da pesquisa grava explicitamente snapshots de importação/reconciliação; as demais operações do backend não têm auditoria automática. Portanto, a existência da tabela **não significa auditoria automática**. A equipe ainda deve definir quais ações serão registradas, o formato dos snapshots, a camada da aplicação responsável e a política de retenção. Triggers podem ser avaliadas posteriormente, mas não fazem parte desta entrega.

## Configuração e migrations

Copie `.env.example` para um `.env` local e preencha valores próprios. O arquivo `.env` e credenciais reais não devem ser versionados.

```env
DATABASE_URL=postgresql://usuario:senha@localhost:5432/patrimonio_guarulhos
```

Instalação e validação:

```powershell
npm ci
npm run prisma:format
npm run prisma:validate
npm run prisma:generate
```

Criação de uma nova migration em desenvolvimento e revisão antes de aplicar:

```powershell
npm run prisma:migrate:dev -- --name nome_da_mudanca --create-only
# revise prisma/migrations/<timestamp>_nome_da_mudanca/migration.sql
npm run prisma:migrate:dev
```

Aplicação em outros ambientes e consulta de status:

```powershell
npm run prisma:migrate:deploy
npm run prisma:status
```

A migration inicial está em `prisma/migrations/20260929230000_initial_schema/migration.sql`. Como não havia credencial disponível para a instância instalada durante a geração, ela foi derivada do schema por `prisma migrate diff --from-empty --to-schema` e recebeu manualmente os checks e o índice parcial. Depois, foi aplicada com `prisma migrate deploy` em um cluster PostgreSQL 18 temporário e descartável; `prisma migrate status` confirmou que o schema estava atualizado.

A migration incremental `20260930120000_add_demolido_situacao` adiciona o valor `DEMOLIDO` ao enum físico `situacao_patrimonio`.

Os testes reproduzíveis estão em `prisma/tests/integrity.sql`. Eles executam dentro de uma transação e terminam com `ROLLBACK`, portanto não deixam os registros de teste no banco. O script pressupõe um banco vazio e exclusivo de teste, com migrations aplicadas. Prefira `npm run test:postgres`, que cria esse ambiente isolado; para execução manual nesse ambiente:

```powershell
psql $env:DATABASE_URL -f prisma/tests/integrity.sql
```

O teste cobre criação das tabelas, PKs, FKs, nomes físicos, unicidade de e-mail e slugs, localização 1:1, regras de rota, capa única, limites geográficos, cascades de filhos, `RESTRICT` de autoria e preservação de `audit_log` por `SET NULL`. Nunca use credenciais de produção para criar ou validar migrations.

## Integração futura com o frontend

O mock do frontend utiliza `id`, `nome`, `categoria`, `bairro`, `resumo`, `imagemPrincipal`, `localizacao.{lat,lng}` e arrays editoriais. A API PostgreSQL já oferece os dados, mas a adaptação do frontend permanece uma tarefa futura. O mapeamento é:

- UUID em `patrimonio.id`, número visível em `numero_exibicao`, ordem em `ordem_exibicao` e nome em `patrimonio.name` (`nome` no Prisma);
- categoria em objeto, utilizando `categoria.slug` para os filtros existentes;
- `local.bairro`, `local.latitude` e `local.longitude`;
- `patrimonio.descricao_resumida`;
- a imagem com `is_capa = true`.
- `patrimonio_secoes`, `patrimonio_fatos` e `patrimonio_ligacoes`, com ordens explícitas e consulta de detalhes por slug.

Os nomes físicos do banco não são expostos como contrato HTTP. A seed preserva o conteúdo da pesquisa existente no mock; o frontend precisará adaptar envelope, paginação, campos, navegação por slug e coordenadas. Consulte o contrato completo no documento de população abaixo.

## Pesquisa patrimonial e transição incremental

A migration `20261005230000_add_pesquisa_patrimonios` acrescenta número/ordem editorial nullable e únicos, as tabelas `patrimonio_secoes`, `patrimonio_fatos` e `patrimonio_ligacoes`, seus checks, índices e cascades. Torna apenas `patrimonio.descricao` nullable. Todos os textos legados, UUIDs e relacionamentos anteriores são preservados. Consulte [populacao-patrimonios.md](populacao-patrimonios.md) para o contrato vigente, a única seed ativa, reconciliação, imagens e condições para futuras remoções de colunas.
