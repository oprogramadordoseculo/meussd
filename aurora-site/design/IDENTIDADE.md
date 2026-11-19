# Aurora Editorial

Histórias que acendem a noite. Este é o sistema visual dos cinco sites da Aurora Editorial: a página de vendas de cada livro (como anoiteeoluar.com.br), o site institucional, a vitrine, a página de serviços e o app do leitor.

A ideia central é a passagem da noite para a aurora: um céu escuro e calmo, onde a luz aparece aos poucos. O estilo é acolhedor, moderno e minimalista. Menos é mais: cada tela tem um único foco e muito espaço para respirar.

## Voz

- Fale como quem conta uma lembrança: frases curtas, imagens concretas, "você".
- Um pedido por bloco. Botões com verbo de ação: "Quero ler agora", "Ler o primeiro capítulo grátis".
- Evite: superlativos, urgência falsa, contagem regressiva, emoji, exclamações em série.

## Cores

Dois temas. **Noite** é o principal: topos de página, app do leitor e páginas de venda. **Clara** entra nas seções de leitura longa (sinopse, FAQ), nas páginas legais e para quem prefere fundo claro.

- `fundo` e `superficie` formam a base. Nunca use preto puro: a noite da Aurora é azul-marinho.
- `ceu` é o mesmo azul profundo nos dois temas. Use em faixas de destaque e no topo das páginas, inclusive no tema claro, para que todo site abra "à noite".
- As três cores da aurora (`aurora-verde`, `aurora-azul`, `aurora-violeta`) aparecem juntas apenas na **faixa de aurora**: uma ou duas ondas desfocadas no topo da página, atrás do título, com opacidade baixa. Fora dela, só `aurora-verde` (ação) aparece com frequência.
- `aurora-verde` é exclusiva de ação: botão principal, link ativo, barra de progresso de leitura. Texto sobre ela usa `sobre-acao`.
- `luar` é a lua: trechos do livro, citações e o selo de lançamento. Use pouco, para continuar especial.
- `erro` só em mensagens de erro. Não existe vermelho decorativo.
- Foco do teclado: anel de 2px em `aurora-violeta`, afastado 2px do elemento.

Todos os pares de texto passam 4.5:1 nos dois temas (verificado): `tinta` e `tinta-suave` sobre `fundo` e `superficie`; `aurora-verde` sobre `fundo`; `sobre-acao` sobre `aurora-verde`; `luar` sobre `fundo` e `ceu`.

## Tipografia

Três famílias do Google Fonts, cada uma com um papel:

- **Cormorant Garamond** (`display`): títulos. Literária, elegante, com cara de capa de livro. Só em tamanhos grandes (28px ou mais).
- **Source Serif 4** (`serif`): leitura. Trechos, sinopse, frase de abertura em itálico e todo o texto do livro no app do leitor.
- **Manrope** (`sans`): interface. Botões, menus, preços, formulários, selos em maiúsculas.

Medida de leitura de no máximo 65 caracteres por linha. Títulos com `text-wrap: balance`. No celular, `display` cai para 40/44 e `titulo-1` para 32/38.

## Forma

- Botões principais em pílula (`radius-full`), com `space-4` de padding vertical e altura mínima de 48px para o dedo.
- Cartões de trecho com o **canto assimétrico**: `radius-lg` no alto à esquerda e embaixo à direita, `radius-sm` nos outros dois. Lembra uma página virando.
- Cartões comuns: `radius-md`, borda de 1px em `linha`, sem sombra no tema noite.
- Linhas finas de 1px em `linha` para separar blocos; nunca bordas grossas.
- Espaço generoso: `space-24` entre seções no computador, `space-16` no celular.

## Imagens

- Capa do livro sempre com sombra suave (`sombra-cartao`) e leve inclinação apenas no topo da página de vendas.
- Foto do autor: recorte redondo (`radius-full`) na home e retrato com `radius-md` na página do autor. Tratamento levemente frio para conversar com a noite.
- Fotos de fundo: céu noturno, luar, janelas iluminadas. Nunca banco de imagens com pessoas sorrindo para a câmera.
- Nada de texto importante dentro de imagens: o Google não lê e não dá para traduzir.

## Ícones

Traço linear de 1.5px, cantos arredondados, desenhados em `currentColor`. Biblioteca sugerida: Lucide. Ícones da casa: lua crescente (lançamento, modo noite), estrela (marcador de leitura), livro aberto (app do leitor). Sem emoji.

## Movimento

Pouco e lento. A faixa de aurora ondula devagar (ciclo de 20 segundos). Blocos entram com fade de 300ms. Tudo para quando o visitante pede menos movimento (`prefers-reduced-motion`).

## Logo

O logo atual da Aurora Editorial ainda não foi carregado neste sistema. Até lá, o nome é escrito em Cormorant Garamond 600, com "Aurora" em `tinta` e "Editorial" em `tinta-suave`.

## Aplicação por site

| Site | Tema de abertura | Cor de ação | Destaque |
| --- | --- | --- | --- |
| anoiteeoluar.com.br | Noite, com faixa de aurora | aurora-verde | Capa grande e barra fixa de compra |
| auroraeditorial.com.br | Noite no topo, Clara no meio | aurora-verde | Manifesto em Cormorant grande |
| loja.auroraeditorial.com.br | Clara, topo em ceu | aurora-verde | Grade de capas |
| servicos.auroraeditorial.com.br | Clara, topo em ceu | aurora-verde | Etapas do processo e formulário |
| leitor.auroraeditorial.com.br | Noite (com opção Clara e Sépia) | aurora-verde | Texto em Source Serif 4, sem distrações |
