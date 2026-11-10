<p align="center">
  <img src="assets/icons/icon-128.png" alt="My New Tab Logo" width="88" />
</p>

<h1 align="center">My New Tab</h1>

Extensão **Manifest V3** para **Microsoft Edge** e **Google Chrome** que redefine a experiência de Nova Guia: permite escolher seu buscador tradicional ou assistente de IA preferido como página inicial, mantendo uma **barra de favoritos inteligente, ultrarrápida e visualmente nativa** ao navegador.



## Objetivo do Projeto

Nos navegadores baseados em Chromium (especialmente no Microsoft Edge), alterar a página de Nova Guia para um buscador externo (como Google ou DuckDuckGo) sempre trouxe três problemas clássicos:
1. **Perda da barra de favoritos inteligente**: a função nativa de *"Mostrar barra de favoritos somente na Nova Guia"* deixa de funcionar porque o navegador não reconhece a URL do buscador como a Home oficial da Microsoft/Google.
2. **Fragmentação e lentidão**: era necessário instalar uma extensão específica para cada buscador (se existir), sofrendo com telas brancas de redirecionamento e outros problemas de usabilidade.
3. **Poluição visual**: extensões de barra de favoritos costumam parecer elementos artificiais "colados" por cima da página, quebrando cabeçalhos fixos ou piscando cores diferentes entre a tela inicial e a página de resultados.

O **My New Tab** nasceu para resolver esses pontos de ponta a ponta sob uma máxima inegociável:

> **"A extensão deve parecer parte nativa do navegador, ela nunca deve lembrar o usuário, no dia a dia, de que ali existe uma extensão rodando."**

### Tecnologias e Stacks Utilizadas
- **JavaScript (ES6+ / Vanilla JS)** — Zero dependências externas, garantindo execução instantânea em `document_start`.
- **WebExtensions API (Manifest V3)** — `tabs`, `bookmarks`, `storage`, `favicon`, `alarms` e *Service Worker* assíncrono.
- **Shadow DOM (`closed`) & CSS3 Fluent UI** — Isolamento completo de estilo e DOM com estética nativa do Edge/Windows 11 (`backdrop-filter: blur`, tipografia de sistema e variáveis dinâmicas).
- **Speculation Rules API & Resource Hints** — Pré-renderização nativa do Chromium e aquecimento de conexões HTTP/3 + TLS.



## Vibe Coding com Arquitetura Intencionalmente Humana

Este projeto foi desenvolvido utilizando o **Gemini 4 Argon** dentro do ambiente **Antigravity**.

Mais do que gerar código rápido, a metodologia adotada aqui foi o **Vibe Coding guiado por arquitetura e direção de produto intencionalmente humanas**. Nenhuma decisão de experiência do usuário, fluxo de estado ou critério de segurança veio "No piloto automático" da IA: cada princípio — desde a psicologia visual de como a barra memoriza o tema na primeira abertura para nunca piscar nas próximas, até a não-sobreposição de layouts e o nível de blindagem de segurança — foi arquitetado, especificado, testado e exigido pelo desenvolvedor, usando a IA como força de execução e auditoria técnica.



## Mecanismos e Princípios de Engenharia Adotados

### 1. Hub de Buscadores Tradicionais e Homes de IA
No menu da barra (**Mais opções → Definir buscador padrão**), o usuário alterna instantaneamente sua Home entre duas categorias separadas visualmente:
- **Buscadores Tradicionais**: Google, DuckDuckGo, Yahoo Search e Brave Search.
- **Assistentes de IA**: Google Gemini, Claude, ChatGPT e Perplexity.

A extensão identifica de forma inteligente quando o usuário está na **Home** (início da busca ou tela de novo chat nas IAs) versus quando já iniciou uma pesquisa ou conversa, permitindo configurar a visibilidade da barra como:
- **Mostrar somente no início** (fica fixa na Home e recolhe automaticamente nos resultados/respostas do chat);
- **Sempre mostrar** (fixa tanto na Home quanto nos resultados/chats);
- **Nunca mostrar** (recolhida, revelando-se suavemente apenas ao encostar o cursor no topo da tela).

