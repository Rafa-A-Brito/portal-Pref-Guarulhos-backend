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
const internal = error("Falha inesperada, inclusive falha de acesso ao banco.", "INTERNAL_ERROR", "Erro interno do servidor.");
const body = (name, example) => ({ required: true, content: { "application/json": { schema: schema(name), example } } });
const bearerAuth = [{ bearerAuth: [] }];

const categoriaId = "11111111-1111-4111-8111-111111111111";
const patrimonioId = "22222222-2222-4222-8222-222222222222";
const usuarioId = "33333333-3333-4333-8333-333333333333";
const imagemId = "44444444-4444-4444-8444-444444444444";
const localId = "55555555-5555-4555-8555-555555555555";
const categoria = { id: categoriaId, nome: "Histórico", slug: "historico" };
const localizacao = { id: localId, patrimonioId, endereco: "Rua Exemplo", numero: "10", complemento: null, bairro: "Centro", cidade: "Guarulhos", uf: "SP", cep: "07010-000", latitude: "-23.4628000", longitude: "-46.5333000" };
const imagem = { id: imagemId, url: "https://example.org/imagem.jpg", titulo: null, textoAlternativo: "Fachada da edificação", principal: true };
const resumo = { id: patrimonioId, nome: "Casa da Cultura Exemplo", slug: "casa-da-cultura-exemplo", descricaoResumida: "Edificação histórica em Guarulhos.", situacao: "PRESERVADO", publicadoEm: "2026-09-01T12:00:00.000Z", categoria, localizacao, imagens: [imagem] };

export const paths = {
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
            tags: ["Patrimônios públicos"], summary: "Lista patrimônios publicados", description: "Retorna apenas status PUBLICADO, ordenados por nome e ID. A busca procura nos campos nome, descrição resumida, descrição, história e importância cultural, sem diferenciar maiúsculas/minúsculas. Categoria e bairro usam correspondência exata, também sem diferenciar maiúsculas/minúsculas.",
            parameters: [
                { in: "query", name: "busca", schema: { type: "string", minLength: 1, maxLength: 200 }, description: "Termo de busca; recebe trim." },
                { in: "query", name: "categoria", schema: { type: "string", minLength: 1, maxLength: 100 }, description: "Nome exato da categoria (não UUID); recebe trim.", example: "Histórico" },
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
            tags: ["Patrimônios públicos"], summary: "Consulta patrimônio publicado pelo slug", description: "O identificador da URL é o slug, não um UUID. Patrimônios não publicados também retornam 404. Rotas relacionadas são incluídas somente quando publicadas.",
            parameters: [{ in: "path", name: "slug", required: true, schema: { type: "string", minLength: 1, maxLength: 220, pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" }, example: "casa-da-cultura-exemplo" }],
            responses: {
                200: response("Detalhes do patrimônio.", "PatrimonioDetalheResponse", { success: true, data: { ...resumo, descricao: "Edificação de interesse cultural.", historia: null, importanciaCultural: null, updatedAt: "2026-09-01T12:00:00.000Z", categoria: { ...categoria, descricao: null }, imagens: [{ ...imagem, credito: null, fonte: null, ordem: 0 }], documentos: [], rotas: [] } }),
                400: badRequest, 404: error("Slug não encontrado ou patrimônio não publicado.", "PATRIMONIO_NOT_FOUND", "Patrimônio não encontrado."), 500: internal,
            },
        },
    },
    "/api/admin/patrimonios": {
        post: {
            tags: ["Patrimônios administrativos"], summary: "Cria um patrimônio em rascunho", description: "Disponível para ADMIN e EDITOR autenticados. Categoria deve existir. O slug é gerado do nome. O status é sempre RASCUNHO, independentemente da situação. Executa uma gravação real no banco configurado.",
            security: bearerAuth,
            requestBody: body("PatrimonioRequest", { nome: "Casa da Cultura Exemplo", descricao: "Edificação de interesse cultural.", descricaoResumida: "Edificação histórica em Guarulhos.", categoriaId, situacao: "PRESERVADO", localizacao: { endereco: "Rua Exemplo", numero: "10", bairro: "Centro", latitude: -23.4628, longitude: -46.5333 } }),
            responses: {
                201: response("Rascunho criado.", "PatrimonioCriadoResponse", { success: true, data: { id: patrimonioId, nome: resumo.nome, slug: resumo.slug, descricao: "Edificação de interesse cultural.", descricaoResumida: resumo.descricaoResumida, historia: null, importanciaCultural: null, situacao: "PRESERVADO", status: "RASCUNHO", categoriaId, createdBy: usuarioId, updatedBy: null, createdAt: "2026-09-01T12:00:00.000Z", updatedAt: "2026-09-01T12:00:00.000Z", publicadoEm: null, arquivadoEm: null, categoria: { ...categoria, descricao: null, createdAt: "2026-08-01T12:00:00.000Z", updatedAt: "2026-08-01T12:00:00.000Z" }, localizacao } }),
                400: badRequest, 401: unauthorized, 403: forbidden,
                404: error("Categoria não encontrada.", "CATEGORIA_NOT_FOUND", "Categoria não encontrada."),
                409: error("Não foi possível obter um slug exclusivo.", "PATRIMONIO_SLUG_CONFLICT", "Já existe um patrimônio com este slug."),
                413: tooLarge, 500: internal,
            },
        },
    },
};
