import { Prisma, SituacaoPatrimonio, StatusPublicacao } from "@prisma/client";
import prisma from "../config/prisma.js";
import ConflictError from "../errors/ConflictError.js";
import NotFoundError from "../errors/NotFoundError.js";
import { slugify } from "../utils/slug.js";

const MAX_SLUG_ATTEMPTS = 1000;

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
                    historia: data.historia,
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
