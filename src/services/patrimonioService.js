import { Prisma, SituacaoPatrimonio, StatusPublicacao } from "@prisma/client";
import prisma from "../config/prisma.js";
import ConflictError from "../errors/ConflictError.js";
import NotFoundError from "../errors/NotFoundError.js";
import { slugify } from "../utils/slug.js";

const MAX_SLUG_ATTEMPTS = 1000;

const publicListSelect = {
    id: true,
    nome: true,
    slug: true,
    numeroExibicao: true,
    ordemExibicao: true,
    descricaoResumida: true,
    situacao: true,
    publicadoEm: true,
    categoria: { select: { id: true, nome: true, slug: true } },
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

export async function listPatrimonios({ busca, categoria, situacao, bairro, pagina, limite }) {
    const where = {
        status: StatusPublicacao.PUBLICADO,
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
        ...(categoria && {
            categoria: { OR: [
                { nome: { equals: categoria, mode: "insensitive" } },
                { slug: { equals: categoria, mode: "insensitive" } },
            ] },
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
            select: publicListSelect,
        }),
    ]);

    return {
        itens,
        paginacao: {
            pagina,
            limite,
            total,
            totalPaginas: Math.ceil(total / limite),
        },
    };
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

    return { ...patrimonio, secoes: patrimonio.secoes ?? [], fatos: patrimonio.fatos ?? [], ligacoes: patrimonio.ligacoes ?? [] };
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

            return transaction.patrimonio.create({
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
                },
                include: {
                    categoria: true,
                    localizacao: true,
                    secoes: { orderBy: { ordem: "asc" } },
                    fatos: { orderBy: { ordem: "asc" } },
                    ligacoes: { orderBy: { ordem: "asc" } },
                },
            });
        });
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            const target = Array.isArray(error.meta?.target)
                ? error.meta.target.join(",")
                : String(error.meta?.target ?? "");

            if (target.includes("slug")) {
                const conflict = new ConflictError("Já existe um patrimônio com este slug.");
                conflict.code = "PATRIMONIO_SLUG_CONFLICT";
                throw conflict;
            }
            const conflict = new ConflictError("Número, ordem ou relação editorial já utilizada.");
            conflict.code = "PATRIMONIO_EDITORIAL_CONFLICT";
            throw conflict;
        }

        throw error;
    }
}
