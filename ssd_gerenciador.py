#!/usr/bin/env python3
"""
SSD Wireless - Gerenciador de Arquivos
Roda no Termux — acesse pelo navegador em http://localhost:9000
Autor: para Edmar (Aurora Editorial)
"""

import http.server
import socketserver
import os
import shutil
import json
import urllib.parse
import cgi
import io
from pathlib import Path
from datetime import datetime

PORT = 9000
BASE_PATH = Path.home() / "storage" / "shared" / "MeuSSD"

# ──────────────────────────────────────────────
# Categorias padrão (você pode adicionar mais)
# ──────────────────────────────────────────────
CATEGORIAS_PADRAO = [
    "Trabalho",
    "Site",
    "Aplicativos",
    "Editora",
    "Pessoal",
    "Videos",
    "Imagens",
]

# ──────────────────────────────────────────────
# Utilitários
# ──────────────────────────────────────────────

def tamanho_legivel(bytes_val):
    for unit in ["B", "KB", "MB", "GB"]:
        if bytes_val < 1024:
            return f"{bytes_val:.1f} {unit}"
        bytes_val /= 1024
    return f"{bytes_val:.1f} TB"

def info_disco():
    try:
        total, usado, livre = shutil.disk_usage(str(BASE_PATH))
        return {
            "total": tamanho_legivel(total),
            "usado": tamanho_legivel(usado),
            "livre": tamanho_legivel(livre),
            "percent": round((usado / total) * 100),
        }
    except:
        return {"total": "?", "usado": "?", "livre": "?", "percent": 0}

def listar_pasta(caminho: Path):
    itens = []
    try:
        for entry in sorted(caminho.iterdir(), key=lambda e: (e.is_file(), e.name.lower())):
            stat = entry.stat()
            itens.append({
                "nome": entry.name,
                "tipo": "arquivo" if entry.is_file() else "pasta",
                "tamanho": tamanho_legivel(stat.st_size) if entry.is_file() else "",
                "modificado": datetime.fromtimestamp(stat.st_mtime).strftime("%d/%m/%Y %H:%M"),
                "extensao": entry.suffix.lower() if entry.is_file() else "",
            })
    except PermissionError:
        pass
    return itens

def caminho_seguro(rel_path: str) -> Path:
    """Garante que o caminho não saia da BASE_PATH"""
    tentativa = (BASE_PATH / rel_path.lstrip("/")).resolve()
    if not str(tentativa).startswith(str(BASE_PATH.resolve())):
        raise ValueError("Caminho inválido")
    return tentativa

# ──────────────────────────────────────────────
# HTML da interface
# ──────────────────────────────────────────────

