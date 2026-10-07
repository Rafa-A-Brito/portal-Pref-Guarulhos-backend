import { Prisma, SituacaoPatrimonio, StatusPublicacao } from "@prisma/client";
import prisma from "../config/prisma.js";
import ConflictError from "../errors/ConflictError.js";
import NotFoundError from "../errors/NotFoundError.js";
import BadRequestError from "../errors/BadRequestError.js";
import ForbiddenError from "../errors/ForbiddenError.js";
import { createPatrimonioSchema, localizacaoSchema } from "../schemas/patrimonioSchema.js";
import { slugify } from "../utils/slug.js";

const MAX_SLUG_ATTEMPTS = 1000;

function rethrowPatrimonioError(error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const target = Array.isArray(error.meta?.target)
            ? error.meta.target.join(",")
            : String(error.meta?.target ?? "");
        const conflict = new ConflictError(target.includes("slug")
            ? "Já existe um patrimônio com este slug."
            : "Número, ordem ou relação editorial já utilizada.");
        conflict.code = target.includes("slug") ? "PATRIMONIO_SLUG_CONFLICT" : "PATRIMONIO_EDITORIAL_CONFLICT";
        throw conflict;
    }
    throw error;
}

const categoriaResumoSelect = { id: true, nome: true, slug: true };

// O Prisma devolve [{ categoria: {...} }]; achatamos para [{...}] antes de responder.
const categoriasAdicionaisSelect = {
    orderBy: { categoria: { nome: "asc" } },
    select: { categoria: { select: categoriaResumoSelect } },
};

function achatarCategorias(patrimonio) {
    const { categoriasAdicionais, ...resto } = patrimonio;
    return {
        ...resto,
        categoriasAdicionais: (categoriasAdicionais ?? []).map((item) => item.categoria),
    };
}

const publicListSelect = {
    id: true,
    nome: true,
    slug: true,
    numeroExibicao: true,
    ordemExibicao: true,
    descricaoResumida: true,
    situacao: true,
    publicadoEm: true,
    categoria: { select: categoriaResumoSelect },
    categoriasAdicionais: categoriasAdicionaisSelect,
    localizacao: true,
    imagens: {
        orderBy: [{ principal: "desc" }, { ordem: "asc" }],
        take: 1,
        select: {
            id: true,
            url: true,
            titulo: true,
            textoAlternativo: true,
            principal: true,
        },
    },
};

const publicDetailSelect = {
    id: true,
    nome: true,
    slug: true,
    numeroExibicao: true,
    ordemExibicao: true,
    descricao: true,
    descricaoResumida: true,
    historia: true,
    importanciaCultural: true,
    situacao: true,
    publicadoEm: true,
    updatedAt: true,
    categoria: { select: { id: true, nome: true, slug: true, descricao: true } },
    categoriasAdicionais: categoriasAdicionaisSelect,
    localizacao: true,
    secoes: { orderBy: { ordem: "asc" }, select: { id: true, icone: true, titulo: true, texto: true, ordem: true } },
    fatos: { orderBy: { ordem: "asc" }, select: { id: true, rotulo: true, valor: true, ordem: true } },
    ligacoes: {
        where: { destino: { status: StatusPublicacao.PUBLICADO } },
        orderBy: { ordem: "asc" },
        select: { id: true, texto: true, ordem: true, patrimonioDestinoId: true,
            destino: { select: { id: true, slug: true, nome: true, numeroExibicao: true } } },
    },
    imagens: {
        orderBy: [{ principal: "desc" }, { ordem: "asc" }],
        select: {
            id: true,
            url: true,
            titulo: true,
            textoAlternativo: true,
            credito: true,
            fonte: true,
            ordem: true,
            principal: true,
        },
    },
    documentos: {
        orderBy: { createdAt: "asc" },
        select: {
            id: true,
            titulo: true,
            descricao: true,
            url: true,
            tipo: true,
            fonte: true,
            dataDocumento: true,
            mimeType: true,
        },
    },
    rotas: {
        where: { rota: { status: StatusPublicacao.PUBLICADO } },
        orderBy: { ordem: "asc" },
        select: {
            ordem: true,
            rota: { select: { id: true, nome: true, slug: true, descricao: true } },
        },
    },
};

