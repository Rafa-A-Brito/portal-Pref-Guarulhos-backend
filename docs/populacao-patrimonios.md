# Importação da pesquisa patrimonial

## Escopo e fonte

A única seed configurada no Prisma é `prisma/seed.patrimonios.js`, executada pelo comando existente `npm run prisma:seed`. `prisma/seed.js` foi desativada inclusive para execução direta; seu conteúdo permanece como referência de reconciliação e não constitui uma segunda carga.

`prisma/data/patrimonios.js` contém uma cópia fiel de `portal-PrefGuarulhos/frontend/src/features/mocks/patrimoniosMock.js`. Os imports de imagens foram substituídos pelos nomes dos arquivos independentes hospedados neste backend. Nomes, textos, categorias, CEPs existentes e coordenadas não foram corrigidos nem completados. IDs 9 e 13 permanecem entradas distintas. Ausências de arrays representam zero linhas e não geram textos de preenchimento.

Contagens conferidas contra o mock: 34 patrimônios, 34 localizações, 125 seções associadas, 83 fatos, 27 ligações dirigidas e 34 capas. As cinco seções compartilhadas em JavaScript por 9/13 originam cinco linhas por patrimônio, mantendo suas duas fichas. A ordem principal é `1..27, 32, 33, 28, 29, 30, 31, 34`.

O arquivo registra SHA256 da fonte, do snapshot semântico e de cada imagem. Se o mock estiver no caminho padrão do workspace, a seed compara seus bytes antes de escrever, sem importar/executar o módulo React. `PATRIMONIOS_SOURCE_PATH` pode definir outro caminho; quando explícito, ausência do arquivo é erro. No backend instalado sozinho, a fonte externa pode não existir: a seed usa o snapshot versionado e seus hashes; o teste de comparação com a fonte externa é marcado como não executado. Alteração até mesmo em comentários do mock exige revisão do hash de fonte, sem alteração dos conteúdos para encaixar contagens.

## Modelagem e transição

Migration incremental `20261005230000_add_pesquisa_patrimonios`, sem reescrita das migrations anteriores:

- `patrimonio.numero_exibicao`: inteiro único, positivo, inicialmente nullable. Recebe o ID numérico original.
- `patrimonio.ordem_exibicao`: inteiro único, não negativo, inicialmente nullable. Recebe a posição no array, começando em zero.
- `patrimonio_secoes`: UUID, FK, ícone nullable, título/texto obrigatórios, ordem não negativa, único `(patrimonio_id, ordem)`.
- `patrimonio_fatos`: UUID, FK, rótulo/valor textuais obrigatórios, ordem não negativa, único `(patrimonio_id, ordem)`.
- `patrimonio_ligacoes`: UUID, FKs de origem/destino, texto, ordem não negativa; origem diferente de destino; único par origem/destino e único `(patrimonio_origem_id, ordem)`; índice pelo destino.
- As novas FKs usam `ON DELETE CASCADE`, inclusive ligações recebidas.
- `patrimonio.descricao` passa a nullable. `descricao`, `historia` e `importancia_cultural` permanecem no schema, na API e na busca durante a transição. Nenhuma coluna antiga foi removida.

As seções representam a pesquisa completa; `descricaoResumida` recebe somente `resumo`. Novos registros importados têm os três textos legados nulos. Na reconciliação, textos legados existentes permanecem nas próprias colunas e no snapshot de auditoria: não são convertidos em seções do mock. Descrições de categorias, documentos e rotas não são removidas nem sobrescritas.

Número e ordem só poderão tornar-se obrigatórios em outra migration após atribuição explícita a todos os registros remanescentes. A remoção dos textos legados exige revisão dos registros existentes e comprovação de preservação: esta entrega conserva os campos porque a execução da seed antiga em um banco de destino não é presumida.

UUIDs, slugs, autoria, status, datas de criação/publicação/arquivamento e relações com documentos/rotas são mantidos nas correspondências confirmadas. `updatedAt` registra a alteração na primeira reconciliação, e seu valor anterior fica no snapshot; reexecuções sem mudanças não atualizam timestamps.

Categorias importadas: `arquitetonico`, `natural`, `imaterial`, `demolido`. `documental` é aceita pela validação, mas não possui entrada nesta fonte e não é criada sem uso. Categorias antigas permanecem, com suas descrições. Os cinco `demolido` recebem situação `DEMOLIDO`; os demais recebem `NAO_INFORMADO`. Não há inferência de `PRESERVADO`.

## Configuração das imagens

Os 34 arquivos estão em `public/patrimonios`, copiados sem alteração dos arquivos em `src/assets` da fonte. Isso inclui as cinco imagens sem cópia anterior em `public/uploads`: Lavras, Carbonell, Lago dos Patos, Poço Municipal e Matriz Colonial.

O Express os serve em `GET /arquivos/patrimonios/<arquivo>`. Defina a origem pública deste backend, incluindo prefixo de proxy se necessário:

