# 💾 MeuSSD

Servidor pessoal de arquivos que roda no celular (Termux) e é acessado pelo navegador
de qualquer aparelho na mesma rede Wi‑Fi: computador, outro celular, tablet.

## Recursos

- Galeria com miniaturas de fotos e vídeos, e visualização em grade ou lista
- Player de vídeo e visualizador de fotos no próprio navegador, com avanço e retorno por gesto
- Envio de vários arquivos de uma vez, com barra de progresso (no computador, é só arrastar)
- Criar pasta, renomear, mover, copiar, baixar, apagar e selecionar vários itens
- Lixeira: o que você apaga pode ser restaurado
- Busca em todo o MeuSSD
- Download de vídeo por link (Facebook, Instagram, YouTube, TikTok…) com `yt-dlp`
- Vigia de Downloads: move sozinho fotos e vídeos de `Download` para `MeuSSD/Imagens` e `MeuSSD/Videos`
- Acesso protegido por senha
- Atende vários aparelhos ao mesmo tempo (servidor Waitress)

Os arquivos ficam em `Armazenamento interno/MeuSSD`, que aparece na galeria e no gerenciador de arquivos do Android.

## Instalação no Termux

```bash
pkg update && pkg upgrade
pkg install python git ffmpeg python-pillow
termux-setup-storage
git clone -b claude/personal-file-manager-h9ak6h https://github.com/oprogramadordoseculo/meussd.git
cd meussd
pip install -r requirements.txt
```

- `ffmpeg` gera as miniaturas dos vídeos e junta áudio e vídeo nos downloads por link.
- `python-pillow` gera as miniaturas das fotos.
- Instale também o app **Termux:API** (F-Droid) e rode `pkg install termux-api` para receber notificações.

## Uso

```bash
./iniciar.sh          # liga em segundo plano
./iniciar.sh parar    # desliga
./iniciar.sh log      # acompanha o log
```

Ao ligar, aparecem dois endereços:

- neste celular: `http://localhost:9000`
- nos outros aparelhos: `http://192.168.x.x:9000`

No primeiro acesso você cria a senha.

### Trazer os arquivos da versão antiga

O vigia antigo guardava os arquivos em `~/MeuSSD`, uma pasta interna do Termux que a galeria não enxerga.
Para trazer esses arquivos para o lugar novo:

```bash
python app.py --migrar
```

## Usar no computador

**Abrir os arquivos do celular no PC:** com o MeuSSD ligado no celular e os dois na mesma rede Wi‑Fi,
abra no navegador do PC o endereço "outros aparelhos" que aparece ao ligar (ex.: `http://192.168.x.x:9000`).
Para enviar arquivos, é só arrastar para a janela.

**Rodar o MeuSSD no próprio PC (Linux):**

```bash
sudo apt install python3-pip ffmpeg      # ffmpeg é opcional (miniaturas de vídeo)
git clone -b claude/personal-file-manager-h9ak6h https://github.com/oprogramadordoseculo/meussd.git
cd meussd
pip install -r requirements.txt pillow
bash iniciar.sh                          # ou: python3 app.py
```

No PC os arquivos ficam em `~/MeuSSD` e o vigia observa `~/Downloads`
(as fotos e os vídeos baixados vão sozinhos para `~/MeuSSD/Imagens` e `~/MeuSSD/Videos`).
Para pausar o vigia, use o interruptor no menu ☰. No Windows, instale o Python e rode `python app.py`.

## Para o Android não desligar o servidor

1. O `iniciar.sh` já usa `termux-wake-lock`.
2. Em Configurações → Apps → Termux → Bateria, escolha **Sem restrições**.
3. No Android 12 ou mais novo, se o servidor ainda morrer sozinho, desative o "phantom process killer"
   (veja como na wiki do Termux).

## Configuração opcional (variáveis de ambiente)

| Variável | Padrão | Para quê |
|---|---|---|
| `MEUSSD_DIR` | `~/storage/shared/MeuSSD` (PC: `~/MeuSSD`) | pasta principal |
| `MEUSSD_DOWNLOADS` | `~/storage/downloads` (PC: `~/Downloads`) | pasta observada pelo vigia |
| `MEUSSD_PORTA` | `9000` | porta |
| `MEUSSD_SEM_SENHA` | — | `1` desliga a senha |

Para trocar a senha, apague `~/.meussd/config.json` e reinicie; no próximo acesso você cria uma nova.