async function generateUniqueSlug(client, nome) {
    const baseSlug = slugify(nome);

    for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
        const suffix = attempt === 1 ? "" : `-${attempt}`;
        const slug = `${baseSlug.slice(0, 220 - suffix.length)}${suffix}`;
        const existing = await client.patrimonio.findUnique({
            where: { slug },
            select: { id: true },
        });

        if (!existing) return slug;
    }

    const error = new ConflictError("Não foi possível gerar um slug único para o patrimônio.");
    error.code = "PATRIMONIO_SLUG_CONFLICT";
    throw error;
}

export async function listPatrimonios(query) {
    return listWithStatus(query, StatusPublicacao.PUBLICADO, publicListSelect);
}

export async function listAdminPatrimonios(query) {
    return listWithStatus(query, query.status, { ...publicListSelect, status: true, arquivadoEm: true });
}

async function listWithStatus({ busca, categoria, situacao, bairro, pagina, limite }, status, select) {
    const where = {
        ...(status && { status }),
        ...(busca && {
            OR: [
                { nome: { contains: busca, mode: "insensitive" } },
                { descricaoResumida: { contains: busca, mode: "insensitive" } },
                { descricao: { contains: busca, mode: "insensitive" } },
                { historia: { contains: busca, mode: "insensitive" } },
                { importanciaCultural: { contains: busca, mode: "insensitive" } },
                { secoes: { some: { OR: [
                    { titulo: { contains: busca, mode: "insensitive" } },
                    { texto: { contains: busca, mode: "insensitive" } },
                ] } } },
            ],
        }),
        // O filtro de categoria casa com a principal OU com alguma adicional.
        // Fica dentro de AND para não colidir com o OR da busca acima.
        ...(categoria && {
            AND: [{
                OR: [
                    { categoria: { OR: [
                        { nome: { equals: categoria, mode: "insensitive" } },
                        { slug: { equals: categoria, mode: "insensitive" } },
                    ] } },
                    {
                        categoriasAdicionais: {
                            some: { categoria: { OR: [
                                { nome: { equals: categoria, mode: "insensitive" } },
                                { slug: { equals: categoria, mode: "insensitive" } },
                            ] } },
                        },
                    },
                ],
            }],
        }),
        ...(situacao && { situacao }),
        ...(bairro && {
            localizacao: { is: { bairro: { equals: bairro, mode: "insensitive" } } },
        }),
    };

    const [total, itens] = await Promise.all([
        prisma.patrimonio.count({ where }),
        prisma.patrimonio.findMany({
            where,
            skip: (pagina - 1) * limite,
            take: limite,
            orderBy: [{ ordemExibicao: { sort: "asc", nulls: "last" } }, { nome: "asc" }, { id: "asc" }],
            select,
        }),
    ]);

    return {
        itens: itens.map(achatarCategorias),
        paginacao: {
            pagina,
            limite,
            total,
            totalPaginas: Math.ceil(total / limite),
        },
    };
}

const adminInclude = {
    categoria: true,
    categoriasAdicionais: { include: { categoria: true } },
    localizacao: true,
    secoes: { orderBy: { ordem: "asc" } },
    fatos: { orderBy: { ordem: "asc" } },
    ligacoes: { orderBy: { ordem: "asc" } },
    imagens: { orderBy: [{ principal: "desc" }, { ordem: "asc" }, { id: "asc" }] },
    documentos: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
};

export async function getAdminPatrimonio(id, client = prisma) {
    const patrimonio = await client.patrimonio.findUnique({ where: { id }, include: adminInclude });
    if (!patrimonio) {
        const error = new NotFoundError("Patrimônio não encontrado.");
        error.code = "PATRIMONIO_NOT_FOUND";
        throw error;
    }
    return achatarCategorias(patrimonio);
}

async function lockPatrimonio(transaction, id) {
    await transaction.$queryRaw`SELECT id FROM patrimonio WHERE id = ${id}::uuid FOR UPDATE`;
    return getAdminPatrimonio(id, transaction);
}

function locationInput(localizacao) {
    if (!localizacao) return undefined;
    const { id, patrimonioId, ...fields } = localizacao;
    return Object.fromEntries(Object.entries(fields)
        .filter(([, value]) => value !== null)
        .map(([key, value]) => [key, ["latitude", "longitude"].includes(key) ? Number(value) : value]));
}