```env
PATRIMONIOS_PUBLIC_BASE_URL=http://localhost:3333
```

A seed armazena URLs absolutas, por exemplo `http://localhost:3333/arquivos/patrimonios/casa_jose_mauricio.jpg`. A URL deve usar HTTP(S), sem credenciais, query ou fragmento. Os arquivos e seus hashes são verificados antes da transação. O proxy/host informado deve servir a mesma rota; a seed verifica configuração e arquivos, não presume DNS ou disponibilidade remota. Os testes HTTP verificam todas as imagens no servidor local.

Cada capa recebe texto alternativo igual ao nome do registro, sem inventar características visuais, créditos ou fontes. A pesquisa não fornece esses dois metadados: novas imagens os recebem nulos. Uma capa preexistente só é reutilizada se já corresponder à URL correta; nesse caso UUID, título, créditos, fonte, data e outras imagens da galeria são preservados. Capas diferentes bloqueiam antes das escritas e exigem migração específica dos arquivos/associações; nenhuma foto de outro patrimônio é usada como reserva.

## Reconciliação e política de atualização

Toda a carga usa uma transação serializable, com lock de importação e verificação de conflitos antes das escritas. A sequência é usuário técnico desativado/categorias, patrimônios/localizações, seções/fatos, imagens, ligações resolvidas pelos UUIDs. Qualquer falha reverte a carga, inclusive snapshots de auditoria.

O usuário técnico é `seed.patrimonios@localhost.invalid`, EDITOR desativado, com hash de uma senha aleatória não divulgada. A seed recusa uma conta preexistente ativa ou com outro papel em vez de desativar uma conta administrativa automaticamente.

`prisma/data/reconciliacao.js` enumera as 19 entradas da seed antiga. Há 16 correspondências nominais explícitas: somente serão reutilizadas se autoria, slug, nome, textos, categoria, situação, localização e ausência de pesquisa/imagens coincidirem com os valores antigos. Alterações administrativas ou múltiplos candidatos bloqueiam; semelhança aproximada nunca decide identidade.

Três entradas antigas permanecem ambíguas:

| Entrada antiga | Razão |
| --- | --- |
| Igreja de Nossa Senhora de Bonsucesso e Núcleo Histórico | Registro composto, enquanto o mock possui ficha da igreja. |
| Locomotiva "Maria Fumaça" (Nº 33), Vagão e Caixa D'Água | O mock não inclui a caixa d'água na mesma ficha. |
| Estação Ferroviária Central de Guarulhos | O relato antigo descreve demolição; a fonte atual apresenta a estação existente. |

Se estiverem no banco, a seed bloqueia e informa a pendência, antes de criar possíveis duplicatas. A sua ausência não bloqueia uma primeira carga em banco vazio.

Faça a leitura do planejamento:

```powershell
npm run prisma:seed -- --dry-run
```

O relatório contém conflitos, contagens e registros existentes com UUID/slug/hash. Não inclui credenciais ou hashes de senha. Registros não relacionados permanecem intactos. Colisões de categoria, slug, número ou ordem também impedem a carga.

Para uma correspondência decidida explicitamente após revisão, forneça um JSON local (não reutilize valores ilustrativos):

```json
[
  {
    "patrimonioId": "UUID-existente-obtido-no-dry-run",
    "numeroExibicao": 1,
    "expectedHash": "SHA256-do-registro-obtido-no-dry-run"
  }
]
```

```powershell
npm run prisma:seed -- --dry-run --reconcile=C:/caminho/reconciliacao.json
npm run prisma:seed -- --reconcile=C:/caminho/reconciliacao.json
```

O hash verifica o estado integral do registro e relações lidos pelo planejamento. Se houver mudança após a revisão, o arquivo fica inválido. A aprovação associa um único UUID a um único número; não permite reassociar uma identidade já numerada. O snapshot anterior fica em `audit_log` com ação `RECONCILE_PATRIMONIO_LEGACY`.

Na primeira reconciliação, os campos que podem ser atualizados são nome, resumo, categoria, situação, número/ordem editorial, localização e os arrays editoriais aprovados. Textos legados, slug, autoria, status, publicação, arquivamento, documentos e rotas não são sobrescritos. A localização anterior e quaisquer dependentes editoriais substituídos também ficam no snapshot integral.

Cada primeira importação registra ação `IMPORT_PATRIMONIOS_MOCK`, com baseline dos campos gerenciados. Depois, o número identifica a entrada. Reexecuções são de validação: não regravam registros, não substituem arrays nem duplicam capas; preservam UUIDs dos pais e filhos, slugs e datas. Divergência de pesquisa, slug, posição, situação, localização ou imagem em relação ao baseline bloqueia toda a execução, sem apagar a edição posterior. Mudança na fonte/configuração de URL também requer revisão explícita; não existe opção de força. Alteração somente de status, publicação, arquivamento, autoria ou textos legados não é revertida. Exclusão de uma entrada já importada é detectada pelo histórico e não a recria automaticamente.