### 2. Aceleração da Home em 3 Camadas + Foco Limpo na Página
Para eliminar o atraso típico de extensões de redirecionamento e o bug nativo do Chromium que seleciona toda a URL na barra de endereço ao abrir uma Nova Guia:
- **Camada 1 — Interceptação Instantânea e Guia Limpa (`openCleanNewTab`)**: O *Service Worker* intercepta o evento `chrome.tabs.onCreated` em `0ms`, instancia a guia diretamente com a URL de destino e encerra a guia de gatilho da Nova Aba. Isso faz o Chromium entregar o foco diretamente ao campo de busca/prompt da página, sem selecionar a barra de endereço (*Omnibox*).
- **Camada 2 — Pre-warming de Rede**: Um alarme leve mantém o DNS, o *handshake* TLS e o socket HTTP/3 aquecidos para o buscador escolhido (podendo ser desativado a qualquer momento na opção **Aceleração da Home**).
- **Camada 3 — Speculation Rules API**: Ao navegar para páginas de resultados, a extensão injeta regras de `prerender` nativas para que o retorno à Home seja imediato.

### 3. Consistência de Cor e Tema entre Telas (Zero Flicker)
Mecanismos como o Google usam tons específicos de cinza-azulado no modo escuro, enquanto o DuckDuckGo usa preto puro. Para evitar que a barra pisque ao transitar da Home para a página de resultados:
- **1ª Abertura**: A página carrega, a extensão extrai a cor real renderizada e a luminância da página, aplica à barra e memoriza o par `{ theme, bgBar }` para aquele mecanismo específico.
- **Próximas Aberturas**: Antes mesmo da página renderizar (`document_start`), a barra já nasce com o tema e cor exatos memorizados. Somente após a estabilização completa do carregamento (`load` + `150ms`) a extensão valida se o usuário trocou o tema do site — garantindo fluidez absoluta no uso diário.

### 4. Layout Não-Intrusivo e Compatibilidade Multi-Navegador
- **Empurrar em vez de Sobrepor**: Quando a barra está fixa no topo, ela reserva `34px` reais acima da página e ajusta dinamicamente cabeçalhos `fixed`/`sticky` durante a rolagem, restaurando o posicionamento original assim que o usuário retorna ao topo da página de resultados.
- **Detecção Automática Edge / Chrome**: Na primeira inicialização, a extensão detecta automaticamente o navegador para configurar o atalho **Editar favoritos...** para `edge://favorites/` no Microsoft Edge ou `chrome://bookmarks/` no Google Chrome, sem qualquer custo de performance.

### 5. Clipboard Inteligente (Sensível ao Contexto e ao Mecanismo)
Ativo por padrão e arquitetado em arquivo dedicado (`smart-clipboard.js`) por transparência, o recurso analisa localmente e de forma assíncrona novos itens copiados pelo usuário para oferecer ações rápidas em cápsulas iluminadas no centro da barra — sem jamais enviar dados para servidores externos. Em **Mais opções → Personalizar**, o usuário configura abertura (nova guia ou guia atual), serviços preferidos, quais categorias deseja receber e o atalho rápido:
- **Categorias Inteligentes**:
  - `Site`: identifica URLs puras ou inseridas em mensagens curtas e oferece abertura rápida.
  - `Mapa`: extrai endereços físicos puros ou dentro de frases conversacionais (ex: *"me encontre aqui na av. marechal castelo branco"*) e abre diretamente no provedor escolhido (**Google Maps**, **Bing Maps** ou **Apple Maps**).
  - `Code`: identifica trechos de código-fonte com detecção generalista de alta precisão nas primeiras linhas (Python, Java, Go, HTML, CSS, JavaScript, SQL e linguagens similares, sem custo de memória em arquivos grandes) e sugere colar **exclusivamente** quando o mecanismo ativo é uma IA.
  - `Dicionário` + `Colar` (Palavra única): ao copiar uma única palavra, exibe duas cápsulas lado a lado para consultar no dicionário preferido (**Dicio**, **Sinônimos** ou **Linguee**) ou colar diretamente no buscador/IA.
  - `Colar`: diferencia automaticamente pesquisas curtas/médias de buscadores (respeitando o limite técnico de 32 palavras do Google) de prompts elaborados e textos extensos/artigos (compreendidos já nas primeiras linhas sem custo de memória e oferecidos exclusivamente para ferramentas de IA, nunca em buscadores convencionais).