export async function updatePatrimonio(id, data, user) {
    return prisma.$transaction(async (transaction) => {
        const current = await lockPatrimonio(transaction, id);
        if (user.role !== "ADMIN" && (user.role !== "EDITOR" || current.status !== "RASCUNHO")) {
            throw new ForbiddenError("Editor pode editar somente rascunhos.");
        }
        const categoriaId = data.categoriaId ?? current.categoriaId;
        const adicionaisIds = data.categoriasAdicionais ?? current.categoriasAdicionais.map((item) => item.id);
        if (adicionaisIds.includes(categoriaId)) {
            throw new BadRequestError("A categoria principal não deve estar entre as adicionais.");
        }
        if (data.categoriaId !== undefined) {
            const categoria = await transaction.categoria.findUnique({ where: { id: data.categoriaId } });
            if (!categoria) throw new BadRequestError("Categoria não encontrada.");
        }
        if (data.categoriasAdicionais !== undefined && adicionaisIds.length > 0) {
            const encontradas = await transaction.categoria.findMany({ where: { id: { in: adicionaisIds } }, select: { id: true } });
            if (encontradas.length !== adicionaisIds.length) throw new BadRequestError("Categoria adicional não encontrada.");
        }
        const { localizacao, categoriasAdicionais, secoes, fatos, ligacoes, ...fields } = data;
        if (ligacoes !== undefined && ligacoes.length > 0) {
            const destinos = ligacoes.map((ligacao) => ligacao.patrimonioDestinoId);
            if (destinos.includes(current.id)) throw new BadRequestError("O patrimônio não pode ter ligação consigo mesmo.");
            const encontrados = await transaction.patrimonio.findMany({ where: { id: { in: destinos } }, select: { id: true } });
            if (encontrados.length !== new Set(destinos).size) {
                throw new BadRequestError("Destino de ligação não encontrado.");
            }
        }
        let locationUpdate;
        if (localizacao !== undefined) {
            const finalLocation = localizacaoSchema.parse({ ...locationInput(current.localizacao), ...localizacao });
            locationUpdate = current.localizacao ? { update: localizacao } : { create: finalLocation };
        }
        const updated = await transaction.patrimonio.update({
            where: { id },
            data: {
                ...fields, updatedBy: user.id,
                ...(secoes !== undefined && { secoes: { deleteMany: {}, create: secoes } }),
                ...(fatos !== undefined && { fatos: { deleteMany: {}, create: fatos } }),
                ...(ligacoes !== undefined && { ligacoes: { deleteMany: {}, create: ligacoes } }),
                ...(locationUpdate && { localizacao: locationUpdate }),
                ...(categoriasAdicionais !== undefined && { categoriasAdicionais: {
                    deleteMany: {},
                    create: categoriasAdicionais.map((categoriaId) => ({ categoriaId })),
                } }),
            },
            include: adminInclude,
        });
        return achatarCategorias(updated);
    }).catch(rethrowPatrimonioError);
}

export async function changePatrimonioStatus(id, status, user) {
    if (user.role !== "ADMIN") throw new ForbiddenError();
    return prisma.$transaction(async (transaction) => {
        const current = await lockPatrimonio(transaction, id);
        if (current.status === status) return current;
        if (status === StatusPublicacao.PUBLICADO) {
            createPatrimonioSchema.parse({
                nome: current.nome,
                descricao: current.descricao,
                numeroExibicao: current.numeroExibicao,
                ordemExibicao: current.ordemExibicao,
                secoes: current.secoes?.map(({ icone, titulo, texto, ordem }) => ({ icone, titulo, texto, ordem })),
                fatos: current.fatos?.map(({ rotulo, valor, ordem }) => ({ rotulo, valor, ordem })),
                ligacoes: current.ligacoes?.map(({ patrimonioDestinoId, texto, ordem }) => ({ patrimonioDestinoId, texto, ordem })),
                descricaoResumida: current.descricaoResumida,
                categoriaId: current.categoriaId,
                categoriasAdicionais: current.categoriasAdicionais.map((item) => item.id),
                historia: current.historia ?? undefined,
                importanciaCultural: current.importanciaCultural ?? undefined,
                situacao: current.situacao,
                localizacao: locationInput(current.localizacao),
            });
            if (current.ligacoes?.some((ligacao) => ligacao.patrimonioDestinoId === current.id)) {
                throw new BadRequestError("O patrimônio não pode ter ligação consigo mesmo.");
            }
        } else if (status !== StatusPublicacao.ARQUIVADO) {
            throw new BadRequestError("Transição de status inválida.");
        }
        const updated = await transaction.patrimonio.update({
            where: { id },
            data: {
                status,
                updatedBy: user.id,
                ...(status === StatusPublicacao.PUBLICADO
                    ? { publicadoEm: new Date(), arquivadoEm: null }
                    : { arquivadoEm: new Date() }),
            },
            include: adminInclude,
        });
        return achatarCategorias(updated);
    });
}

