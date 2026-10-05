import { Prisma, SituacaoPatrimonio, StatusPublicacao } from "@prisma/client";
import prisma from "../config/prisma.js";
import ConflictError from "../errors/ConflictError.js";
import NotFoundError from "../errors/NotFoundError.js";
import BadRequestError from "../errors/BadRequestError.js";
import ForbiddenError from "../errors/ForbiddenError.js";
import { createPatrimonioSchema, localizacaoSchema } from "../schemas/patrimonioSchema.js";
import { slugify } from "../utils/slug.js";

const MAX_SLUG_ATTEMPTS = 1000;

const publicListSelect = {
    id: true,
    nome: true,
    slug: true,
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
    descricao: true,
    descricaoResumida: true,
    historia: true,
    importanciaCultural: true,
    situacao: true,
    publicadoEm: true,
    updatedAt: true,
    categoria: { select: { id: true, nome: true, slug: true, descricao: true } },
    localizacao: true,
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
            ],
        }),
        ...(categoria && {
            categoria: { nome: { equals: categoria, mode: "insensitive" } },
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
            orderBy: [{ nome: "asc" }, { id: "asc" }],
            select,
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

const adminInclude = {
    categoria: true,
    localizacao: true,
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
    return patrimonio;
}

// Serializa edição e transições para que a permissão e as datas usem o estado atual.
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
        if (data.categoriaId !== undefined) {
            const categoria = await transaction.categoria.findUnique({ where: { id: data.categoriaId } });
            if (!categoria) throw new BadRequestError("Categoria não encontrada.");
        }
        const { localizacao, ...fields } = data;
        let locationUpdate;
        if (localizacao !== undefined) {
            const finalLocation = localizacaoSchema.parse({ ...locationInput(current.localizacao), ...localizacao });
            locationUpdate = current.localizacao ? { update: localizacao } : { create: finalLocation };
        }
        return transaction.patrimonio.update({
            where: { id },
            data: { ...fields, updatedBy: user.id, ...(locationUpdate && { localizacao: locationUpdate }) },
            include: adminInclude,
        });
    });
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
                descricaoResumida: current.descricaoResumida,
                categoriaId: current.categoriaId,
                historia: current.historia ?? undefined,
                importanciaCultural: current.importanciaCultural ?? undefined,
                situacao: current.situacao,
                localizacao: locationInput(current.localizacao),
            });
        } else if (status !== StatusPublicacao.ARQUIVADO) {
            throw new BadRequestError("Transição de status inválida.");
        }
        return transaction.patrimonio.update({
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

    return patrimonio;
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

            return transaction.patrimonio.create({
                data: {
                    nome: data.nome,
                    slug,
                    descricao: data.descricao,
                    descricaoResumida: data.descricaoResumida,
                    historia: data.historia,
                    importanciaCultural: data.importanciaCultural,
                    situacao: data.situacao ?? SituacaoPatrimonio.NAO_INFORMADO,
                    status: StatusPublicacao.RASCUNHO,
                    categoriaId: data.categoriaId,
                    createdBy,
                    ...(data.localizacao && { localizacao: { create: data.localizacao } }),
                },
                include: {
                    categoria: true,
                    localizacao: true,
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
        }

        throw error;
    }
}