def html_pagina(pasta_atual: str, itens: list, disco: dict, caminho_relativo: str):
    partes = [p for p in caminho_relativo.split("/") if p]
    breadcrumb = '<a href="/">🏠 MeuSSD</a>'
    acumulado = ""
    for parte in partes:
        acumulado += "/" + parte
        breadcrumb += f' / <a href="/?pasta={urllib.parse.quote(acumulado)}">{parte}</a>'

    linhas_itens = ""
    for item in itens:
        icone = _icone(item)
        nome_enc = urllib.parse.quote(item["nome"])
        rel_item = (caminho_relativo + "/" + item["nome"]).lstrip("/")
        rel_enc = urllib.parse.quote(rel_item)

        if item["tipo"] == "pasta":
            link = f'<a href="/?pasta=/{rel_item}" class="link-pasta">{icone} {item["nome"]}</a>'
            tamanho_col = "—"
        else:
            link = f'<span class="nome-arquivo">{icone} {item["nome"]}</span>'
            tamanho_col = item["tamanho"]

        linhas_itens += f"""
        <tr>
          <td>{link}</td>
          <td class="col-tam">{tamanho_col}</td>
          <td class="col-data">{item["modificado"]}</td>
          <td class="col-acoes">
            <form method="post" action="/renomear" style="display:inline"
                  onsubmit="return confirmarRenomear(this)">
              <input type="hidden" name="pasta_atual" value="{urllib.parse.quote(caminho_relativo)}">
              <input type="hidden" name="nome_original" value="{nome_enc}">
              <button type="submit" class="btn-acao btn-editar" title="Renomear">✏️</button>
            </form>
            <form method="post" action="/excluir"  style="display:inline"
                  onsubmit="return confirm('Excluir \"{item["nome"]}\"?')">
              <input type="hidden" name="pasta_atual" value="{urllib.parse.quote(caminho_relativo)}">
              <input type="hidden" name="nome" value="{nome_enc}">
              <button type="submit" class="btn-acao btn-excluir" title="Excluir">🗑️</button>
            </form>
          </td>
        </tr>"""

    barra = round(disco["percent"])
    cor_barra = "#00cc66" if barra < 70 else ("#ffaa00" if barra < 90 else "#ff4444")

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MeuSSD</title>
<style>
  :root {{
    --bg: #0f0f1a; --card: #1a1a2e; --borda: #2a2a4a;
    --verde: #00cc66; --azul: #4488ff; --texto: #e0e0f0;
    --cinza: #888; --danger: #ff4455;
  }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ background: var(--bg); color: var(--texto); font-family: 'Segoe UI', system-ui, sans-serif; padding: 16px; }}
  h1 {{ font-size: 1.3rem; color: var(--verde); margin-bottom: 4px; }}
  .disco {{ background: var(--card); border-radius: 10px; padding: 12px 16px; margin-bottom: 16px; }}
  .disco-linha {{ display: flex; justify-content: space-between; font-size: .82rem; color: var(--cinza); margin-bottom: 6px; }}
  .barra-outer {{ background: var(--borda); border-radius: 99px; height: 8px; }}
  .barra-inner {{ height: 8px; border-radius: 99px; background: {cor_barra}; width: {barra}%; transition: width .4s; }}
  .breadcrumb {{ font-size: .9rem; margin-bottom: 14px; color: var(--cinza); }}
  .breadcrumb a {{ color: var(--azul); text-decoration: none; }}
  .acoes-topo {{ display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }}
  .btn {{ padding: 8px 14px; border: none; border-radius: 8px; cursor: pointer; font-size: .88rem; font-weight: 600; }}
  .btn-verde {{ background: var(--verde); color: #000; }}
  .btn-azul  {{ background: var(--azul);  color: #fff; }}
  .btn-cinza {{ background: var(--borda); color: var(--texto); }}
  .tabela-wrapper {{ overflow-x: auto; }}
  table {{ width: 100%; border-collapse: collapse; }}
  th {{ background: var(--card); padding: 10px 12px; text-align: left; font-size: .82rem; color: var(--cinza); border-bottom: 1px solid var(--borda); }}
  td {{ padding: 10px 12px; border-bottom: 1px solid var(--borda); font-size: .9rem; vertical-align: middle; }}
  tr:hover td {{ background: #ffffff08; }}
  .col-tam  {{ width: 90px;  color: var(--cinza); }}
  .col-data {{ width: 130px; color: var(--cinza); font-size: .8rem; }}
  .col-acoes {{ width: 80px; text-align: right; }}
  .link-pasta {{ color: var(--azul); text-decoration: none; font-weight: 600; }}
  .nome-arquivo {{ word-break: break-all; }}
  .btn-acao {{ background: none; border: none; cursor: pointer; font-size: 1rem; padding: 2px 4px; opacity: .7; }}
  .btn-acao:hover {{ opacity: 1; }}
  .vazio {{ text-align: center; padding: 40px; color: var(--cinza); }}
  .modal-overlay {{ display:none; position:fixed; inset:0; background:#0009; z-index:100; align-items:center; justify-content:center; }}
  .modal-overlay.ativo {{ display:flex; }}
  .modal {{ background: var(--card); border-radius: 14px; padding: 24px; min-width: 280px; max-width: 94vw; }}
  .modal h2 {{ margin-bottom: 16px; font-size: 1rem; }}
  .modal input, .modal select {{
    width: 100%; padding: 10px; border-radius: 8px;
    border: 1px solid var(--borda); background: var(--bg);
    color: var(--texto); font-size: 1rem; margin-bottom: 14px;
  }}
  .modal-btns {{ display: flex; gap: 10px; justify-content: flex-end; }}
  .upload-area {{ border: 2px dashed var(--borda); border-radius: 10px; padding: 20px; text-align: center; color: var(--cinza); margin-bottom: 14px; cursor: pointer; }}
  .upload-area:hover {{ border-color: var(--verde); color: var(--verde); }}
</style>
</head>
<body>

<h1>📱 MeuSSD</h1>

<div class="disco">
  <div class="disco-linha">
    <span>💾 Armazenamento</span>
    <span>{disco["usado"]} de {disco["total"]} usados · {disco["livre"]} livres</span>
  </div>
  <div class="barra-outer"><div class="barra-inner"></div></div>
</div>

<div class="breadcrumb">{breadcrumb}</div>

<div class="acoes-topo">
  <button class="btn btn-verde" onclick="abrirModal('modal-pasta')">📁 Nova pasta</button>
  <button class="btn btn-azul"  onclick="abrirModal('modal-upload')">⬆️ Enviar arquivo</button>
  {'<button class="btn btn-cinza" onclick="history.back()">← Voltar</button>' if partes else ""}
</div>

<div class="tabela-wrapper">
<table>
  <thead>
    <tr>
      <th>Nome</th><th>Tamanho</th><th>Modificado</th><th></th>
    </tr>
  </thead>
  <tbody>
    {''.join([linhas_itens]) if itens else '<tr><td colspan="4" class="vazio">📂 Pasta vazia</td></tr>'}
  </tbody>
</table>
</div>

<!-- Modal: Nova Pasta -->
<div class="modal-overlay" id="modal-pasta">
  <div class="modal">
    <h2>📁 Nova pasta</h2>
    <form method="post" action="/criar-pasta">
      <input type="hidden" name="pasta_atual" value="{urllib.parse.quote(caminho_relativo)}">
      <input type="text" name="nome" placeholder="Nome da pasta" autofocus required>
      <div class="modal-btns">
        <button type="button" class="btn btn-cinza" onclick="fecharModal('modal-pasta')">Cancelar</button>
        <button type="submit" class="btn btn-verde">Criar</button>
      </div>
    </form>
  </div>
</div>

<!-- Modal: Upload -->
<div class="modal-overlay" id="modal-upload">
  <div class="modal">
    <h2>⬆️ Enviar arquivo</h2>
    <form method="post" action="/upload" enctype="multipart/form-data">
      <input type="hidden" name="pasta_atual" value="{urllib.parse.quote(caminho_relativo)}">
      <div class="upload-area" onclick="document.getElementById('arquivo-input').click()">
        Toque aqui para escolher o arquivo
      </div>
      <input type="file" id="arquivo-input" name="arquivo" multiple
             style="display:none" onchange="mostrarArquivos(this)">
      <div id="nomes-arquivos" style="font-size:.85rem;color:var(--verde);margin-bottom:12px"></div>
      <div class="modal-btns">
        <button type="button" class="btn btn-cinza" onclick="fecharModal('modal-upload')">Cancelar</button>
        <button type="submit" class="btn btn-azul">Enviar</button>
      </div>
    </form>
  </div>
</div>

<!-- Modal: Renomear -->
<div class="modal-overlay" id="modal-renomear">
  <div class="modal">
    <h2>✏️ Renomear</h2>
    <form method="post" action="/renomear" id="form-renomear">
      <input type="hidden" name="pasta_atual" id="ren-pasta">
      <input type="hidden" name="nome_original" id="ren-original">
      <input type="text"   name="nome_novo" id="ren-novo" placeholder="Novo nome" required>
      <div class="modal-btns">
        <button type="button" class="btn btn-cinza" onclick="fecharModal('modal-renomear')">Cancelar</button>
        <button type="submit" class="btn btn-verde">Salvar</button>
      </div>
    </form>
  </div>
</div>

<script>
function abrirModal(id) {{
  document.getElementById(id).classList.add('ativo');
}}
function fecharModal(id) {{
  document.getElementById(id).classList.remove('ativo');
}}
document.querySelectorAll('.modal-overlay').forEach(el => {{
  el.addEventListener('click', e => {{ if(e.target === el) fecharModal(el.id); }});
}});
function mostrarArquivos(input) {{
  const nomes = Array.from(input.files).map(f => f.name).join(', ');
  document.getElementById('nomes-arquivos').textContent = nomes;
}}
function confirmarRenomear(form) {{
  const original = decodeURIComponent(form.nome_original.value);
  const pasta = decodeURIComponent(form.pasta_atual.value);
  document.getElementById('ren-pasta').value = form.pasta_atual.value;
  document.getElementById('ren-original').value = form.nome_original.value;
  document.getElementById('ren-novo').value = original;
  document.getElementById('ren-novo').placeholder = 'Novo nome para: ' + original;
  abrirModal('modal-renomear');
  return false;  // não submete o form de renomear inline
}}
</script>
</body>
</html>"""

def _icone(item):
    if item["tipo"] == "pasta":
        return "📁"
    ext = item.get("extensao", "")
    mapa = {
        ".jpg": "🖼️", ".jpeg": "🖼️", ".png": "🖼️", ".webp": "🖼️", ".heic": "🖼️",
        ".mp4": "🎬", ".mkv": "🎬", ".avi": "🎬", ".mov": "🎬", ".3gp": "🎬",
        ".mp3": "🎵", ".wav": "🎵", ".ogg": "🎵", ".flac": "🎵",
        ".pdf": "📄", ".doc": "📝", ".docx": "📝", ".txt": "📝",
        ".py":  "🐍", ".sh": "⚙️", ".json": "📋", ".html": "🌐",
        ".zip": "📦", ".rar": "📦", ".tar": "📦", ".gz": "📦",
    }
    return mapa.get(ext, "📄")

# ──────────────────────────────────────────────
# Handler HTTP
# ──────────────────────────────────────────────

class GerenciadorHandler(http.server.BaseHTTPRequestHandler):

    def responder(self, codigo, corpo, tipo="text/html; charset=utf-8"):
        self.send_response(codigo)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(corpo) if isinstance(corpo, bytes) else len(corpo.encode())))
        self.end_headers()
        if isinstance(corpo, bytes):
            self.wfile.write(corpo)
        else:
            self.wfile.write(corpo.encode())

    def redirecionar(self, destino):
        self.send_response(303)
        self.send_header("Location", destino)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        pasta_rel = urllib.parse.unquote(params.get("pasta", [""])[0]).strip("/")

        try:
            pasta_abs = caminho_seguro(pasta_rel)
        except ValueError:
            self.responder(400, "<h1>Caminho inválido</h1>")
            return

        if not pasta_abs.exists():
            pasta_abs.mkdir(parents=True, exist_ok=True)

        if pasta_abs.is_file():
            # Download de arquivo
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Disposition", f'attachment; filename="{pasta_abs.name}"')
            self.send_header("Content-Length", str(pasta_abs.stat().st_size))
            self.end_headers()
            with open(pasta_abs, "rb") as f:
                shutil.copyfileobj(f, self.wfile)
            return

        itens = listar_pasta(pasta_abs)
        disco = info_disco()
        html = html_pagina(pasta_abs.name, itens, disco, "/" + pasta_rel if pasta_rel else "")
        self.responder(200, html)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        rota = parsed.path

        content_type = self.headers.get("Content-Type", "")
        content_length = int(self.headers.get("Content-Length", 0))
        corpo = self.rfile.read(content_length)

        if "multipart/form-data" in content_type:
            self._handle_multipart(rota, content_type, corpo)
        else:
            dados = urllib.parse.parse_qs(corpo.decode())
            self._handle_form(rota, dados)

    def _handle_form(self, rota, dados):
        def g(campo):
            return urllib.parse.unquote(dados.get(campo, [""])[0])

        pasta_atual_rel = g("pasta_atual").strip("/")

        try:
            pasta_abs = caminho_seguro(pasta_atual_rel)
        except ValueError:
            self.responder(400, "Caminho inválido"); return

        if rota == "/criar-pasta":
            nome = g("nome").strip()
            if nome:
                nova = pasta_abs / nome
                nova.mkdir(parents=True, exist_ok=True)
            self.redirecionar(f"/?pasta=/{pasta_atual_rel}")

        elif rota == "/excluir":
            nome = g("nome")
            alvo = pasta_abs / nome
            try:
                alvo_seg = caminho_seguro(pasta_atual_rel + "/" + nome)
                if alvo_seg.is_dir():
                    shutil.rmtree(alvo_seg)
                else:
                    alvo_seg.unlink()
            except (ValueError, FileNotFoundError):
                pass
            self.redirecionar(f"/?pasta=/{pasta_atual_rel}")

        elif rota == "/renomear":
            original = g("nome_original")
            novo = g("nome_novo").strip()
            if original and novo and original != novo:
                try:
                    origem = caminho_seguro(pasta_atual_rel + "/" + original)
                    destino = pasta_abs / novo
                    origem.rename(destino)
                except (ValueError, OSError):
                    pass
            self.redirecionar(f"/?pasta=/{pasta_atual_rel}")

        else:
            self.responder(404, "Rota não encontrada")

    def _handle_multipart(self, rota, content_type, corpo):
        # Parse manual do multipart para não depender de libs externas
        boundary = None
        for parte in content_type.split(";"):
            parte = parte.strip()
            if parte.startswith("boundary="):
                boundary = parte[9:].strip('"').encode()
                break

        if not boundary:
            self.responder(400, "Boundary não encontrado"); return

        # Extrai campo pasta_atual e arquivo(s)
        pasta_rel = ""
        arquivos = []

        delim = b"--" + boundary
        partes = corpo.split(delim)
        for bloco in partes:
            if b"\r\n\r\n" not in bloco:
                continue
            cabecalho_bytes, _, conteudo = bloco.partition(b"\r\n\r\n")
            cabecalho = cabecalho_bytes.decode("utf-8", errors="replace")
            # Remove o \r\n final do conteúdo
            if conteudo.endswith(b"\r\n"):
                conteudo = conteudo[:-2]

            if 'name="pasta_atual"' in cabecalho:
                pasta_rel = urllib.parse.unquote(conteudo.decode("utf-8", errors="replace")).strip("/")
            elif 'name="arquivo"' in cabecalho:
                nome_arquivo = ""
                for item_cab in cabecalho.split(";"):
                    item_cab = item_cab.strip()
                    if item_cab.startswith("filename="):
                        nome_arquivo = item_cab[9:].strip('"')
                if nome_arquivo:
                    arquivos.append((nome_arquivo, conteudo))

        try:
            pasta_abs = caminho_seguro(pasta_rel)
            pasta_abs.mkdir(parents=True, exist_ok=True)
            for nome_arq, dados_arq in arquivos:
                destino = pasta_abs / nome_arq
                with open(destino, "wb") as f:
                    f.write(dados_arq)
        except (ValueError, OSError) as e:
            self.responder(500, f"Erro ao salvar: {e}"); return

        self.redirecionar(f"/?pasta=/{pasta_rel}")

    def log_message(self, fmt, *args):
        pass  # silencia logs

# ──────────────────────────────────────────────
# Inicialização
# ──────────────────────────────────────────────

def criar_estrutura_inicial():
    BASE_PATH.mkdir(parents=True, exist_ok=True)
    for cat in CATEGORIAS_PADRAO:
        (BASE_PATH / cat).mkdir(exist_ok=True)

def descobrir_ip():
    import subprocess
    try:
        r = subprocess.run(
            ["ip", "addr", "show", "wlan0"],
            capture_output=True, text=True, timeout=3
        )
        for linha in r.stdout.splitlines():
            linha = linha.strip()
            if linha.startswith("inet ") and "127." not in linha:
                return linha.split()[1].split("/")[0]
    except:
        pass
    return "localhost"

if __name__ == "__main__":
    criar_estrutura_inicial()
    ip = descobrir_ip()

    print("\n" + "="*50)
    print("  📱 MeuSSD — Gerenciador de Arquivos")
    print("="*50)
    print(f"\n  Acesse no navegador:")
    print(f"  → Neste celular:  http://localhost:{PORT}")
    print(f"  → Na rede Wi-Fi:  http://{ip}:{PORT}")
    print(f"\n  Pasta principal:  {BASE_PATH}")
    print(f"\n  Ctrl+C para parar\n")
    print("="*50 + "\n")

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), GerenciadorHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n📴 Gerenciador encerrado.")
