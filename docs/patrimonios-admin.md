# Administração de patrimônios

Com o banco e as variáveis de ambiente configurados, execute `npm run dev`.
Abra `http://localhost:3333/api/docs` (ou a porta configurada em `PORT`).
O contrato OpenAPI também está disponível em `/api/docs.json` e pode ser importado no Postman.

1. Execute `POST /api/auth/login` com `email` e `password` de uma conta existente.
2. Copie `data.token` para **Authorize** no Swagger. No Postman, use Authorization → Bearer Token.
3. Use o cadastro existente (`POST /api/admin/patrimonios`) para criar um rascunho e copie seu `id` UUID.
   O `categoriaId` do Swagger é o da categoria Histórico no banco local de demonstração.
   O seed cadastra as categorias, mas cada banco gera seus próprios UUIDs. Se usar outro banco, para ver os IDs,
   execute na raiz do projeto (PowerShell):

   ```powershell
   @'
   import "dotenv/config";
   import prisma from "./src/config/prisma.js";
   try {
       console.log(await prisma.categoria.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } }));
   } finally {
       await prisma.$disconnect();
   }
   '@ | node --input-type=module
   ```
4. Consulte `GET /api/admin/patrimonios`, com ou sem `status=RASCUNHO`, `PUBLICADO` ou `ARQUIVADO`.
   Os filtros `busca`, `categoria` (nome principal ou adicional), `bairro`, `situacao`, `pagina` e `limite` são os mesmos da consulta pública.
   A paginação começa em 1, usa 20 itens por padrão e aceita até 100. A ordenação é por nome e ID.
5. Consulte `GET /api/admin/patrimonios/{id}` para obter dados de edição e mídias em qualquer status.
6. Edite com `PATCH /api/admin/patrimonios/{id}`, por exemplo:

```json
{
  "nome": "Nome atualizado",
  "localizacao": {
    "endereco": "Rua Exemplo",
    "bairro": "Centro",
    "latitude": -23.4628,
    "longitude": -46.5333
  }
}
```

Campos omitidos e slug são preservados. Se a localização já existe, pode enviar somente
`{"localizacao":{"bairro":"Novo bairro"}}`. Se ainda não existe, informe pelo menos
`endereco` e `bairro`; `cidade` e `uf` assumem Guarulhos/SP. O estado final deve conter
ambas as coordenadas ou nenhuma. Corpos vazios, campos desconhecidos, status, autoria,
IDs do patrimônio, slug, datas e mídias são recusados. Categoria inexistente na edição retorna 400.

7. Com ADMIN, execute `PATCH /api/admin/patrimonios/{id}/publicar`, sem corpo ou com `{}`.
   Confira o resultado em `GET /api/patrimonios` e `GET /api/patrimonios/{slug}`.
8. Execute `PATCH /api/admin/patrimonios/{id}/arquivar`. O registro permanece na administração,
   mas deixa a listagem pública e seus detalhes públicos retornam 404. Republicar limpa
   `arquivadoEm` e atualiza `publicadoEm`. Arquivar preserva a publicação anterior e as mídias.
9. Repita publicar/arquivar no status já solicitado: datas e autoria não devem mudar.

EDITOR consulta todos os status, mas edita apenas rascunhos e recebe 403 ao publicar ou arquivar.
ADMIN edita qualquer status e executa as transições. As alterações registram `updatedBy`.
Sem autenticação retorna 401; UUID inválido retorna 400; patrimônio inexistente retorna 404.
O parâmetro `status` não é aceito na consulta pública, que continua restrita a publicados.

## Verificações

`npm test` executa testes de schemas, services, rotas HTTP, permissões e contrato Swagger.
Os testes comuns substituem o Prisma e não verificam persistência nem bloqueios reais.

Para executar também os testes PostgreSQL, prepare um banco **exclusivo de testes**, com nome
iniciado em `test_` ou terminado em `_test`, diferente do banco normal e com migrations aplicadas.
Configure `TEST_DATABASE_URL` para esse banco e `TEST_DATABASE_EXCLUSIVE=1` antes de `npm test`.
Sem essas variáveis, os testes de integração são ignorados explicitamente.
O novo teste de integração verifica persistência, localização, publicação concorrente,
repetição sem novas datas, arquivamento, republicação e visibilidade pública.
