const schema = (name) => ({ $ref: `#/components/schemas/${name}` });
const response = (description, name, example) => ({
    description,
    content: { "application/json": { schema: schema(name), ...(example && { example }) } },
});
const error = (description, code, message) => ({
    description,
    content: { "application/json": { schema: schema("Error"), example: { success: false, message, details: [], error: { code, message } } } },
});
const badRequest = error("Dados inválidos (incluindo JSON inválido).", "BAD_REQUEST", "Dados inválidos.");
const unauthorized = error("Token ausente, inválido, expirado ou conta inativa.", "UNAUTHORIZED", "Autenticação necessária.");
const forbidden = error("Papel sem permissão.", "FORBIDDEN", "Você não possui permissão para realizar esta ação.");
const tooLarge = error("Corpo JSON acima de 100 kb.", "INTERNAL_ERROR", "Corpo da requisição muito grande.");
const fileTooLarge = error("Arquivo acima do limite (5 MB para imagens, 10 MB para PDFs).", "FILE_TOO_LARGE", "Arquivo excede o tamanho máximo permitido.");
const unsupportedMedia = error("Formato não suportado ou conteúdo diferente do declarado.", "UNSUPPORTED_MEDIA_TYPE", "O conteúdo do arquivo não corresponde a um formato suportado.");
const internal = error("Falha inesperada, inclusive falha de acesso ao banco.", "INTERNAL_ERROR", "Erro interno do servidor.");
const body = (name, example) => ({ required: true, content: { "application/json": { schema: schema(name), example } } });
const bearerAuth = [{ bearerAuth: [] }];

// ID da categoria Histórico no banco local de demonstração.
const categoriaId = "48aa8522-76c4-459b-b86b-8149a74a54fd";
const patrimonioId = "22222222-2222-4222-8222-222222222222";
const usuarioId = "33333333-3333-4333-8333-333333333333";
const imagemId = "44444444-4444-4444-8444-444444444444";
const localId = "55555555-5555-4555-8555-555555555555";
const categoria = { id: categoriaId, nome: "Histórico", slug: "historico" };
const localizacao = { id: localId, patrimonioId, endereco: "Rua Exemplo", numero: "10", complemento: null, bairro: "Centro", regiao: null, cidade: "Guarulhos", uf: "SP", cep: "07010-000", latitude: "-23.4628000", longitude: "-46.5333000" };
const imagem = { id: imagemId, url: "https://example.org/imagem.jpg", titulo: null, textoAlternativo: "Fachada da edificação", principal: true };
const resumo = { numeroExibicao: 1, ordemExibicao: 0, id: patrimonioId, nome: "Casa da Cultura Exemplo", slug: "casa-da-cultura-exemplo", descricaoResumida: "Edificação histórica em Guarulhos.", situacao: "PRESERVADO", publicadoEm: "2026-09-01T12:00:00.000Z", categoria, categoriasAdicionais: [], localizacao, imagens: [imagem] };

const dashboardVazio = {
    totalPatrimonios: 0, porCategoria: { disponivel: true, dados: [] },
    localizacao: {
        bairros: { disponivel: true, totalBairrosDistintos: 0, distribuicao: [] },
        regioes: { disponivel: true, totalRegioesDistintas: 0, distribuicao: [] },
    },
    meta: { parcial: false, baseContagem: "TODOS_OS_STATUS", pendencias: [] },
};