Novos registros são sempre `RASCUNHO`, com datas de publicação/arquivamento nulas. A seed não publica, desarquiva nem cria contas administrativas ativas.

## Contrato da API e integração futura

Permanecem `GET /api/patrimonios`, `GET /api/patrimonios/:slug` e o envelope `{ success: true, data: ... }`. A lista conserva `data.itens` e `data.paginacao`, página padrão 1, limite padrão 20 e máximo 100.

- Lista: inclui `numeroExibicao`/`ordemExibicao`, ambos inteiros ou null durante a transição. Ordena por ordem editorial, valores null por último, depois nome e UUID como desempate.
- Busca: inclui títulos/textos de `secoes`, além dos campos básicos e textos legados ainda presentes, sem distinguir caixa. O filtro `categoria` aceita nome ou slug exato, preservando os consumidores anteriores por nome.
- Detalhe: acrescenta `secoes: [{ id, icone, titulo, texto, ordem }]`, `fatos: [{ id, rotulo, valor, ordem }]` e `ligacoes: [{ id, patrimonioDestinoId, texto, ordem, destino: { id, nome, slug, numeroExibicao } }]`, ordenados por ordem. Arrays sem linhas retornam `[]`.
- Publicação: somente patrimônios PUBLICADO aparecem. Ligações públicas só expõem destinos PUBLICADO; as 27 associações completas permanecem armazenadas, mesmo quando algum destino está em rascunho/arquivado. Rotas culturais continuam separadas e obedecem à publicação própria.
- `descricao` pode ser null. Os campos legados continuam retornando seu conteúdo existente, sem recomposição a partir das seções.
- Localização continua usando `latitude`/`longitude` Decimal serializados como strings, e `categoria` permanece objeto com UUID/nome/slug. Imagens continuam em `imagens`, com a capa marcada por `principal`.
- Cadastro protegido: aceita campos novos e arrays ordenados; `descricao` deixa de ser obrigatória, resumo permanece obrigatório. Cada array precisa ter posições únicas/contíguas desde zero e as ligações devem ter destinos UUID existentes e distintos. A criação atômica mantém autoria autenticada e RASCUNHO.

O frontend **não foi integrado**. Posteriormente precisará consumir o envelope e todas as páginas necessárias; consultar detalhes pelo slug; separar UUID de número visível; usar `categoria.slug`, mapear `descricaoResumida`/`secoes`, converter coordenadas para número e obter a capa em `imagens`. Ligações devem navegar pelo slug do destino, não pelo UUID/número antigo. A lista não carrega toda a pesquisa; a ficha consulta o endpoint de detalhes. A seed em RASCUNHO não torna os 34 registros imediatamente públicos.

## Aplicação em desenvolvimento

Confirme que `DATABASE_URL` aponta para o banco de desenvolvimento pretendido, preencha `PATRIMONIOS_PUBLIC_BASE_URL` e execute a partir deste backend:

```powershell
npm ci
npm run prisma:validate
npm run prisma:generate
npm run prisma:migrate:deploy
npm run prisma:seed -- --dry-run
# Revise os conflitos e, se necessário, forneça a reconciliação explícita.
npm run prisma:seed
npm run prisma:seed -- --dry-run
```

Não execute `migrate reset` para resolver conflitos de dados existentes. A carga não foi executada no banco principal do workspace nesta tarefa.

## Verificações reproduzíveis

```powershell
npm test
npm run test:postgres
```

`test:postgres` cria um container `postgres:17` exclusivamente de teste, com senha aleatória, porta aleatória limitada a 127.0.0.1 e sem volume persistente. Aplica todas as migrations, executa os testes com banco exclusivo e remove o container/dados no final. Não usa a conexão do `.env` como destino de teste.

Os testes abrangem fidelidade ao mock, hashes e acessibilidade das 34 imagens, primeira/segunda carga, UUIDs/slugs/datas, arrays/ordem/CEP/decimais, publicação, busca em seções, cadastro, capa única, checks/FKs/cascades/regras de autoria, rollback, correspondências antigas, hashes de aprovação e bloqueio de edições posteriores. `prisma/tests/integrity.sql` continua validando as constraints anteriores dentro de uma transação com ROLLBACK.

Na verificação desta implementação, `prisma validate` e `prisma generate` passaram. `npm run test:postgres` aplicou as três migrations em PostgreSQL 17 descartável, confirmou `migrate status` atualizado e terminou com 40 testes aprovados, sem falhas ou testes ignorados. Incluiu a execução do comando configurado `prisma db seed`, a migration incremental sobre um registro anterior, as 16 correspondências legadas e os cenários de conflito. O container e seus dados foram removidos ao final. Nenhuma carga foi aplicada à instância principal do projeto.

O teste SQL legado passou a esperar `23503` para a violação de FK ao excluir o autor referenciado, que é o SQLSTATE efetivamente retornado pelo PostgreSQL; essa correção altera somente a expectativa do teste, preservando a constraint `RESTRICT` das migrations antigas.