- **Atalho Rápido (`Espaço 2x`), Colagem Não-Destrutiva e Memória de Análise**: Sem nenhum campo de texto focado, pressionar **Espaço duas vezes** aciona instantaneamente a sugestão exibida (ou sinaliza sutilmente quando há duas opções para escolha). Ao colar no buscador ou na IA, o texto já digitado é sempre preservado ao início sem envio automático, e apenas uma assinatura hash (`FNV-1a`) é salva para nunca repetir a mesma sugestão ou gravar textos copiados em disco.



## Segurança Aplicada (Security by Design)

O código passou por auditoria dedicada de segurança em múltiplas camadas para garantir proteção mesmo em ambientes exigentes:
- **Isolamento via Shadow DOM (`mode: "closed"`)**: Impede que scripts das páginas hospedeiras inspecionem a árvore DOM da barra ou leiam os favoritos do usuário.
- **Restrição Estrita a `https://` e CSP Explícita**: Todas as permissões de host e *content scripts* no `manifest.json` operam exclusivamente sob `https://` (mitigando injeção em redes Wi-Fi públicas/MITM), acompanhadas de *Content Security Policy* restritiva (`script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none';`).
- **Anti-Fingerprinting (`use_dynamic_url: true`)**: Recursos internos de ícones utilizam tokens dinâmicos por sessão para impedir que sites externos detectem a presença da extensão.
- **Sanitização de Dados e IPC**: Validação estrita de protocolos (`http:` / `https:`) bloqueando URLs `javascript:` ou `data:`, validação numérica via Regex de cores `rgba()`, verificação de origem `sender.id === chrome.runtime.id` no *Service Worker* e contenção de timers/listeners contra vazamento de memória (*Memory Leaks*).



## Como instalar a extensão localmente

> **⚠️ Importante:** Enquanto o **My New Tab** ainda não está disponível nas lojas oficiais de extensões (*Microsoft Edge Add-ons* e *Chrome Web Store*), é necessário realizar a instalação manual ativando o **Modo do desenvolvedor** no seu navegador conforme o passo a passo abaixo.

### 1. Clonar ou baixar o repositório
```bash
git clone https://github.com/guisilvs/MyNewTab.git
```
*(Ou baixe o arquivo `.zip` do repositório e extraia em uma pasta de sua preferência).*

### 2. Instalar no Microsoft Edge
1. Na barra de endereços do Edge, digite `edge://extensions/` e pressione **Enter**.
2. No menu lateral esquerdo (ou canto superior), ative a chave **Modo do desenvolvedor** (*Developer mode*).
3. Clique no botão **Carregar sem pacote** (*Load unpacked*) que aparecerá no topo.
4. Selecione a pasta raiz do projeto (`MyNewTab`).
5. Caso o Edge exiba um aviso informando que a extensão alterou a Nova Guia, clique em **Manter alterações** / **Ativar** para confirmar.

### 3. Instalar no Google Chrome
1. Na barra de endereços do Chrome, digite `chrome://extensions/` e pressione **Enter**.
2. No canto superior direito, ative a chave **Modo do desenvolvedor** (*Developer mode*).
3. Clique no botão **Carregar sem compactação** (*Load unpacked*) no canto superior esquerdo.
4. Selecione a pasta raiz do projeto (`MyNewTab`).



## Autor

Criado por **Guilherme Silveira**
- **LinkedIn**: [@guisilveira01](https://www.linkedin.com/in/guisilveira01/)
- **GitHub**: [@guisilvs](https://github.com/guisilvs)
