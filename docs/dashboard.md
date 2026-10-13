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

## Escopo desta entrega

O dashboard apresenta somente total de patrimônios, distribuição por categoria
principal (quantidade e percentual), distribuição por bairro e distribuição por
região. Tombamento e rotas foram retirados desta entrega e não aparecem na
resposta, nem como placeholders ou pendências. Os modelos e funcionalidades de
rotas nas demais partes do projeto permanecem.

`meta` retorna `{ "parcial": false, "baseContagem": "TODOS_OS_STATUS", "pendencias": [] }`.
Isso indica conclusão do **escopo reduzido**, não atendimento integral à seção
5.5 original.

## Regiões

`localizacao.regioes` está sempre disponível e retorna `totalRegioesDistintas`
e `distribuicao`, com `regiao` (código do enum ou `null`), `nome` (rótulo em
português) e `quantidade`. Os [códigos e rótulos territoriais](classificacao-territorial.md)
são compartilhados pelo service e pelo Swagger. São 11 UPRs de referência do
projeto e duas áreas especiais: Aeroporto e Parque Estadual da Cantareira,
incluídas normalmente na distribuição e no total de classificações distintas.

A consulta usa `Localizacao.groupBy` por `regiao` e contagens, sem carregar
patrimônios completos e sem filtro de status, na mesma transação `RepeatableRead`
das demais consultas. `patrimonioId` é único em localização: cada patrimônio é
contado uma vez. A diferença entre `totalPatrimonios` e a soma dos grupos com
região preenchida reúne patrimônios sem localização e com região `null` no único
grupo `{ "regiao": null, "nome": "Não informado", "quantidade": ... }`, sem duplicação.

Somente classificações com patrimônios associados contam em `totalRegioesDistintas`;
“Não informado” fica fora desse total e é apenas um rótulo de `null`.
Os grupos conhecidos são ordenados pelo nome em português (`pt-BR`) e “Não
informado” fica ao final. Não aparecem grupos com quantidade zero. A soma da
distribuição regional é igual a `totalPatrimonios`. Nenhuma região é inferida ou
preenchida automaticamente.

Sem patrimônios, o endpoint retorna HTTP 200, total zero e listas vazias,
inclusive `regioes: { "disponivel": true, "totalRegioesDistintas": 0, "distribuicao": [] }`.
Com patrimônios, mas sem nenhuma classificação preenchida, retorna somente o
grupo “Não informado”, com a quantidade total e `totalRegioesDistintas: 0`.

Exemplo ilustrativo da resposta, com três patrimônios:

```json
{
  "success": true,
  "data": {
    "totalPatrimonios": 3,
    "porCategoria": {
      "disponivel": true,
      "dados": [{ "id": "48aa8522-76c4-459b-b86b-8149a74a54fd", "nome": "Histórico", "quantidade": 3, "percentual": 100 }]
    },
    "localizacao": {
      "bairros": {
        "disponivel": true,
        "totalBairrosDistintos": 1,
        "distribuicao": [{ "bairro": "Centro", "quantidade": 2 }, { "bairro": "Não informado", "quantidade": 1 }]
      },
      "regioes": {
        "disponivel": true,
        "totalRegioesDistintas": 1,
        "distribuicao": [{ "regiao": "CUMBICA", "nome": "Cumbica", "quantidade": 2 }, { "regiao": null, "nome": "Não informado", "quantidade": 1 }]
      }
    },
    "meta": { "parcial": false, "baseContagem": "TODOS_OS_STATUS", "pendencias": [] }
  }
}
```

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
contagens sem duplicação. Regiões cobrem todos os códigos e nomes, áreas especiais,
ordenação pt-BR, região nula, ausência de localização, mistura dos dois casos,
quantidades positivas, soma igual ao total e banco vazio. Também verificam a
remoção de tombamento/rotas, `meta.parcial: false` e pendências vazias, e validam
o contrato OpenAPI e seus exemplos. Os testes confirmam a opção `RepeatableRead` solicitada
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