export async function getPatrimonioBySlug(slug) {
    const patrimonio = await prisma.patrimonio.findFirst({
        where: { slug, status: StatusPublicacao.PUBLICADO },
        select: publicDetailSelect,
    });

    if (!patrimonio) {
        const error = new NotFoundError("Patrimônio não encontrado.");
        error.code = "PATRIMONIO_NOT_FOUND";
        throw error;
    }

    return achatarCategorias({ ...patrimonio, secoes: patrimonio.secoes ?? [], fatos: patrimonio.fatos ?? [], ligacoes: patrimonio.ligacoes ?? [] });
}

export async function createPatrimonio(data, createdBy) {
    try {
        return await prisma.$transaction(async (transaction) => {
            const categoria = await transaction.categoria.findUnique({
                where: { id: data.categoriaId },
                select: { id: true },
            });

            if (!categoria) {
                const error = new NotFoundError("Categoria não encontrada.");
                error.code = "CATEGORIA_NOT_FOUND";
                throw error;
            }

            // A principal não entra na lista de adicionais (o schema zod já rejeita, aqui é defesa extra).
            const adicionaisIds = [...new Set(data.categoriasAdicionais ?? [])]
                .filter((id) => id !== data.categoriaId);

            if (adicionaisIds.length > 0) {
                const encontradas = await transaction.categoria.findMany({
                    where: { id: { in: adicionaisIds } },
                    select: { id: true },
                });

                if (encontradas.length !== adicionaisIds.length) {
                    const error = new NotFoundError("Categoria adicional não encontrada.");
                    error.code = "CATEGORIA_NOT_FOUND";
                    throw error;
                }
            }

            const slug = await generateUniqueSlug(transaction, data.nome);
            const destinos = (data.ligacoes ?? []).map((l) => l.patrimonioDestinoId);
            if (destinos.length) {
                const encontrados = await transaction.patrimonio.findMany({ where: { id: { in: destinos } }, select: { id: true } });
                if (encontrados.length !== new Set(destinos).size) {
                    const error = new NotFoundError("Destino de ligação não encontrado.");
                    error.code = "LIGACAO_DESTINO_NOT_FOUND";
                    throw error;
                }
            }

            const criado = await transaction.patrimonio.create({
                data: {
                    nome: data.nome,
                    slug,
                    descricao: data.descricao,
                    numeroExibicao: data.numeroExibicao,
                    ordemExibicao: data.ordemExibicao,
                    descricaoResumida: data.descricaoResumida,
                    historia: data.historia,
                    importanciaCultural: data.importanciaCultural,
                    situacao: data.situacao ?? SituacaoPatrimonio.NAO_INFORMADO,
                    status: StatusPublicacao.RASCUNHO,
                    categoriaId: data.categoriaId,
                    createdBy,
                    ...(data.localizacao && { localizacao: { create: data.localizacao } }),
                    ...(data.secoes?.length && { secoes: { create: data.secoes } }),
                    ...(data.fatos?.length && { fatos: { create: data.fatos } }),
                    ...(data.ligacoes?.length && { ligacoes: { create: data.ligacoes } }),
                    ...(adicionaisIds.length > 0 && {
                        categoriasAdicionais: {
                            create: adicionaisIds.map((categoriaId) => ({ categoriaId })),
                        },
                    }),
                },
                include: {
                    categoria: true,
                    categoriasAdicionais: { include: { categoria: true } },
                    localizacao: true,
                    secoes: { orderBy: { ordem: "asc" } },
                    fatos: { orderBy: { ordem: "asc" } },
                    ligacoes: { orderBy: { ordem: "asc" } },
                },
            });

            return achatarCategorias(criado);
        });
    } catch (error) {
        rethrowPatrimonioError(error);
    }
}
