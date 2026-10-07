import { Prisma } from "@prisma/client";
import prisma from "../config/prisma.js";

const pendencias = [
    { indicador: "porTombamento", motivo: "O schema atual não possui campos de tombamento nem relação de proteção com esfera e patrimônio; a modelagem e o indicador estão pendentes." },
    { indicador: "localizacao.regioes", motivo: "O schema atual não possui região nem associação de bairros a regiões; a definição e o indicador estão pendentes." },
    { indicador: "rotas", motivo: "Rota e RotaPatrimonio já existem no schema; faltam definir quais rotas são disponíveis/ativas e implementar o indicador. PUBLICADO define publicação, sem regra explícita de atividade." },
];

const comparar = (a, b) => a.localeCompare(b, "pt-BR") || (a < b ? -1 : a > b ? 1 : 0);
const indisponivel = (indicador) => ({
    disponivel: false,
    motivo: pendencias.find((item) => item.indicador === indicador).motivo,
    dados: null,
});

export async function getDashboard() {
    // Uma mesma fotografia do banco evita divergência entre total e agrupamentos
    // caso patrimônios sejam cadastrados, excluídos ou editados durante a consulta.
    return prisma.$transaction(async (client) => {
        const totalPatrimonios = await client.patrimonio.count();
        let dados = [];
        let distribuicao = [];
        let totalBairrosDistintos = 0;

        if (totalPatrimonios > 0) {
            const [gruposCategoria, gruposBairro] = await Promise.all([
                client.patrimonio.groupBy({ by: ["categoriaId"], _count: { _all: true } }),
                client.localizacao.groupBy({
                    by: ["bairro"], _count: { _all: true },
                }),
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
        }

        return {
            totalPatrimonios,
            porCategoria: { disponivel: true, dados },
            localizacao: {
                bairros: { disponivel: true, totalBairrosDistintos, distribuicao },
                regioes: indisponivel("localizacao.regioes"),
            },
            porTombamento: indisponivel("porTombamento"),
            rotas: indisponivel("rotas"),
            meta: { parcial: pendencias.length > 0, baseContagem: "TODOS_OS_STATUS", pendencias: pendencias.map((item) => ({ ...item })) },
        };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