export const paths = {
    "/api/admin/dashboard": {
        get: {
            tags: ["Dashboard"], summary: "Consulta o dashboard administrativo de todos os patrimônios cadastrados",
            security: bearerAuth,
            description: "Acesso administrativo para ADMIN e EDITOR autenticados e ativos, com token Bearer JWT; sem token, token inválido/expirado ou conta inativa retorna 401. Escopo reduzido: total de patrimônios, distribuição por categoria principal (quantidade e percentual), bairros e regiões. Contagens incluem RASCUNHO, PUBLICADO e ARQUIVADO na mesma transação RepeatableRead. Categorias adicionais não duplicam patrimônios; percentuais arredondados a duas casas. Bairros mantêm trim, agrupamento e ordenação atuais. Regiões retornam código e nome em português, ordenadas por nome em pt-BR, com Não informado ao final; região null e ausência de localização entram uma única vez nesse grupo, excluído do total de regiões distintas. Aeroporto e Parque Estadual da Cantareira são áreas especiais incluídas normalmente. Somente grupos com quantidade positiva; soma regional igual ao total. Banco vazio retorna total zero e listas vazias. Tombamento e rotas foram retirados desta entrega; meta.parcial=false indica conclusão do escopo reduzido, sem afirmar atendimento integral à seção 5.5 original. Consultas públicas permanecem restritas a PUBLICADO.",
            responses: {
                200: {
                    description: "Dashboard do escopo reduzido, inclusive quando não há patrimônios cadastrados.",
                    content: { "application/json": { schema: schema("DashboardResponse"), examples: {
                        vazio: { summary: "Sem patrimônios cadastrados", value: { success: true, data: dashboardVazio } },
                        cadastrados: { summary: "Três patrimônios em qualquer status, incluindo um sem bairro/região", value: { success: true, data: {
                            ...dashboardVazio, totalPatrimonios: 3,
                            porCategoria: { disponivel: true, dados: [
                                { id: categoriaId, nome: "Histórico", quantidade: 2, percentual: 66.67 },
                                { id: "66666666-6666-4666-8666-666666666666", nome: "Religioso", quantidade: 1, percentual: 33.33 },
                            ] },
                            localizacao: { regioes: { disponivel: true, totalRegioesDistintas: 1, distribuicao: [
                                { regiao: "CUMBICA", nome: "Cumbica", quantidade: 2 },
                                { regiao: null, nome: "Não informado", quantidade: 1 },
                            ] }, bairros: {
                                disponivel: true, totalBairrosDistintos: 1,
                                distribuicao: [{ bairro: "Centro", quantidade: 2 }, { bairro: "Não informado", quantidade: 1 }],
                            } },
                        } } },
                    } } },
                },
                401: unauthorized, 403: forbidden, 500: internal,
            },
        },
    },
    "/api": {
        get: {
            tags: ["Sistema"], summary: "Identifica a API", description: "Retorna nome e versão da aplicação.",
            responses: { 200: response("Identificação da API.", "SystemResponse", { success: true, data: { name: "Portal Cultural de Guarulhos API", version: "1.0.0" } }) },
        },
    },
    "/api/health": {
        get: {
            tags: ["Sistema"], summary: "Verifica a resposta da aplicação", description: "Não testa a conexão com o PostgreSQL.",
            responses: { 200: response("Aplicação respondeu.", "HealthResponse", { success: true, data: { status: "ok" } }) },
        },
    },
    "/api/docs": {
        get: { tags: ["Sistema"], summary: "Abre o Swagger UI", description: "Interface HTML pública da documentação. A rota pode redirecionar para /api/docs/ para carregar os recursos da interface.", responses: { 200: { description: "Interface HTML do Swagger UI.", content: { "text/html": { schema: { type: "string" } } } }, 301: { description: "Redirecionamento para /api/docs/." } } },
    },
    "/api/docs.json": {
        get: { tags: ["Sistema"], summary: "Obtém a especificação OpenAPI", responses: { 200: { description: "Documento OpenAPI 3.0.3 em JSON.", content: { "application/json": { schema: { type: "object", description: "Especificação OpenAPI 3.0.3." } } } } } },
    },
    "/api/auth/login": {
        post: {
            tags: ["Autenticação"], summary: "Autentica um usuário", description: "Aceita somente contas ativas. Use o token retornado no botão Authorize para testar rotas protegidas.",
            requestBody: body("LoginRequest", { email: "editor@example.org", password: "SenhaFicticia123!" }),
            responses: {
                200: response("Autenticado.", "LoginResponse", { success: true, data: { token: "eyJ...token-ficticio", user: { id: usuarioId, name: "Pessoa Exemplo", email: "editor@example.org", role: "EDITOR" } } }),
                400: badRequest, 401: error("Credenciais inválidas ou conta inativa.", "UNAUTHORIZED", "E-mail ou senha incorretos."), 413: tooLarge, 500: internal,
            },
        },
    },
    "/api/admins": {
        post: {
            tags: ["Administradores"], summary: "Cria uma conta ADMIN ou EDITOR", description: "Somente ADMIN autenticado. A conta é criada ativa e a senha é armazenada apenas como hash. Executa uma gravação real no banco configurado.",
            security: bearerAuth,
            requestBody: body("AdminRequest", { nome: "Maria Exemplo", email: "maria@example.org", role: "EDITOR", password: "SenhaFicticia123!" }),
            responses: {
                201: response("Conta criada.", "AdminResponse", { success: true, data: { id: usuarioId, nome: "Maria Exemplo", email: "maria@example.org", role: "EDITOR", ativo: true } }),
                400: badRequest, 401: unauthorized, 403: forbidden,
                409: error("E-mail já cadastrado (inclusive conflito simultâneo de unicidade).", "ADMIN_ALREADY_EXISTS", "Já existe um administrador cadastrado com este e-mail."),
                413: tooLarge, 500: internal,
            },
        },
    },
    "/api/patrimonios": {
        get: {
            tags: ["Patrimônios públicos"], summary: "Lista patrimônios publicados", description: "Retorna apenas status PUBLICADO, ordenados por ordemExibicao (nulos por último), nome e ID. A busca procura nos campos nome, descrição resumida, descrição, história e importância cultural legadas, além dos títulos e textos de secoes, sem diferenciar maiúsculas/minúsculas. Categoria e bairro usam correspondência exata, também sem diferenciar maiúsculas/minúsculas.",
            parameters: [
                { in: "query", name: "busca", schema: { type: "string", minLength: 1, maxLength: 200 }, description: "Termo de busca; recebe trim." },
                { in: "query", name: "categoria", schema: { type: "string", minLength: 1, maxLength: 100 }, description: "Nome ou slug exato da categoria principal ou adicional (não UUID); recebe trim. Combinado com busca usando AND.", example: "Histórico" },
                { in: "query", name: "situacao", schema: schema("Situacao"), description: "Situação atual do patrimônio." },
                { in: "query", name: "bairro", schema: { type: "string", minLength: 1, maxLength: 100 }, description: "Nome exato do bairro; recebe trim." },
                { in: "query", name: "pagina", schema: { type: "integer", minimum: 1, default: 1 }, description: "Página, convertida de texto para número." },
                { in: "query", name: "limite", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 }, description: "Itens por página, convertido de texto para número." },
            ],
            responses: {
                200: response("Lista paginada.", "PatrimonioListaResponse", { success: true, data: { itens: [resumo], paginacao: { pagina: 1, limite: 20, total: 1, totalPaginas: 1 } } }),
                400: badRequest, 500: internal,
            },
        },
    },
    "/api/patrimonios/{slug}": {
        get: {
            tags: ["Patrimônios públicos"], summary: "Consulta patrimônio publicado pelo slug", description: "O identificador da URL é o slug, não um UUID. Patrimônios não publicados também retornam 404. Seções, fatos e ligações são ordenados por ordem. Ligações incluem somente destinos publicados. Campos legados permanecem opcionais durante a transição. Rotas relacionadas são incluídas somente quando publicadas.",
            parameters: [{ in: "path", name: "slug", required: true, schema: { type: "string", minLength: 1, maxLength: 220, pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" }, example: "casa-da-cultura-exemplo" }],
            responses: {
                200: response("Detalhes do patrimônio.", "PatrimonioDetalheResponse", { success: true, data: { ...resumo, descricao: "Edificação de interesse cultural.", historia: null, importanciaCultural: null, updatedAt: "2026-09-01T12:00:00.000Z", categoria: { ...categoria, descricao: null }, imagens: [{ ...imagem, credito: null, fonte: null, ordem: 0 }], secoes: [], fatos: [], ligacoes: [], documentos: [], rotas: [] } }),
                400: badRequest, 404: error("Slug não encontrado ou patrimônio não publicado.", "PATRIMONIO_NOT_FOUND", "Patrimônio não encontrado."), 500: internal,
            },
        },
    },
    "/api/admin/patrimonios": {
        post: {
            tags: ["Patrimônios administrativos"], summary: "Cria um patrimônio em rascunho", description: "Disponível para ADMIN e EDITOR autenticados. Categoria e destinos das ligações devem existir. O categoriaId do exemplo pertence à categoria Histórico no banco local de demonstração; em outro banco, substitua o UUID. categoriasAdicionais é opcional, aceita até 6 UUIDs distintos e não pode incluir a categoria principal. Arrays opcionais retornam vazios; ordens são contíguas a partir de zero e destinos não se repetem. Número e ordem do catálogo são opcionais e únicos. descricao, historia e importanciaCultural são legados opcionais ou nulos; a pesquisa completa fica em secoes. O slug é gerado do nome. O status é sempre RASCUNHO, independentemente da situação. Executa uma gravação real no banco configurado.",
            security: bearerAuth,
            requestBody: body("PatrimonioRequest", { nome: "Casa da Cultura Exemplo", descricao: "Edificação de interesse cultural.", descricaoResumida: "Edificação histórica em Guarulhos.", categoriaId, situacao: "PRESERVADO", localizacao: { endereco: "Rua Exemplo", numero: "10", bairro: "Centro", latitude: -23.4628, longitude: -46.5333 } }),
            responses: {
                201: response("Rascunho criado.", "PatrimonioCriadoResponse", { success: true, data: { id: patrimonioId, numeroExibicao: null, ordemExibicao: null, secoes: [], fatos: [], ligacoes: [], nome: resumo.nome, slug: resumo.slug, descricao: "Edificação de interesse cultural.", descricaoResumida: resumo.descricaoResumida, historia: null, importanciaCultural: null, situacao: "PRESERVADO", status: "RASCUNHO", categoriaId, createdBy: usuarioId, updatedBy: null, createdAt: "2026-09-01T12:00:00.000Z", updatedAt: "2026-09-01T12:00:00.000Z", publicadoEm: null, arquivadoEm: null, categoria: { ...categoria, descricao: null, createdAt: "2026-08-01T12:00:00.000Z", updatedAt: "2026-08-01T12:00:00.000Z" }, localizacao } }),
                400: badRequest, 401: unauthorized, 403: forbidden,
                404: error("Categoria ou destino de ligação não encontrado (CATEGORIA_NOT_FOUND / LIGACAO_DESTINO_NOT_FOUND).", "CATEGORIA_NOT_FOUND", "Categoria não encontrada."),
                409: error("Slug, número, ordem ou relação editorial em conflito (PATRIMONIO_SLUG_CONFLICT / PATRIMONIO_EDITORIAL_CONFLICT).", "PATRIMONIO_SLUG_CONFLICT", "Já existe um patrimônio com este slug."),
                413: tooLarge, 500: internal,
            },
        },
    },
};

const idParameter = { in: "path", name: "id", required: true, schema: { type: "string", format: "uuid" }, example: patrimonioId, description: "UUID do patrimônio, tratado como texto." };
const adminResponses = {
    200: response("Dados administrativos com categorias, pesquisa, localização e todas as mídias.", "PatrimonioAdminResponse"),
    400: badRequest, 401: unauthorized, 403: forbidden,
    404: error("Patrimônio inexistente.", "PATRIMONIO_NOT_FOUND", "Patrimônio não encontrado."),
    500: internal,
};
paths["/api/admin/patrimonios"].get = {
    tags: ["Patrimônios administrativos"], summary: "Lista patrimônios de todos os status",
    description: "ADMIN e EDITOR. Reutiliza filtros públicos e ordenação por ordemExibicao (nulos por último), nome e ID. Sem resultados retorna itens vazio. Exemplo: ?status=RASCUNHO&busca=igreja&pagina=1&limite=20.",
    security: bearerAuth,
    parameters: [...paths["/api/patrimonios"].get.parameters, { in: "query", name: "status", schema: schema("StatusPublicacao"), description: "Opcional; omitido retorna todos os status." }],
    responses: { 200: response("Lista administrativa paginada.", "PatrimonioAdminListaResponse"), 400: badRequest, 401: unauthorized, 403: forbidden, 500: internal },
};
paths["/api/admin/patrimonios/{id}"] = {
    get: { tags: ["Patrimônios administrativos"], summary: "Consulta detalhes para edição", description: "ADMIN e EDITOR podem consultar qualquer status, incluindo rascunhos e arquivados.", security: bearerAuth, parameters: [idParameter], responses: adminResponses },
    patch: { tags: ["Patrimônios administrativos"], summary: "Edita parcialmente um patrimônio",
        description: "EDITOR edita somente RASCUNHO; ADMIN edita qualquer status. Preserva campos omitidos e slug, registra updatedBy. Permite substituir categoriasAdicionais por até 6 categorias distintas da principal; envie [] para removê-las. secoes, fatos e ligacoes substituem integralmente o respectivo array quando enviados; [] remove seus itens. Valida ordens contíguas e destinos distintos, existentes e diferentes do próprio patrimônio. Número e ordem do catálogo são opcionais, nulos ou únicos. Recusa corpo vazio, campos desconhecidos, status, autoria, IDs do patrimônio, datas e mídias. Categoria ou destino inexistente retorna 400. Localização é criada ou atualizada em transação, validando as coordenadas finais.",
        security: bearerAuth, parameters: [idParameter], requestBody: body("PatrimonioPatch", { nome: "Novo nome", localizacao: { bairro: "Centro" } }), responses: { ...adminResponses, 409: error("Número, ordem ou relação editorial em conflito.", "PATRIMONIO_EDITORIAL_CONFLICT", "Número, ordem ou relação editorial já utilizada."), 413: tooLarge },
    },
};
paths["/api/auth/senha"] = {
    patch: {
        tags: ["Autenticação"], summary: "Troca a própria senha",
        description: "EDITOR e ADMIN autenticados. Confere a senha atual e altera somente a senha da conta do token. A nova senha deve ser diferente. JWTs já emitidos continuam válidos até expirar, pois a API não possui revogação de tokens. Use o novo valor para o próximo login.",
        security: bearerAuth,
        requestBody: body("ChangePasswordRequest", { senhaAtual: "SenhaAtual123!", novaSenha: "NovaSenhaSegura123!" }),
        responses: {
            200: response("Senha alterada.", "ChangePasswordResponse", { success: true, message: "Senha alterada com sucesso." }),
            400: error("Dados inválidos, senha atual incorreta ou nova senha igual à atual.", "BAD_REQUEST", "Dados inválidos."),
            401: unauthorized, 403: forbidden, 413: tooLarge, 500: internal,
        },
    },
};
for (const [action, summary, description] of [
    ["publicar", "Publica ou republica um patrimônio", "Somente ADMIN. Valida dados do cadastro, publica rascunho ou arquivado, define publicadoEm para a data atual, limpa arquivadoEm e registra updatedBy. Passa a aparecer na consulta pública."],
    ["arquivar", "Arquiva um patrimônio", "Somente ADMIN. Arquiva rascunho ou publicado, define arquivadoEm e updatedBy, preserva publicadoEm e mídias. Deixa de aparecer na listagem e nos detalhes públicos."],
]) {
    paths[`/api/admin/patrimonios/{id}/${action}`] = { patch: {
        tags: ["Patrimônios administrativos"], summary,
        description: `${description} Se já estiver no status solicitado, retorna sucesso sem alterar datas ou autoria. Não existe retorno para rascunho.`,
        security: bearerAuth, parameters: [idParameter], responses: { ...adminResponses, 413: tooLarge },
        requestBody: { required: false, content: { "application/json": { schema: { type: "object", additionalProperties: false }, example: {} } } },
    } };
}

const uploadBody = (name, example) => ({
    required: true,
    content: { "multipart/form-data": { schema: schema(name), example } },
});
const imagemPathParameter = { in: "path", name: "imagemId", required: true, schema: { type: "string", format: "uuid" }, example: imagemId, description: "UUID da imagem, tratado como texto." };
const documentoId = "66666666-6666-4666-8666-666666666666";
const documentoPathParameter = { in: "path", name: "documentoId", required: true, schema: { type: "string", format: "uuid" }, example: documentoId, description: "UUID do documento, tratado como texto." };
const arquivoPathParameters = [
    { in: "path", name: "tipo", required: true, schema: { type: "string", enum: ["imagens", "documentos"] }, example: "imagens" },
    { in: "path", name: "arquivo", required: true, schema: { type: "string", pattern: "^[0-9a-f-]+\\.[a-z0-9]+$" }, example: "9f1c2f7a-6c5b-4a3e-9d10-2b8f0c7e4a11.jpg", description: "Nome gerado pela API." },
];
const arquivoPublicoResponses = {
    200: { description: "Conteúdo binário do arquivo.", content: { "image/jpeg": { schema: { type: "string", format: "binary" } }, "image/png": { schema: { type: "string", format: "binary" } }, "image/webp": { schema: { type: "string", format: "binary" } }, "application/pdf": { schema: { type: "string", format: "binary" } } } },
    400: badRequest,
    401: error("Mídia de patrimônio não publicado sem autenticação válida.", "UNAUTHORIZED", "Mídia disponível apenas para usuários autenticados."),
    404: error("Arquivo ou registro de mídia inexistente.", "NOT_FOUND", "Arquivo não encontrado."),
    500: internal,
};

const listaMidiaDescricao = "Identificadores são UUIDs em texto. O patrimônio é conferido antes do processamento e a permissão é conferida novamente após bloquear sua linha na transação de gravação. A mídia precisa pertencer a ele. EDITOR atua em rascunhos; ADMIN em qualquer status. Metadados textuais recebem trim; ordem, principal e datas são convertidos de texto conforme o schema.";
const exclusaoMidiaDescricao = "Remove o registro e o arquivo gerenciado sem afetar as demais mídias. URLs externas não são movidas nem apagadas; arquivo já ausente é permitido. Arquivos locais passam por quarentena privada antes do DELETE no banco e são apagados somente após confirmar o commit. Se o banco falhar, inclusive na confirmação da transação, tenta restaurar o arquivo e preserva o erro original. Não há atomicidade entre disco e banco. Falhas de restauração ou limpeza geram log com IDs e caminhos para recuperação operacional. Se apenas a limpeza final falhar, o registro já foi excluído: retorna sucesso com arquivoRemovido=false; a pendência deve ser resolvida na quarentena, sem repetir o DELETE.";

paths["/api/admin/patrimonios/{id}/imagens"] = {
    post: {
        tags: ["Mídias administrativas"], summary: "Envia uma imagem e associa ao patrimônio",
        description: `${listaMidiaDescricao} O arquivo vai no campo arquivo e os metadados em multipart/form-data. A url é gerada após salvar o arquivo e o conteúdo real é validado pela assinatura, não pela extensão. Marcar principal desmarca a anterior na mesma transação.`,
        security: bearerAuth, parameters: [idParameter],
        requestBody: uploadBody("ImagemUpload", { textoAlternativo: "Fachada da edificação", ordem: "0", principal: "true" }),
        responses: {
            201: response("Imagem cadastrada.", "ImagemMidiaResponse"),
            400: badRequest, 401: unauthorized, 403: forbidden,
            404: error("Patrimônio inexistente.", "PATRIMONIO_NOT_FOUND", "Patrimônio não encontrado."),
            413: fileTooLarge, 415: unsupportedMedia, 500: internal,
        },
    },
};

paths["/api/admin/patrimonios/{id}/imagens/{imagemId}"] = {
    patch: {
        tags: ["Mídias administrativas"], summary: "Edita metadados de uma imagem",
        description: `${listaMidiaDescricao} Altera apenas metadados; para trocar o arquivo, cadastre o novo e remova o antigo. Recusa corpo vazio, campos desconhecidos e a url. Marcar principal desmarca a anterior na mesma transação.`,
        security: bearerAuth, parameters: [idParameter, imagemPathParameter],
        requestBody: body("ImagemPatch", { titulo: "Fachada reformada", ordem: 1 }),
        responses: {
            200: response("Imagem atualizada.", "ImagemMidiaResponse"),
            400: badRequest, 401: unauthorized, 403: forbidden,
            404: error("Patrimônio ou imagem inexistente, ou imagem de outro patrimônio.", "IMAGEM_NOT_FOUND", "Imagem não encontrada."),
            413: tooLarge, 500: internal,
        },
    },
    delete: {
        tags: ["Mídias administrativas"], summary: "Remove uma imagem do patrimônio",
        description: `${listaMidiaDescricao} ${exclusaoMidiaDescricao}`,
        security: bearerAuth, parameters: [idParameter, imagemPathParameter],
        responses: {
            200: response("Imagem removida.", "ImagemMidiaResponse"),
            400: badRequest, 401: unauthorized, 403: forbidden,
            404: error("Patrimônio ou imagem inexistente, ou imagem de outro patrimônio.", "IMAGEM_NOT_FOUND", "Imagem não encontrada."),
            500: internal,
        },
    },
};

paths["/api/admin/patrimonios/{id}/documentos"] = {
    post: {
        tags: ["Mídias administrativas"], summary: "Envia um documento PDF e associa ao patrimônio",
        description: `${listaMidiaDescricao} O arquivo vai no campo arquivo. titulo e tipo são obrigatórios; a url é gerada e o mimeType é determinado a partir do conteúdo validado (application/pdf).`,
        security: bearerAuth, parameters: [idParameter],
        requestBody: uploadBody("DocumentoUpload", { titulo: "Inventário do imóvel", tipo: "inventario", dataDocumento: "2026-01-02" }),
        responses: {
            201: response("Documento cadastrado.", "DocumentoMidiaResponse"),
            400: badRequest, 401: unauthorized, 403: forbidden,
            404: error("Patrimônio inexistente.", "PATRIMONIO_NOT_FOUND", "Patrimônio não encontrado."),
            413: fileTooLarge, 415: unsupportedMedia, 500: internal,
        },
    },
};

paths["/api/admin/patrimonios/{id}/documentos/{documentoId}"] = {
    patch: {
        tags: ["Mídias administrativas"], summary: "Edita metadados de um documento",
        description: `${listaMidiaDescricao} Altera apenas metadados; para trocar o arquivo, cadastre o novo e remova o antigo. Recusa corpo vazio, campos desconhecidos, a url e o mimeType.`,
        security: bearerAuth, parameters: [idParameter, documentoPathParameter],
        requestBody: body("DocumentoPatch", { titulo: "Inventário revisado", dataDocumento: "2026-02-10" }),
        responses: {
            200: response("Documento atualizado.", "DocumentoMidiaResponse"),
            400: badRequest, 401: unauthorized, 403: forbidden,
            404: error("Patrimônio ou documento inexistente, ou documento de outro patrimônio.", "DOCUMENTO_NOT_FOUND", "Documento não encontrado."),
            413: tooLarge, 500: internal,
        },
    },
    delete: {
        tags: ["Mídias administrativas"], summary: "Remove um documento do patrimônio",
        description: `${listaMidiaDescricao} ${exclusaoMidiaDescricao}`,
        security: bearerAuth, parameters: [idParameter, documentoPathParameter],
        responses: {
            200: response("Documento removido.", "DocumentoMidiaResponse"),
            400: badRequest, 401: unauthorized, 403: forbidden,
            404: error("Patrimônio ou documento inexistente, ou documento de outro patrimônio.", "DOCUMENTO_NOT_FOUND", "Documento não encontrado."),
            500: internal,
        },
    },
};

paths["/api/uploads/{tipo}/{arquivo}"] = {
    get: {
        tags: ["Mídias públicas"], summary: "Entrega uma mídia cadastrada",
        description: "Mídias de patrimônios PUBLICADOS são públicas. Arquivos de rascunhos e arquivados exigem token de ADMIN ou EDITOR. Os arquivos ficam na pasta UPLOAD_ROOT (backup) e a URL nunca expõe caminhos absolutos do servidor. A pasta uploads não é versionada no Git.",
        parameters: arquivoPathParameters,
        responses: arquivoPublicoResponses,
    },
};
