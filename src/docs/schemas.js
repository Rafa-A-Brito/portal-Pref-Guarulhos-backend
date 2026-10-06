const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const string = (description, extra = {}) => ({ type: "string", description, ...extra });
const nullable = (schema) => ({ ...schema, nullable: true });

export const schemas = {
    SystemResponse: { type: "object", required: ["success", "data"], properties: { success: { type: "boolean", enum: [true] }, data: { type: "object", required: ["name", "version"], properties: { name: { type: "string" }, version: { type: "string" } } } } },
    HealthResponse: { type: "object", required: ["success", "data"], properties: { success: { type: "boolean", enum: [true] }, data: { type: "object", required: ["status"], properties: { status: { type: "string", enum: ["ok"] } } } } },
    Role: { type: "string", enum: ["ADMIN", "EDITOR"] },
    Situacao: { type: "string", enum: ["PRESERVADO", "EM_RESTAURACAO", "NECESSITA_RESTAURACAO", "EM_RUINAS", "DEMOLIDO", "NAO_INFORMADO"] },
    StatusPublicacao: { type: "string", enum: ["RASCUNHO", "PUBLICADO", "ARQUIVADO"] },
    Error: {
        type: "object", required: ["success", "message", "details", "error"],
        properties: {
            success: { type: "boolean", enum: [false] },
            message: { type: "string" },
            details: { type: "array", items: { type: "object", required: ["field", "message"], properties: { field: { type: "string" }, message: { type: "string" } } } },
            error: { type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" } } },
        },
    },
    LoginRequest: {
        type: "object", additionalProperties: false, required: ["email", "password"],
        properties: {
            email: string("E-mail normalizado com trim e letras minúsculas.", { format: "email", maxLength: 254, example: "editor@example.org" }),
            password: string("Senha sem trim; de 1 a 72 bytes em UTF-8.", { writeOnly: true, minLength: 1, example: "SenhaFicticia123!" }),
        },
    },
    LoginUser: {
        type: "object", required: ["id", "name", "email", "role"],
        properties: { id: string("UUID", { format: "uuid" }), name: { type: "string" }, email: string("E-mail", { format: "email" }), role: ref("Role") },
    },
    LoginResponse: {
        type: "object", required: ["success", "data"],
        properties: { success: { type: "boolean", enum: [true] }, data: { type: "object", required: ["token", "user"], properties: { token: string("JWT para usar em Authorize.", { example: "eyJ...token-ficticio" }), user: ref("LoginUser") } } },
    },
    AdminRequest: {
        type: "object", additionalProperties: false, required: ["nome", "email", "role", "password"],
        properties: {
            nome: string("Nome com trim.", { minLength: 1, maxLength: 100, example: "Maria Exemplo" }),
            email: string("E-mail com trim e letras minúsculas.", { format: "email", maxLength: 254, example: "maria@example.org" }),
            role: ref("Role"),
            password: string("Mínimo de 12 caracteres Unicode e máximo de 72 bytes em UTF-8. Não é transformada.", { writeOnly: true, minLength: 12, example: "SenhaFicticia123!" }),
        },
    },
    Admin: {
        type: "object", required: ["id", "nome", "email", "role", "ativo"],
        properties: { id: string("UUID", { format: "uuid" }), nome: { type: "string" }, email: string("E-mail", { format: "email" }), role: ref("Role"), ativo: { type: "boolean", enum: [true] } },
    },
    AdminResponse: { type: "object", required: ["success", "data"], properties: { success: { type: "boolean", enum: [true] }, data: ref("Admin") } },
    LocalizacaoRequest: {
        type: "object", additionalProperties: false, required: ["endereco", "bairro"],
        description: "Latitude e longitude devem ser informadas juntas ou ambas omitidas. Textos recebem trim.",
        properties: {
            endereco: string("Endereço", { minLength: 1, maxLength: 250, example: "Rua Exemplo" }),
            numero: string("Número", { minLength: 1, maxLength: 30, example: "10" }),
            complemento: string("Complemento", { minLength: 1, maxLength: 150 }),
            bairro: string("Bairro", { minLength: 1, maxLength: 100, example: "Centro" }),
            cidade: string("Cidade", { minLength: 1, maxLength: 100, default: "Guarulhos" }),
            uf: string("UF convertida para maiúsculas.", { minLength: 2, maxLength: 2, default: "SP" }),
            cep: string("Aceita 12345678 ou 12345-678; retorna com hífen.", { pattern: "^[0-9]{5}-?[0-9]{3}$", example: "07010-000" }),
            latitude: { type: "number", minimum: -90, maximum: 90, example: -23.4628 },
            longitude: { type: "number", minimum: -180, maximum: 180, example: -46.5333 },
        },
    },
    PatrimonioRequest: {
        type: "object", additionalProperties: false, required: ["nome", "descricao", "descricaoResumida", "categoriaId"],
        properties: {
            nome: string("Nome com trim.", { minLength: 1, maxLength: 200, example: "Casa da Cultura Exemplo" }),
            descricao: string("Descrição com trim.", { minLength: 1, example: "Edificação de interesse cultural." }),
            descricaoResumida: string("Resumo com trim.", { minLength: 1, maxLength: 500, example: "Edificação histórica em Guarulhos." }),
            categoriaId: string("UUID da categoria Histórico no banco local de demonstração. Em outro banco, consulte a tabela categoria e substitua o valor.", { format: "uuid", example: "48aa8522-76c4-459b-b86b-8149a74a54fd" }),
            categoriasAdicionais: { type: "array", maxItems: 6, uniqueItems: true, description: "UUIDs de categorias adicionais existentes, sem repetir a categoria principal.", items: { type: "string", format: "uuid" } },
            historia: string("História com trim.", { minLength: 1 }),
            importanciaCultural: string("Importância cultural com trim.", { minLength: 1 }),
            situacao: { ...ref("Situacao"), default: "NAO_INFORMADO" },
            localizacao: ref("LocalizacaoRequest"),
        },
    },
    Localizacao: {
        type: "object", required: ["id", "patrimonioId", "endereco", "numero", "complemento", "bairro", "cidade", "uf", "cep", "latitude", "longitude"],
        properties: {
            id: string("UUID", { format: "uuid" }), patrimonioId: string("UUID", { format: "uuid" }), endereco: { type: "string" },
            numero: nullable({ type: "string" }), complemento: nullable({ type: "string" }), bairro: { type: "string" }, cidade: { type: "string" }, uf: { type: "string" },
            cep: nullable({ type: "string" }), latitude: nullable(string("Decimal serializado como string.", { example: "-23.4628000" })),
            longitude: nullable(string("Decimal serializado como string.", { example: "-46.5333000" })),
        },
    },
    CategoriaResumo: { type: "object", required: ["id", "nome", "slug"], properties: { id: string("UUID", { format: "uuid" }), nome: { type: "string" }, slug: { type: "string" } } },
    CategoriaDetalhe: { type: "object", required: ["id", "nome", "slug", "descricao"], properties: { id: string("UUID", { format: "uuid" }), nome: { type: "string" }, slug: { type: "string" }, descricao: nullable({ type: "string" }) } },
    CategoriaCompleta: { type: "object", required: ["id", "nome", "slug", "descricao", "createdAt", "updatedAt"], properties: { id: string("UUID", { format: "uuid" }), nome: { type: "string" }, slug: { type: "string" }, descricao: nullable({ type: "string" }), createdAt: string("Data ISO 8601", { format: "date-time" }), updatedAt: string("Data ISO 8601", { format: "date-time" }) } },
    ImagemResumo: { type: "object", required: ["id", "url", "titulo", "textoAlternativo", "principal"], properties: { id: string("UUID", { format: "uuid" }), url: { type: "string" }, titulo: nullable({ type: "string" }), textoAlternativo: { type: "string" }, principal: { type: "boolean" } } },
    ImagemDetalhe: { allOf: [ref("ImagemResumo"), { type: "object", required: ["credito", "fonte", "ordem"], properties: { credito: nullable({ type: "string" }), fonte: nullable({ type: "string" }), ordem: { type: "integer" } } }] },
    Documento: { type: "object", required: ["id", "titulo", "descricao", "url", "tipo", "fonte", "dataDocumento", "mimeType"], properties: { id: string("UUID", { format: "uuid" }), titulo: { type: "string" }, descricao: nullable({ type: "string" }), url: { type: "string" }, tipo: { type: "string" }, fonte: nullable({ type: "string" }), dataDocumento: nullable(string("Campo de data do banco serializado pelo Prisma como ISO 8601.", { format: "date-time" })), mimeType: nullable({ type: "string" }) } },
    RotaResumo: { type: "object", required: ["id", "nome", "slug", "descricao"], properties: { id: string("UUID", { format: "uuid" }), nome: { type: "string" }, slug: { type: "string" }, descricao: nullable({ type: "string" }) } },
    RotaPatrimonio: { type: "object", required: ["ordem", "rota"], properties: { ordem: { type: "integer" }, rota: ref("RotaResumo") } },
    PatrimonioResumo: { type: "object", required: ["id", "nome", "slug", "descricaoResumida", "situacao", "publicadoEm", "categoria", "localizacao", "imagens"], properties: { id: string("UUID", { format: "uuid" }), nome: { type: "string" }, slug: { type: "string" }, descricaoResumida: { type: "string" }, situacao: ref("Situacao"), publicadoEm: nullable(string("Data ISO 8601", { format: "date-time" })), categoria: ref("CategoriaResumo"), localizacao: nullable({ type: "object", allOf: [ref("Localizacao")] }), imagens: { type: "array", maxItems: 1, items: ref("ImagemResumo") } } },
    PatrimonioDetalhe: { type: "object", required: ["id", "nome", "slug", "descricao", "descricaoResumida", "historia", "importanciaCultural", "situacao", "publicadoEm", "updatedAt", "categoria", "localizacao", "imagens", "documentos", "rotas"], properties: { id: string("UUID", { format: "uuid" }), nome: { type: "string" }, slug: { type: "string" }, descricao: { type: "string" }, descricaoResumida: { type: "string" }, historia: nullable({ type: "string" }), importanciaCultural: nullable({ type: "string" }), situacao: ref("Situacao"), publicadoEm: nullable(string("Data ISO 8601", { format: "date-time" })), updatedAt: string("Data ISO 8601", { format: "date-time" }), categoria: ref("CategoriaDetalhe"), localizacao: nullable({ type: "object", allOf: [ref("Localizacao")] }), imagens: { type: "array", items: ref("ImagemDetalhe") }, documentos: { type: "array", items: ref("Documento") }, rotas: { type: "array", description: "Somente rotas publicadas.", items: ref("RotaPatrimonio") } } },
    Paginacao: { type: "object", required: ["pagina", "limite", "total", "totalPaginas"], properties: { pagina: { type: "integer", minimum: 1 }, limite: { type: "integer", minimum: 1, maximum: 100 }, total: { type: "integer", minimum: 0 }, totalPaginas: { type: "integer", minimum: 0 } } },
    PatrimonioListaResponse: { type: "object", required: ["success", "data"], properties: { success: { type: "boolean", enum: [true] }, data: { type: "object", required: ["itens", "paginacao"], properties: { itens: { type: "array", items: ref("PatrimonioResumo") }, paginacao: ref("Paginacao") } } } },
    PatrimonioDetalheResponse: { type: "object", required: ["success", "data"], properties: { success: { type: "boolean", enum: [true] }, data: ref("PatrimonioDetalhe") } },
    PatrimonioCriado: { type: "object", required: ["id", "nome", "slug", "descricao", "descricaoResumida", "historia", "importanciaCultural", "situacao", "status", "categoriaId", "createdBy", "updatedBy", "createdAt", "updatedAt", "publicadoEm", "arquivadoEm", "categoria", "localizacao"], properties: { id: string("UUID", { format: "uuid" }), nome: { type: "string" }, slug: { type: "string" }, descricao: { type: "string" }, descricaoResumida: { type: "string" }, historia: nullable({ type: "string" }), importanciaCultural: nullable({ type: "string" }), situacao: ref("Situacao"), status: { type: "string", enum: ["RASCUNHO"] }, categoriaId: string("UUID", { format: "uuid" }), createdBy: string("UUID do usuário autenticado.", { format: "uuid" }), updatedBy: nullable(string("UUID", { format: "uuid" })), createdAt: string("Data ISO 8601", { format: "date-time" }), updatedAt: string("Data ISO 8601", { format: "date-time" }), publicadoEm: nullable(string("Data ISO 8601", { format: "date-time" })), arquivadoEm: nullable(string("Data ISO 8601", { format: "date-time" })), categoria: ref("CategoriaCompleta"), localizacao: nullable({ type: "object", allOf: [ref("Localizacao")] }) } },
    PatrimonioCriadoResponse: { type: "object", required: ["success", "data"], properties: { success: { type: "boolean", enum: [true] }, data: ref("PatrimonioCriado") } },
};

schemas.LocalizacaoPatch = {
    ...schemas.LocalizacaoRequest,
    required: undefined, minProperties: 1,
    description: "Atualização parcial. Campos omitidos são preservados. Ao criar, endereco e bairro são obrigatórios; cidade/uf assumem Guarulhos/SP. O estado final deve ter ambas as coordenadas ou nenhuma.",
    properties: { ...schemas.LocalizacaoRequest.properties,
        cidade: { ...schemas.LocalizacaoRequest.properties.cidade, default: undefined },
        uf: { ...schemas.LocalizacaoRequest.properties.uf, default: undefined },
    },
};
schemas.ChangePasswordRequest = {
    type: "object", additionalProperties: false, required: ["senhaAtual", "novaSenha"],
    properties: {
        senhaAtual: string("Senha atual sem trim ou outras transformações; de 1 a 72 bytes em UTF-8.", { writeOnly: true, minLength: 1, example: "SenhaAtual123!" }),
        novaSenha: string("Mesmas regras do cadastro: pelo menos 12 caracteres Unicode e no máximo 72 bytes em UTF-8. Espaços são preservados.", { writeOnly: true, minLength: 12, example: "NovaSenhaSegura123!" }),
    },
};
schemas.ChangePasswordResponse = {
    type: "object", required: ["success", "message"],
    properties: { success: { type: "boolean", enum: [true] }, message: { type: "string", example: "Senha alterada com sucesso." } },
};
schemas.PatrimonioPatch = {
    ...schemas.PatrimonioRequest, required: undefined, minProperties: 1,
    properties: { ...schemas.PatrimonioRequest.properties, situacao: ref("Situacao"), localizacao: ref("LocalizacaoPatch") },
};
schemas.PatrimonioAdminResumo = {
    ...schemas.PatrimonioResumo,
    required: [...schemas.PatrimonioResumo.required, "status", "arquivadoEm"],
    properties: { ...schemas.PatrimonioResumo.properties, status: ref("StatusPublicacao"), arquivadoEm: nullable(string("Data ISO 8601", { format: "date-time" })) },
};
schemas.PatrimonioAdmin = {
    ...schemas.PatrimonioCriado,
    required: [...schemas.PatrimonioCriado.required, "imagens", "documentos"],
    properties: { ...schemas.PatrimonioCriado.properties, status: ref("StatusPublicacao"),
        imagens: { type: "array", items: { allOf: [ref("ImagemDetalhe"), { type: "object", properties: { patrimonioId: string("UUID", { format: "uuid" }), createdAt: string("Data ISO 8601", { format: "date-time" }) } }] } },
        documentos: { type: "array", items: { allOf: [ref("Documento"), { type: "object", properties: { patrimonioId: string("UUID", { format: "uuid" }), createdAt: string("Data ISO 8601", { format: "date-time" }) } }] } },
    },
};
schemas.PatrimonioAdminResponse = { ...schemas.PatrimonioCriadoResponse, properties: { success: { type: "boolean", enum: [true] }, data: ref("PatrimonioAdmin") } };
schemas.PatrimonioAdminListaResponse = {
    ...schemas.PatrimonioListaResponse,
    properties: { success: { type: "boolean", enum: [true] }, data: {
        ...schemas.PatrimonioListaResponse.properties.data,
        properties: { itens: { type: "array", items: ref("PatrimonioAdminResumo") }, paginacao: ref("Paginacao") },
    } },
};

for (const name of ["PatrimonioResumo", "PatrimonioDetalhe", "PatrimonioCriado", "PatrimonioAdminResumo", "PatrimonioAdmin"]) {
    schemas[name].properties.categoriasAdicionais = { type: "array", items: ref("CategoriaResumo") };
    schemas[name].required.push("categoriasAdicionais");
}
