# 🏛️ Patrimônio Histórico de Guarulhos — Portal Cultural & Mapeamento

![React](https://img.shields.io/badge/React-19.2-61DAFB?style=flat&logo=react&logoColor=white)
![Google Maps API](https://img.shields.io/badge/Google%20Maps%20API-3.64-4285F4?style=flat&logo=googlemaps&logoColor=red)
![CSS3](https://img.shields.io/badge/CSS-3-1572B6?style=flat&logo=css3&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-24%20LTS-339933?style=flat&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?style=flat&logo=express&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat&logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?style=flat&logo=postgresql&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2026-F7DF1E?style=flat&logo=javascript&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-lightgrey?style=flat)

Aplicação web interativa para o mapeamento, consulta e preservação da memória dos patrimônios históricos da cidade de Guarulhos. A plataforma permite a navegação por rotas culturais, visualização em mapa interativo via Google Maps, análise de dados estatísticos e mecanismos avançados de pesquisa e filtragem.

---

## 📖 Sobre o Projeto

### Motivação

O projeto tem como objetivo desenvolver um sistema digital de divulgação, valorização e preservação do patrimônio histórico e cultural do município de Guarulhos. A solução permite que os usuários visualizem, por meio de recursos interativos como mapa e organização de conteúdos históricos, os principais patrimônios da cidade e acessem informações relevantes sobre cada local — sua história, importância cultural, localização e demais características.

Com isso, a plataforma busca:

- Aproximar a população, especialmente o público jovem, da memória cultural e artística do município;
- Incentivar o turismo cultural e promover a conscientização sobre a importância dos espaços históricos;
- Contribuir para a preservação da história da cidade por meio da tecnologia.

Como resultado, espera-se disponibilizar uma ferramenta de fácil utilização, acessível e organizada, que centralize informações sobre os patrimônios históricos, documentos e conteúdos culturais em um único ambiente digital — proporcionando uma experiência mais interativa e permitindo que os usuários conheçam melhor a história de Guarulhos.

### Justificativa

O projeto surge da necessidade de preservar, organizar e facilitar o acesso à história e ao patrimônio histórico e cultural da cidade de Guarulhos. Em um momento especial como o aniversário do município, o projeto busca valorizar a história da cidade, destacando seus patrimônios históricos, culturais e arquitetônicos, além de aproximar a população de sua própria história.

O cenário atual apresenta alguns desafios que motivam a criação da plataforma:

- Informações sobre os patrimônios da cidade estão espalhadas em diferentes fontes, dificultando o acesso da população ao conhecimento histórico;
- Documentos, imagens, curiosidades e conteúdos culturais não estão reunidos em um único ambiente;
- Falta uma ferramenta acessível que aproxime moradores, estudantes e visitantes da história do município.

Ao reunir esse conteúdo em uma plataforma digital única, o projeto contribui para a preservação da memória de Guarulhos e utiliza a tecnologia como ferramenta de educação e valorização cultural, permitindo que a população entenda melhor a importância de seus patrimônios.

---

## 📌 Funcionalidades Principais

- **🗺️ Mapeamento Interativo & Rotas:** Geolocalização dos bens patrimoniais em Guarulhos utilizando a API do Google Maps com suporte a traçamento de rotas históricas.
- **🔍 Pesquisa & Filtros Avançados:** Filtros dinâmicos por categoria (arquitetônico, imaterial, natural), época histórica, bairro e estado de conservação.
- **📊 Painel Estatístico & Análises:** Gráficos interativos para análise de visitação, tombamentos e distribuição geográfica dos patrimônios.
- **🌐 Consumo de API REST:** Comunicação completa com a API backend para busca performática e persistência de dados.
- **🎨 Estilização Customizada:** Interface responsiva construída com CSS puro, sem dependência de frameworks visuais.

---

## 🛠️ Tecnologias Utilizadas

### Frontend & Interface

- **React.js (19.2):** Biblioteca base para construção da interface baseada em componentes.
- **JavaScript (ES2026) / HTML5 / CSS3:** Base da aplicação.
- **CSS Puro (Arquitetura Modular):** Estilização sem frameworks externos, utilizando CSS Variables para temas e layouts flexíveis (Flexbox e CSS Grid).

### Bibliotecas e Dependências

| Biblioteca | Finalidade |
|---|---|
| `@react-google-maps/api` | Integração do Google Maps SDK no React (marcadores, janelas de informação e rotas) |
| `axios` | Cliente HTTP para consumo das rotas REST da API backend |
| `recharts` (ou `chart.js` + `react-chartjs-2`) | Visualização de dados estatísticos através de gráficos dinâmicos |
| `react-icons` | Biblioteca de ícones vetoriais leves |
| `react-router-dom` | Gerenciamento de rotas e navegação de páginas (Home, Detalhes do Patrimônio, Dashboard Estatístico) |

### Backend & API

- **Node.js:** Ambiente de execução JavaScript utilizado no servidor.
- **Express:** Framework utilizado para construção da API REST.
- **JavaScript:** Linguagem utilizada no desenvolvimento do backend.
- **Prisma:** ORM utilizado para comunicação com o banco de dados.
- **PostgreSQL:** Banco de dados relacional utilizado para persistência das informações.

---

## 📐 Arquitetura do Sistema

```text
┌─────────────────────────────────────────────────────────┐
│                    React Frontend                       │
│ (UI Components, Pure CSS, Google Maps API, Recharts)    │
└───────────────────────────┬─────────────────────────────┘
                             │  HTTP / JSON (REST API)
┌───────────────────────────▼─────────────────────────────┐
│                    Backend Server                       │
│   (Controllers, Routes, Middlewares, Errors, Config)    │    
└───────────────────────────┬─────────────────────────────┘
                             │  Queries / ORM
┌───────────────────────────▼─────────────────────────────┐
│                       Database                          │
│                    PostgreSQL + Prisma                  │
└─────────────────────────────────────────────────────────┘
```

---

## 🚀 Como Executar o Projeto

### Pré-requisitos

* [Node.js](https://nodejs.org/) 24.x (LTS) ou superior
* Gerenciador de pacotes `npm` ou `yarn`
* Chave de API do [Google Maps Platform](https://developers.google.com/maps)
* Instância do PostgreSQL configurada

### Instalação

```bash
# Clone o repositório
git clone https://github.com/<usuario>/<repositorio>.git
cd <repositorio>

# Instale as dependências do frontend
cd frontend
npm install

# Instale as dependências do backend
cd ../backend
npm install
```

### Variáveis de Ambiente

Crie um arquivo `.env` no backend com base no `.env.example`:

```env
# backend/.env
DATABASE_URL=postgresql://usuario:senha@localhost:5432/patrimonio_guarulhos
PORT=3333
```

### Configuração do Prisma

Após configurar a variável `DATABASE_URL`, execute:

```bash
npx prisma generate
```

Para criar/aplicar as migrations durante o desenvolvimento:

```bash
npx prisma migrate dev
```

### Executando em desenvolvimento

```bash
# Backend
cd backend
npm run dev
```

O backend estará disponível em:

```text
http://localhost:3333
```

Para executar o frontend, utilize o procedimento definido no README do respectivo repositório.

---

## 📂 Estrutura do Projeto

```text
patrimonio-guarulhos/
├── frontend/
│   ├── src/
│   │   ├── components/     # Componentes reutilizáveis de UI
│   │   ├── pages/          # Páginas (Home, Detalhes, Dashboard)
│   │   ├── services/       # Integração com API (axios)
│   │   ├── styles/         # CSS modular / variáveis globais
│   │   └── App.jsx
│   └── package.json
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── middlewares/
│   │   ├── routes/
│   │   ├── utils/
│   │   ├── app.js
│   │   └── server.js
│   ├── prisma/
│   │   ├── migrations/
│   │   └── schema.prisma
│   └── package.json
└── README.md
```

### ⚙️ Backend

```text
src/
├── config/       # Configurações globais (banco de dados, env)
├── controllers/  # Tratamento de requisições e respostas HTTP
├── services/     # Regras de negócio e lógica da aplicação
├── middlewares/  # Interceptadores (validação, upload, auth, erros)
├── routes/       # Mapeamento e declaração dos endpoints REST
├── utils/        # Auxiliares genéricos do servidor
├── app.js        # Configuração dos middlewares do Express
└── server.js     # Inicialização do servidor HTTP
```

| Diretório / Pasta | Responsabilidade Principal | Exemplos de Arquivos |
|---|---|---|
| `src/config/` | Gerencia e centraliza as conexões com bancos de dados, chaves de API e a validação de variáveis de ambiente. | `database.js`, `env.js` |
| `src/controllers/` | Entrada HTTP: extrai parâmetros (`req.body`/`req.params`), aciona a camada de serviço e retorna JSON (`res.json()`). | `patrimonioController.js`, `sugestaoController.js` |
| `src/services/` | Concentra todas as regras de negócio da aplicação, validações de domínio e orquestração de persistência. | `patrimonioService.js`, `sugestaoService.js` |
| `src/middlewares/` | Intercepta requisições HTTP para checagens de segurança, validação, uploads e tratamento de erros. | `uploadMiddleware.js`, `errorMiddleware.js` |
| `src/routes/` | Mapeia os endpoints REST e conecta as rotas HTTP aos respectivos métodos dos controllers. | `patrimonioRoutes.js`, `sugestaoRoutes.js` |
| `src/utils/` | Reúne funções auxiliares reutilizáveis no servidor. | `emailHelper.js`, `logger.js` |
| `prisma/` | Contém o schema e as migrations responsáveis pela estrutura do banco de dados. | `schema.prisma`, `migrations/` |

---

## 🗺️ Roadmap

* [ ] Cadastro e edição de patrimônios via painel administrativo
* [ ] Upload de imagens e documentos históricos
* [ ] Filtros avançados por bairro, época e categoria
* [ ] Dashboard estatístico com exportação de relatórios
* [ ] Versão mobile-first / PWA

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Para contribuir:

1. Faça um fork do projeto
2. Crie uma branch para sua feature:

```bash
git checkout -b feature/nova-funcionalidade
```

3. Faça suas alterações
4. Commit suas alterações:

```bash
git commit -m "Adiciona nova funcionalidade"
```

5. Envie para o repositório:

```bash
git push origin feature/nova-funcionalidade
```

6. Abra um Pull Request.

---

## 📄 Licença

Este projeto está sob a licença MIT. Consulte o arquivo `LICENSE` para mais detalhes.

---

## 👥 Autores

Desenvolvido como parte de um projeto acadêmico voltado à valorização do patrimônio histórico e cultural de Guarulhos.
