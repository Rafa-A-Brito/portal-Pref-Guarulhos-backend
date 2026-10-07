# Dashboard estatístico

Inicie a aplicação com `npm run dev` e consulte com token de um usuário ADMIN ou EDITOR
ativo, obtido pelo login existente:

```powershell
Invoke-RestMethod http://localhost:3333/api/admin/dashboard -Headers @{ Authorization = "Bearer $token" } | ConvertTo-Json -Depth 10
```

Use a porta definida em `PORT` se diferente de 3333. O contrato e os exemplos
estão em `/api/docs` (Swagger UI) e `/api/docs.json`.

O endpoint exige autenticação e role `ADMIN` ou `EDITOR` pelos middlewares existentes.
Ambos os perfis ativos recebem os indicadores. Sem token, com token inválido/expirado
ou conta inativa retorna `401`. A rota anterior `/api/dashboard` foi removida e retorna
`404`, inclusive com token ADMIN.

A resposta segue `{ success: true, data: ... }`. Todas as contagens consideram
o acervo inteiro: `RASCUNHO`, `PUBLICADO` e `ARQUIVADO`. O serviço usa count/groupBy
sem filtro de status e busca apenas ID/nome das categorias utilizadas.
As consultas públicas de patrimônios continuam restritas a `PUBLICADO`.

**Mudança de contrato:** `data.totalPublicados` foi removido e substituído por
`data.totalPatrimonios`, o total geral cadastrado. `data.meta.baseContagem`
agora é `TODOS_OS_STATUS`. O frontend deve atualizar essas referências e usar
esse mesmo total como denominador dos percentuais. Publicar ou arquivar altera
a visibilidade pública, mas não o total geral do dashboard.

As consultas compartilham uma transação `RepeatableRead`. No PostgreSQL, as
leituras usam a fotografia estabelecida na primeira consulta da transação,
incluindo contagens e agrupamentos posteriores. Esse isolamento impede que
cadastros, exclusões ou edições concorrentes misturem fotografias diferentes
nos indicadores. Referência: [isolamento Repeatable Read no PostgreSQL](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-REPEATABLE-READ).

`porCategoria.dados` usa a **categoria principal**; categorias adicionais não
duplicam patrimônios. Os percentuais são números arredondados a duas casas
decimais (JSON pode representar 75.00 como 75). A soma pode diferir ligeiramente
de 100 devido ao arredondamento. A ordem é por nome e ID, com comparação pt-BR.

Os bairros são agrupados após remover espaços nas extremidades e ordenados
por nome. Bairro vazio/nulo e patrimônio sem localização entram em
`Não informado` uma única vez. Esse grupo sintético não soma no total de bairros
reais. Valores já gravados como `Não informado` também entram nesse grupo.
`Localizacao.patrimonioId` é único: a diferença entre o total cadastrado e
a soma de **todos** os grupos de localização representa os sem localização.
`bairro` é obrigatório no schema atual; o caso nulo é tratado defensivamente
e coberto por mock, sem mudar o schema.

Sem patrimônios cadastrados, o endpoint retorna HTTP 200, total zero e listas vazias nos
indicadores implementados. Os indicadores pendentes continuam indisponíveis,
independentemente de haver registros:

| Indicador | Pendência |
| --- | --- |
| `porTombamento` | Não há esfera de tombamento nem relação entre patrimônio e proteção. Modelagem e implementação pendentes. |
| `localizacao.regioes` | Não há região nem associação bairro/região; definição e implementação pendentes. |
| `rotas` | `Rota` e `RotaPatrimonio` já existem; falta definir quais rotas são disponíveis/ativas e implementar o indicador e obtenção dos pontos. |

Todos retornam `disponivel: false`, `motivo` e `dados: null`.
`meta.parcial` é calculado pela presença de pendências (atualmente `true`),
`meta.baseContagem` é `TODOS_OS_STATUS` e `meta.pendencias`
lista esses três indicadores e seus motivos. Nenhum indicador pendente é
substituído por zero.

## Propostas mínimas para revisão

Nenhuma destas propostas foi aplicada ao schema ou às migrations:

- **Tombamento:** adicionar uma relação de proteção com `patrimonioId` (FK para
  `Patrimonio`) e `esfera`, com enum a confirmar, inicialmente municipal,
  estadual e federal. Uma chave composta `(patrimonioId, esfera)` é suficiente
  para a necessidade estatística atual. Se posteriormente forem registrados
  vários atos na mesma esfera, o indicador deverá agrupar por esfera e
  patrimônio antes de contar. O mesmo patrimônio poderá entrar em várias
  esferas. Não inferir proteção de `historia`, `descricao` ou `situacao`.
- **Regiões:** adicionar `Localizacao.regiao` opcional, preenchido a partir de
  uma classificação oficial definida pelo responsável pelo acervo. É a menor
  alteração; um cadastro `Regiao` e FK pode ser adotado depois se for necessária
  uma lista controlada. Não inferir região pelo bairro. O indicador futuro
  deverá usar todos os status, contando somente regiões reais como distintas.
- **Rotas:** decidir explicitamente o que significa disponível/ativa: se basta
  publicação, se a rota precisa conter pontos, quais status de patrimônio podem
  ser pontos, e como tratar pontos sem coordenadas. `Rota.status` hoje representa
  publicação; o filtro das rotas relacionadas no detalhe público do patrimônio
  não estabelece uma regra de atividade. Não existe endpoint de detalhes de rota
  no backend atual. Após essa decisão, os modelos existentes permitem obter
  ID/nome da rota, `RotaPatrimonio.ordem`, ID/nome do patrimônio e latitude/longitude
  opcionais de `Localizacao`. Um futuro endpoint de detalhes pode fornecer os
  pontos ao frontend, evitando duplicar uma lista extensa no dashboard.
  Coordenadas ausentes devem permanecer ausentes; trajetos temporários de
  visitantes não são rotas cadastradas.

Até essas dependências serem resolvidas, o dashboard permanece parcial e não
expõe contagens nem pontos inventados para esses indicadores.

## Testes

```powershell
node --test test/dashboard.test.js test/docs.test.js
npm.cmd test
```

Os testes fornecidos foram adaptados à transação e ao Prisma real da aplicação.
Os mocks são restaurados em `finally`, os casos que alteram o cliente são
sequenciais e o servidor/cliente são encerrados. O arquivo com mocks usa uma
URL exclusiva e inacessível (`127.0.0.1:1/test_dashboard`) somente no processo
isolado de testes; não altera `.env` nem a configuração da aplicação.
Esses testes **não verificam consultas reais**.
Também verificam acesso ADMIN e EDITOR, token ausente/inválido,
conta inativa/inexistente e remoção da rota pública anterior.
As fixtures simuladas abrangem todos os status, alteração de status sem mudança
no total, filtro público preservado, percentuais, normalização de bairros e
contagens sem duplicação. Os testes confirmam a opção `RepeatableRead` solicitada
ao Prisma; mocks não comprovam o isolamento nem o SQL no banco real.

Para validar PostgreSQL, use um banco exclusivo de testes com o schema/migrations
já aplicados, nunca o banco da aplicação ou de produção. Seguindo o padrão
existente, o teste exige nome `test_*` ou `*_test`, URL diferente de
`DATABASE_URL` e confirmação `TEST_DATABASE_EXCLUSIVE=1`:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://usuario:senha@localhost:5432/dashboard_test'
$env:TEST_DATABASE_EXCLUSIVE = '1'
node --test test/dashboard.integration.test.js
```

O teste real cria fixtures publicadas, rascunhos e arquivadas, incluindo
categorias adicionais, bairro vazio e ausência de localização. Consulta a rota
administrativa com tokens ADMIN e EDITOR, verifica inclusão dos três status no
dashboard, publica e arquiva uma fixture sem alterar os indicadores gerais,
confere que a consulta pública continua exibindo somente publicados e remove
somente suas fixtures em `finally`. Sem essa configuração, é marcado como
ignorado, sem conexão nem escrita no banco. Não há alteração de schema ou
migrations nesta entrega.

Para executar toda a suíte com banco real, use
`npm.cmd test -- --test-concurrency=1`, pois os arquivos de integração compartilham
o banco exclusivo e alteram fixtures. Sem `TEST_DATABASE_URL` e
`TEST_DATABASE_EXCLUSIVE=1`, a integração fica ignorada e as consultas reais não
são verificadas.
