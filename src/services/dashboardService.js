import { Prisma } from "@prisma/client";
import prisma from "../config/prisma.js";
import { regiaoLabels } from "../utils/regiaoPatrimonio.js";

const comparar = (a, b) => a.localeCompare(b, "pt-BR") || (a < b ? -1 : a > b ? 1 : 0);

export async function getDashboard() {
    // Uma mesma fotografia do banco evita divergência entre total e agrupamentos
    // caso patrimônios sejam cadastrados, excluídos ou editados durante a consulta.
    return prisma.$transaction(async (client) => {
        const totalPatrimonios = await client.patrimonio.count();
        let dados = [];
        let distribuicao = [];
        let totalBairrosDistintos = 0;
        let distribuicaoRegioes = [];
        let totalRegioesDistintas = 0;

        if (totalPatrimonios > 0) {
            const [gruposCategoria, gruposBairro, gruposRegiao] = await Promise.all([
                client.patrimonio.groupBy({ by: ["categoriaId"], _count: { _all: true } }),
                client.localizacao.groupBy({
                    by: ["bairro"], _count: { _all: true },
                }),
                client.localizacao.groupBy({ by: ["regiao"], _count: { _all: true } }),
            ]);
            const categorias = await client.categoria.findMany({
                where: { id: { in: gruposCategoria.map((item) => item.categoriaId) } },
                select: { id: true, nome: true },
            });
            const nomes = new Map(categorias.map((item) => [item.id, item.nome]));
            // Somente a categoria principal, sem joins com categorias adicionais.
            dados = gruposCategoria.map((item) => ({
                id: item.categoriaId,
                nome: nomes.get(item.categoriaId),
                quantidade: item._count._all,
                percentual: Number((item._count._all * 100 / totalPatrimonios).toFixed(2)),
            })).sort((a, b) => comparar(a.nome, b.nome) || comparar(a.id, b.id));

            const bairros = new Map();
            let comLocalizacao = 0;
            let semBairro = 0;
            for (const item of gruposBairro) {
                const quantidade = item._count._all;
                comLocalizacao += quantidade;
                const bairro = item.bairro?.trim();
                if (!bairro || bairro === "Não informado") semBairro += quantidade;
                else bairros.set(bairro, (bairros.get(bairro) ?? 0) + quantidade);
            }
            totalBairrosDistintos = bairros.size;
            // patrimonioId é único em Localizacao. Subtrair TODOS os grupos
            // encontra apenas os sem localização; vazios/nulos entram uma só vez.
            const naoInformado = totalPatrimonios - comLocalizacao + semBairro;
            if (naoInformado > 0) {
                bairros.set("Não informado", (bairros.get("Não informado") ?? 0) + naoInformado);
            }
            distribuicao = [...bairros].map(([bairro, quantidade]) => ({ bairro, quantidade }))
                .sort((a, b) => comparar(a.bairro, b.bairro));

            distribuicaoRegioes = gruposRegiao
                .filter((item) => item.regiao !== null && item._count._all > 0)
                .map((item) => ({ regiao: item.regiao, nome: regiaoLabels[item.regiao], quantidade: item._count._all }))
                .sort((a, b) => comparar(a.nome, b.nome));
            totalRegioesDistintas = distribuicaoRegioes.length;
            // A relação 1:1 garante uma contagem por patrimônio. Subtrair só os
            // classificados reúne região nula e ausência de localização sem duplicação.
            const semRegiao = totalPatrimonios - distribuicaoRegioes.reduce((sum, item) => sum + item.quantidade, 0);
            if (semRegiao > 0) distribuicaoRegioes.push({ regiao: null, nome: "Não informado", quantidade: semRegiao });
        }

        return {
            totalPatrimonios,
            porCategoria: { disponivel: true, dados },
            localizacao: {
                bairros: { disponivel: true, totalBairrosDistintos, distribuicao },
                regioes: { disponivel: true, totalRegioesDistintas, distribuicao: distribuicaoRegioes },
            },
            meta: { parcial: false, baseContagem: "TODOS_OS_STATUS", pendencias: [] },
        };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
