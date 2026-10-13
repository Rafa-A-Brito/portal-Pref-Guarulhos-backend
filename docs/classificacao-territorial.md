# Classificação territorial dos patrimônios

`localizacao.regiao` é opcional e nullable, separado de `bairro`. O backend aceita somente os códigos abaixo ou `null`. Os primeiros 11 códigos representam as UPRs adotadas como referência pelo projeto. Aeroporto e Parque Estadual da Cantareira são áreas especiais incluídas na classificação do portal.

| Código | Rótulo para o frontend |
| --- | --- |
| CENTRO | Centro |
| VILA_GALVAO | Vila Galvão |
| TABOAO | Taboão |
| SAO_JOAO | São João |
| CUMBICA | Cumbica |
| PIMENTAS | Pimentas |
| BONSUCESSO | Bonsucesso |
| CABUCU | Cabuçu |
| TANQUE_GRANDE | Tanque Grande |
| CAPELINHA | Capelinha |
| JAGUARI | Jaguari |
| AEROPORTO | Aeroporto |
| PARQUE_ESTADUAL_CANTAREIRA | Parque Estadual da Cantareira |

“Não informado” é apenas o rótulo de apresentação de `null`, não um valor do enum.

No cadastro (`POST /api/admin/patrimonios`), omitir `regiao` deixa a classificação não informada. No PATCH administrativo (`PATCH /api/admin/patrimonios/{id}`), omitir preserva o valor existente e enviar `null` limpa a classificação. As permissões atuais de ADMIN e EDITOR permanecem. Valores inválidos retornam HTTP 400 no formato de erro existente.

Exemplo de edição apenas da região de uma localização existente:

```json
{ "localizacao": { "regiao": "CUMBICA" } }
```

Para limpar:

```json
{ "localizacao": { "regiao": null } }
```

Se ainda não houver localização, sua criação pelo PATCH continua exigindo `endereco` e `bairro`, além das regras existentes de coordenadas. Região não é requisito para publicação.

As respostas públicas e administrativas que retornam localização incluem o código em `localizacao.regiao`, ou `null` quando desconhecido. Patrimônios sem localização continuam retornando `localizacao: null`. Consultas públicas continuam restritas a publicados; não foram adicionados filtros ou endpoints.

A migration incremental `20261013180000_add_regiao_patrimonio` cria o enum PostgreSQL `regiao_patrimonio` e adiciona a coluna nullable `regiao` à tabela física `local`, sem default ou preenchimento. Registros existentes são preservados. As seeds não atribuem regiões e preservam classificações existentes em reexecuções. Não há inferência por bairro, CEP ou coordenadas.

Para aplicar a migration preparada ao banco desejado, confira `DATABASE_URL` e execute:

```sh
npm run prisma:migrate:deploy
npm run prisma:generate
```
