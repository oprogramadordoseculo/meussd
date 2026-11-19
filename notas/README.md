# ✎ Minhas Notas

Bloco de notas que sincroniza entre os celulares e o PC pela sua conta Google (Firebase).
Funciona offline, instala na tela inicial como aplicativo e guarda tudo em Markdown.

## Recursos

- **Sincronização** entre todos os aparelhos em tempo real; sem internet, salva no aparelho e envia depois
- **Markdown com prévia**: escrever, lado a lado (no PC) ou modo leitura
- **Barra de formatação**: títulos, negrito, listas, tarefas, citação, código, link
- **Tarefas clicáveis** (`- [ ]`), com contador de concluídas
- **Ligação entre notas** com `[[Título da nota]]`; mostra também onde cada nota é citada
- **Etiquetas** com `#filosofia`, `#livro`… e filtro por etiqueta
- **Cadernos**, notas fixadas, arquivo e lixeira (30 dias)
- **Nota a partir de link**: cole o endereço de uma página e o texto vira nota, com a fonte
- **Importar** arquivos `.txt`/`.md` ou **colar várias notas de uma vez**
- **Exportar** tudo em `.zip` (um `.md` por nota, organizados por caderno)
- **Modo foco** para escrita longa, fonte serifada, tema claro/escuro, contador de palavras e tempo de leitura
- Código com cores (`python`, `js`, `bash`…)
- Atalhos no PC: `Alt+N` nova nota · `/` buscar · `Ctrl+E` ler/escrever · `F11` foco · `Ctrl+B/I/K`

Sem configurar o Firebase, o app funciona em **modo local** (só no navegador em que foi aberto). Serve para experimentar.

---

## Configuração (uma vez só, cerca de 15 minutos)

### 1. Criar o projeto no Firebase

1. Acesse <https://console.firebase.google.com> com sua conta Google.
2. **Criar um projeto** → nome `minhas-notas` → pode desativar o Google Analytics → **Criar**.

### 2. Ligar o login

1. Menu **Criação → Authentication → Vamos começar**.
2. Em **Método de login**, ative **Google** (escolha seu e-mail de suporte) e salve.
3. Opcional: ative também **E-mail/senha**.

### 3. Criar o banco de dados

1. Menu **Criação → Firestore Database → Criar banco de dados**.
2. Local: `southamerica-east1 (São Paulo)` → **Iniciar no modo de produção** → **Criar**.
3. Aba **Regras**: apague tudo, cole o conteúdo do arquivo `firestore.rules` e clique em **Publicar**.
   Essas regras garantem que só você lê e escreve as suas notas.

### 4. Pegar a configuração do app

1. Clique na engrenagem ⚙️ → **Configurações do projeto**.
2. Em **Seus apps**, clique no ícone **`</>`** (Web) → apelido `notas` → **Registrar app**.
3. Copie os valores mostrados em `firebaseConfig` para o arquivo **`js/config.js`**, trocando o `COLE_AQUI`:

```js
export const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "minhas-notas-xxxx.firebaseapp.com",
  projectId: "minhas-notas-xxxx",
  storageBucket: "minhas-notas-xxxx.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123",
};
```

> A `apiKey` do Firebase não é uma senha: ela pode ficar visível. Quem protege as notas são as regras do passo 3.

### 5. Colocar o app na internet

O jeito mais simples, sem instalar nada, é o **Netlify Drop**:

1. Acesse <https://app.netlify.com/drop> e crie uma conta grátis (pode usar o Google).
2. Arraste a pasta **`notas`** inteira para a página.
3. Ele gera um endereço como `https://nome-aleatorio.netlify.app`. Em *Site configuration → Change site name* você troca por algo como `edmar-notas`.
4. **Importante:** no Firebase, vá em **Authentication → Configurações → Domínios autorizados → Adicionar domínio** e cole o endereço **sem** `https://` (ex.: `edmar-notas.netlify.app`).

Para atualizar o app depois: em *Deploys*, arraste a pasta de novo.

<details>
<summary>Alternativa: Firebase Hosting (pelo terminal do PC)</summary>

Precisa do Node.js 18 ou mais novo.

```bash
npm install -g firebase-tools
firebase login
cd notas
firebase use --add          # escolha o projeto criado
firebase deploy
```

O endereço fica `https://SEU-PROJETO.web.app`, que já vem autorizado no login.
</details>

### 6. Instalar nos aparelhos

Abra o endereço no **Chrome** de cada aparelho e entre com a **mesma conta Google**.

- **Celular:** menu ⋮ → **Adicionar à tela inicial** (ou **Instalar app**).
- **PC:** ícone de instalar na barra de endereço, ou menu ⋮ → **Transmitir, salvar e compartilhar → Instalar página como app**.

---

## Trazer as notas do app da Motorola

O app da Motorola não exporta tudo de uma vez. Dois caminhos:

- **Várias de uma vez:** no app da Motorola, copie o texto de cada nota e junte num lugar só, separando uma da outra com uma linha `---`.
  Depois, no Minhas Notas: menu **⋯ → Colar várias notas de uma vez**. A primeira linha de cada nota vira o título.
- **Uma por uma:** na nota da Motorola, toque em **Compartilhar → Copiar**; no Minhas Notas, crie uma nota e cole.

Se o app da Motorola salvar arquivos `.txt`, use **⋯ → Importar arquivos**.

## Sobre a nota a partir de link

O texto da página é lido pelo serviço gratuito **r.jina.ai**, que recebe o endereço da página para extrair o texto.
Páginas que exigem login, como posts privados do Facebook, não podem ser lidas.

## Arquivos

| Arquivo | Para quê |
|---|---|
| `index.html`, `estilo.css` | tela e visual |
| `js/app.js` | funcionamento do app |
| `js/armazenamento.js` | Firebase (nuvem) e modo local |
| `js/config.js` | **sua** configuração do Firebase |
| `firestore.rules` | regras de segurança do banco |
| `sw.js`, `manifest.webmanifest`, `icone.svg` | instalação como app e uso offline |
