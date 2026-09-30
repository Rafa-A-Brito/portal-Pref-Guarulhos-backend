/**
 * Popula o banco com patrimônios materiais de Guarulhos para exercitar a
 * consulta pública. O seed é idempotente: categorias e patrimônios são
 * identificados pelos campos únicos `nome` e `slug`.
 */
import { randomUUID } from "node:crypto";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/utils/password.js";
import { slugify } from "../src/utils/slug.js";

if (!process.env.DATABASE_URL) {
    throw new Error("A variável DATABASE_URL é obrigatória para executar o seed.");
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const CATEGORIAS = [
    { nome: "Arquitetônico", descricao: "Edificações de valor histórico e arquitetônico" },
    { nome: "Religioso", descricao: "Igrejas, capelas e edificações de culto" },
    { nome: "Ferroviário", descricao: "Bens ligados ao Tramway da Cantareira e à ferrovia" },
    { nome: "Industrial", descricao: "Fábricas e edificações de uso industrial" },
    { nome: "Educacional", descricao: "Escolas e edificações de ensino público" },
    { nome: "Ambiental", descricao: "Parques, represas e bens de valor ambiental/paisagístico" },
    { nome: "Histórico", descricao: "Sítios e edificações de relevância histórica e cultural" },
];

const PATRIMONIOS = [
    {
        nome: "Sanatório Padre Bento",
        categoria: "Arquitetônico",
        situacao: "PRESERVADO",
        bairro: "Gopouva",
        descricao: "Complexo projetado na década de 1920 e inaugurado em 1931 como colônia de isolamento para doentes de hanseníase, hoje integrado à rede pública de saúde como Hospital Geral Padre Bento.",
        historia: "Idealizado pelo Governo do Estado de São Paulo sob o modelo de \"cidade-sanatório\", funcionava de forma autônoma, com leitos de internação, padaria, correios, barbearia, campos esportivos e espaços de lazer. Destaca-se o Teatro Padre Bento, inaugurado em 1937 em estilo art déco para atividades culturais entre os internos, e a Paróquia São João Batista, integrada ao espaço para assistência religiosa. Com o fim da segregação sanitária forçada nos anos 1960 e os avanços no tratamento da doença, a instituição foi incorporada à rede pública de saúde. O conjunto é tombado pelo COMPHIG e pelo CONDEPHAAT.",
    },
    {
        nome: "Igreja de Nossa Senhora de Bonsucesso e Núcleo Histórico",
        categoria: "Religioso",
        situacao: "PRESERVADO",
        bairro: "Bonsucesso",
        descricao: "Núcleo religioso originado no início do século XVIII como ponto de apoio para tropeiros, com capela erguida em taipa por volta de 1741.",
        historia: "A região servia de ponto de descanso para tropeiros e povoadores que viajavam entre São Paulo, o Vale do Paraíba e o Rio de Janeiro. A capela tornou-se o centro da Festa de Nossa Senhora de Bonsucesso, celebrada ininterruptamente desde meados do século XVIII. O entorno preserva o traçado urbano típico dos núcleos rurais paulistas pré-industriais. O tombamento abrange o edifício, seu acervo e a praça central do bairro.",
    },
    {
        nome: "Sítio da Candinha (Casa da Candinha)",
        categoria: "Histórico",
        situacao: "PRESERVADO",
        bairro: "Taboão",
        descricao: "Edificação rural do século XIX em taipa de pilão, ligada a Cândida Maria da Conceição, mulher negra ex-escravizada, hoje sede do Centro de Referência da Cultura Negra de Guarulhos.",
        historia: "Localizado na região do Taboão/Lavras (antigo Sítio Bananal), o imóvel pertenceu a Cândida Maria da Conceição, que adquiriu terras na região no período pós-abolicionista. A casa servia como moradia familiar e ponto de apoio para trabalhadores rurais. Após desapropriação e tombamento pelo poder público municipal, passou por restauração arquitetônica e arqueológica, sendo convertida em centro de referência para preservar a memória da presença negra e da arquitetura de taipa no município.",
    },
    {
        nome: "Casa José Maurício",
        categoria: "Arquitetônico",
        situacao: "NAO_INFORMADO",
        bairro: "Centro",
        endereco: "Rua Sete de Setembro",
        descricao: "Último exemplar remanescente de arquitetura residencial urbana em taipa de pilão do século XIX em Guarulhos, antiga residência de José Maurício de Oliveira.",
        historia: "Situada no centro da cidade, foi residência de José Maurício de Oliveira, que ocupou o cargo de intendente (prefeito) durante a República Velha. A construção apresenta técnicas mistas de taipa e alvenaria de tijolos de barro, além de esquadrias de madeira típicas do período imperial. Seu tombamento visou deter a demolição promovida pela expansão comercial no centro urbano.",
    },
    {
        nome: "Casa Amarela (Casa do Chefe da Estação)",
        categoria: "Ferroviário",
        situacao: "PRESERVADO",
        bairro: "Centro",
        endereco: "Praça IV Centenário",
        descricao: "Erguida por volta de 1915 como moradia oficial do chefe da Estação Ferroviária de Guarulhos, hoje sede do Arquivo Histórico Municipal.",
        historia: "Construída pela Companhia Cantareira de Esgotos, integrava o complexo do Tramway da Cantareira, linha que ligava Guarulhos à capital paulista. Apresenta arquitetura ferroviária em madeira e alvenaria, cobertura em telhas francesas e pintura externa amarela tradicional. Após o encerramento da ferrovia em 1965, o imóvel foi recuperado pelo município, tombado e adaptado para abrigar o Arquivo Histórico Municipal.",
    },
    {
        nome: "Locomotiva \"Maria Fumaça\" (Nº 33), Vagão e Caixa D'Água",
        categoria: "Ferroviário",
        situacao: "PRESERVADO",
        bairro: "Centro",
        endereco: "Praça IV Centenário",
        descricao: "Conjunto de bens móveis do Tramway da Cantareira (1915–1965): locomotiva a vapor alemã Borsig, vagão de madeira e caixa d'água metálica.",
        historia: "A locomotiva e o vagão eram responsáveis pelo transporte de passageiros, alunos e insumos industriais entre Guarulhos e São Paulo. A caixa d'água servia para o reabastecimento das caldeiras a vapor dos trens. Após a desativação do ramal ferroviário, as peças foram restauradas e tombadas como monumento público.",
    },
    {
        nome: "Antiga Fábrica Adamastor",
        categoria: "Industrial",
        situacao: "PRESERVADO",
        bairro: "Centro",
        descricao: "Fábrica de Tecidos e Casimiras Adamastor, um dos primeiros grandes empreendimentos fabris de Guarulhos, hoje Centro Municipal de Educação Adamastor.",
        historia: "Fundada no início do século XX, contava com galpões em alvenaria de tijolos aparentes e coberturas em shed para iluminação natural. Operou por décadas até o encerramento das atividades no final do século XX. Em 2002, o imóvel foi desapropriado, restaurado e requalificado pelo município, reabrindo como Centro Municipal de Educação Adamastor, preservando as fachadas originais e abrigando teatros, bibliotecas e auditórios.",
    },
    {
        nome: "Escola Estadual Conselheiro Crispiniano",
        categoria: "Educacional",
        situacao: "NAO_INFORMADO",
        bairro: null,
        descricao: "Primeiro ginásio estadual de ensino secundário do município, erguido na década de 1950 em linguagem modernista paulista.",
        historia: "A edificação adota os preceitos da arquitetura escolar modernista paulista do período, com volumes retilíneos, pátios cobertos e brise-soleils para ventilação e iluminação natural. Seu tombamento protege o valor arquitetônico do prédio e sua relevância no desenvolvimento do ensino público da cidade.",
    },
    {
        nome: "Escola Estadual Capistrano de Abreu",
        categoria: "Educacional",
        situacao: "NAO_INFORMADO",
        bairro: null,
        endereco: "Rua Capitão Gabriel",
        descricao: "Escola erguida na década de 1930 sobre o terreno do antigo cemitério municipal do século XIX, com linguagem neoclássica e eclética.",
        historia: "A escola ocupa o terreno onde existia, no século XIX, o antigo cemitério municipal voltado a vítimas de epidemias como a varíola. Após a desativação do cemitério, a área foi utilizada na década de 1930 para a construção do primeiro Grupo Escolar da cidade. O prédio possui linguagem neoclássica e eclética, típica das construções escolares paulistas da era Vargas, tendo recebido o nome do historiador Capistrano de Abreu em 1947.",
    },
    {
        nome: "Igreja do Bom Jesus da Cabeça",
        categoria: "Religioso",
        situacao: "NAO_INFORMADO",
        bairro: "Cabuçu",
        descricao: "Igreja rural erguida nas primeiras décadas do século XX para atender trabalhadores agrícolas do Cabuçu, com traços neoclássicos vernaculares.",
        historia: "Sua denominação faz referência à devoção católica popular voltada à representação do Senhor Bom Jesus centrada na imagem da cabeça do Cristo. O edifício apresenta linhas arquitetônicas simples e vernaculares com traços neoclássicos, servindo como ponto comunitário e histórico da ocupação rural da Serra da Cantareira.",
    },
    {
        nome: "Igreja de Nossa Senhora do Rosário dos Homens Pretos",
        categoria: "Religioso",
        situacao: "PRESERVADO",
        bairro: "Centro",
        endereco: "Praça do Rosário",
        descricao: "Igreja do século XIX erguida pela Irmandade dos Homens Pretos, principal marco religioso e cultural da população afro-brasileira no centro de Guarulhos.",
        historia: "A Irmandade dos Homens Pretos foi criada por pessoas escravizadas e libertas para garantir apoio mútuo, alforrias e celebrações religiosas. A edificação colonial em taipa passou por reformas ao longo do século XX que revestiram sua fachada em alvenaria.",
    },
    {
        nome: "Represa do Cabuçu",
        categoria: "Ambiental",
        situacao: "PRESERVADO",
        bairro: "Cabuçu",
        descricao: "Inaugurada em 1908 no Parque Estadual da Cantareira, foi a primeira grande obra de saneamento da Região Metropolitana de São Paulo em concreto armado.",
        historia: "Projetada pela Repartição de Águas e Esgotos (RAE) para mitigar a escassez de água na capital, a barragem curvo-gravitacional preserva suas comportas e a casa de máquinas originais, sendo tombada como patrimônio tecnológico e ambiental.",
    },
    {
        nome: "Antigo Paço Municipal",
        categoria: "Arquitetônico",
        situacao: "NAO_INFORMADO",
        bairro: "Centro",
        endereco: "Rua Dom Pedro II",
        descricao: "Edifício em estilo eclético que funcionou como sede unificada dos poderes Executivo e Legislativo de Guarulhos em meados do século XX.",
        historia: "Abrigou a administração pública durante a fase de acelerado crescimento demográfico e industrial do município. Após a mudança dos órgãos administrativos para novas sedes, o imóvel foi protegido por tombamento municipal.",
    },
    {
        nome: "Bosque Maia",
        categoria: "Ambiental",
        situacao: "PRESERVADO",
        bairro: null,
        descricao: "Parque Municipal Paulo Faccini, com mais de 170 mil m², criado em 1982 na área da antiga chácara da família Maia, com tombamento paisagístico e ambiental.",
        historia: "Diante da expansão imobiliária nas décadas de 1970 e 1980, a área de mata nativa e nascentes do Ribeirão das Lavras foi desapropriada e convertida em parque público em 1982.",
    },
    {
        nome: "Casarão Saraceni",
        categoria: "Arquitetônico",
        situacao: "DEMOLIDO",
        bairro: "Itapegica",
        descricao: "Casarão eclético do início do século XX, tombado em 2000 pelo COMPHIG e demolido em 2010, após revogação do tombamento, para expansão de estacionamento de shopping.",
        historia: "Construído na antiga Chácara Saraceni, pertenceu à família pioneira na industrialização local. Em novembro de 2010, após disputas judiciais e a revogação da portaria de proteção, a edificação foi demolida pela iniciativa privada para a expansão do estacionamento do shopping center construído no terreno.",
    },
    {
        nome: "Casarão Lima",
        categoria: "Arquitetônico",
        situacao: "DEMOLIDO",
        bairro: "Centro",
        endereco: "Avenida Monteiro Lobato",
        numero: "136",
        descricao: "Casarão residencial da primeira metade do século XX na Avenida Monteiro Lobato, demolido em 2026 durante o processo administrativo de tombamento.",
        historia: "Representava a arquitetura das elites comerciantes do centro urbano de Guarulhos. Enquanto o processo administrativo para a efetivação do seu tombamento tramitava no COMPHIG (Processo Administrativo nº 48.324/2021), a estrutura foi demolida por proprietários particulares em 2026, após obtenção de alvará de demolição junto à Secretaria de Desenvolvimento Urbano.",
    },
    {
        nome: "Casarão da Família Albertis",
        categoria: "Arquitetônico",
        situacao: "DEMOLIDO",
        bairro: "Gopouva",
        descricao: "Casarão da década de 1940 com acervo artístico integrado (vitrais da Casa Conrado e painéis de Lisbeth Forell), demolido em 2023 durante estudos técnicos de tombamento.",
        historia: "Erguido no bairro Gopouva, continha vitrais do ateliê Casa Conrado e painéis de azulejos da artista Lisbeth Forell. Durante 2023, no decorrer dos estudos técnicos para a instrução de seu tombamento municipal (Processo Administrativo nº 49.511/2022), o imóvel foi demolido por iniciativa privada. Ativistas conseguiram resgatar os vitrais e o painel de azulejos antes da destruição final.",
    },
    {
        nome: "Estação Ferroviária Central de Guarulhos",
        categoria: "Ferroviário",
        situacao: "DEMOLIDO",
        bairro: "Centro",
        endereco: "Praça IV Centenário",
        descricao: "Estação inaugurada em 1915, principal ponto do Tramway da Cantareira na cidade, demolida pela administração pública após o encerramento da linha em 1965.",
        historia: "Atendia passageiros e o transporte de cargas cerâmicas. Após o encerramento da linha férrea em maio de 1965, o prédio de passageiros em alvenaria e madeira foi demolido por volta de 1968 para reformulação viária do centro. Décadas depois, uma réplica simplificada da fachada foi erguida na praça para abrigar equipamentos comunitários.",
    },
    {
        nome: "Antiga Igreja Matriz Colonial de Nossa Senhora da Conceição",
        categoria: "Religioso",
        situacao: "DEMOLIDO",
        bairro: "Centro",
        descricao: "Igreja colonial barroca em taipa de pilão, marco zero da fundação de Guarulhos, desmantelada entre as décadas de 1930 e 1950 para dar lugar à atual Catedral.",
        historia: "Erguida em taipa de pilão a partir do século XVII sob orientação jesuítica, era o marco zero da fundação de Guarulhos, com paredes espessas de taipa, piso em barro batido/madeira e altares esculpidos em madeira. Entre as décadas de 1930 e 1950, a estrutura foi totalmente desmantelada e demolida em etapas para abrir espaço à construção da atual Catedral de Guarulhos.",
    },
];

function localizacaoData(item) {
    if (!item.endereco || !item.bairro) return null;

    return {
        endereco: item.endereco,
        numero: item.numero ?? null,
        complemento: null,
        bairro: item.bairro,
        cidade: "Guarulhos",
        uf: "SP",
        cep: null,
        latitude: null,
        longitude: null,
    };
}

async function main() {
    const seedUser = await prisma.user.upsert({
        where: { email: "seed.patrimonios@localhost.invalid" },
        update: {},
        create: {
            name: "Importação inicial de patrimônios",
            email: "seed.patrimonios@localhost.invalid",
            passwordHash: await hashPassword(randomUUID()),
            role: "EDITOR",
            isActive: false,
        },
    });

    const categoriasPorNome = {};
    for (const categoriaData of CATEGORIAS) {
        const dadosCategoria = {
            ...categoriaData,
            slug: slugify(categoriaData.nome).slice(0, 120),
        };
        const categoria = await prisma.categoria.upsert({
            where: { nome: categoriaData.nome },
            update: { slug: dadosCategoria.slug, descricao: dadosCategoria.descricao },
            create: dadosCategoria,
        });
        categoriasPorNome[categoria.nome] = categoria;
    }

    for (const item of PATRIMONIOS) {
        const slug = slugify(item.nome);
        const categoriaId = categoriasPorNome[item.categoria].id;
        const localizacao = localizacaoData(item);
        const dadosPublicos = {
            nome: item.nome,
            descricao: item.descricao,
            descricaoResumida: item.descricao.slice(0, 500),
            historia: item.historia,
            situacao: item.situacao,
            status: "PUBLICADO",
            categoriaId,
        };

        await prisma.patrimonio.upsert({
            where: { slug },
            update: {
                ...dadosPublicos,
                publicadoEm: new Date(),
                ...(localizacao && {
                    localizacao: {
                        upsert: {
                            create: localizacao,
                            update: localizacao,
                        },
                    },
                }),
            },
            create: {
                ...dadosPublicos,
                slug,
                createdBy: seedUser.id,
                publicadoEm: new Date(),
                ...(localizacao && { localizacao: { create: localizacao } }),
            },
        });
    }

    console.log(`Seed concluído: ${PATRIMONIOS.length} patrimônios publicados.`);
}

main()
    .catch((error) => {
        console.error("Erro ao rodar o seed:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
