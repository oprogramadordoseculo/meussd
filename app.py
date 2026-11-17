#!/usr/bin/env python3
"""MeuSSD — servidor pessoal de arquivos para Termux (Flask + Waitress)."""

import hashlib
import json
import logging
import mimetypes
import os
import re
import secrets
import shutil
import socket
import subprocess
import sys
import threading
import time
import uuid
from functools import wraps
from pathlib import Path

from flask import (Flask, abort, jsonify, redirect, render_template, request,
                   send_file, session, url_for)
from werkzeug.security import check_password_hash, generate_password_hash

HOME = Path.home()
NO_TERMUX = "com.termux" in os.environ.get("PREFIX", "")


def pasta_downloads_pc():
    try:
        r = subprocess.run(["xdg-user-dir", "DOWNLOAD"], capture_output=True, text=True, timeout=3)
        caminho = Path(r.stdout.strip())
        if r.returncode == 0 and caminho.is_dir() and caminho != HOME:
            return caminho
    except (OSError, subprocess.SubprocessError):
        pass
    for nome in ("Downloads", "Transferências"):
        if (HOME / nome).is_dir():
            return HOME / nome
    return HOME / "Downloads"


if NO_TERMUX:
    RAIZ_PADRAO = HOME / "storage" / "shared" / "MeuSSD"
    DOWNLOADS_PADRAO = HOME / "storage" / "downloads"
else:
    RAIZ_PADRAO = HOME / "MeuSSD"
    DOWNLOADS_PADRAO = pasta_downloads_pc()

RAIZ = Path(os.environ.get("MEUSSD_DIR", RAIZ_PADRAO)).expanduser()
DOWNLOADS = Path(os.environ.get("MEUSSD_DOWNLOADS", DOWNLOADS_PADRAO)).expanduser()
DADOS = Path(os.environ.get("MEUSSD_DADOS", HOME / ".meussd")).expanduser()
PORTA = int(os.environ.get("MEUSSD_PORTA", "9000"))
SEM_SENHA = os.environ.get("MEUSSD_SEM_SENHA") == "1"
PASTA_ANTIGA = HOME / "MeuSSD"

LIXEIRA_NOME = ".lixeira"
PASTAS_PADRAO = ["Videos", "Imagens", "Musicas", "Documentos", "Trabalho", "Editora", "Pessoal"]

EXT_VIDEO = {".mp4", ".mkv", ".avi", ".mov", ".3gp", ".webm", ".flv", ".ts", ".m4v"}
EXT_IMAGEM = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".gif", ".bmp", ".avif"}
EXT_AUDIO = {".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac", ".opus"}
EXT_TEXTO = {".txt", ".md", ".py", ".sh", ".json", ".csv", ".log", ".html", ".css", ".js", ".xml", ".ini"}
EXT_DOC = {".pdf", ".doc", ".docx", ".odt", ".rtf", ".epub", ".xls", ".xlsx", ".ppt", ".pptx"}
EXT_PACOTE = {".zip", ".rar", ".7z", ".tar", ".gz", ".apk"}
EXT_TEMPORARIA = {".crdownload", ".part", ".tmp", ".download", ".ytdl"}

DESTINO_VIGIA = [(EXT_VIDEO, "Videos"), (EXT_IMAGEM, "Imagens")]

DADOS.mkdir(parents=True, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(message)s",
    datefmt="%d/%m %H:%M:%S",
    handlers=[logging.FileHandler(DADOS / "meussd.log", encoding="utf-8"), logging.StreamHandler()],
)
log = logging.getLogger("meussd")

try:
    from PIL import Image, ImageOps
except ImportError:
    Image = None

FFMPEG = shutil.which("ffmpeg")


# ── Configuração persistente ──────────────────────────────────────────

ARQ_CONFIG = DADOS / "config.json"
_trava_config = threading.Lock()


def ler_config():
    try:
        return json.loads(ARQ_CONFIG.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def salvar_config(**mudancas):
    with _trava_config:
        cfg = ler_config()
        cfg.update(mudancas)
        ARQ_CONFIG.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
        return cfg


if "secret_key" not in ler_config():
    salvar_config(secret_key=secrets.token_hex(32))

app = Flask(__name__)
app.secret_key = ler_config()["secret_key"]
app.config.update(
    MAX_CONTENT_LENGTH=None,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    PERMANENT_SESSION_LIFETIME=60 * 60 * 24 * 30,
)


# ── Caminhos ──────────────────────────────────────────────────────────

def raiz_real():
    return RAIZ.resolve()


def resolver(rel, deve_existir=True):
    rel = (rel or "").replace("\\", "/").strip("/")
    alvo = (RAIZ / rel).resolve()
    raiz = raiz_real()
    if alvo != raiz and raiz not in alvo.parents:
        abort(400, "Caminho fora do MeuSSD")
    if deve_existir and not alvo.exists():
        abort(404, "Não encontrado")
    return alvo


def relativo(p):
    rel = p.resolve().relative_to(raiz_real()).as_posix()
    return "" if rel == "." else rel


def lixeira():
    return raiz_real() / LIXEIRA_NOME


def na_lixeira(p):
    lx = lixeira()
    return p == lx or lx in p.parents


def nome_valido(nome):
    nome = (nome or "").strip()
    if not nome or nome in {".", ".."} or any(c in nome for c in '/\\\0') or len(nome) > 250:
        abort(400, "Nome inválido")
    return nome


def nome_livre(pasta, nome):
    alvo = pasta / nome
    if not alvo.exists():
        return alvo
    base, ext = Path(nome).stem, Path(nome).suffix
    if alvo.is_dir():
        base, ext = nome, ""
    n = 1
    while (pasta / f"{base} ({n}){ext}").exists():
        n += 1
    return pasta / f"{base} ({n}){ext}"


def tipo_de(p):
    if p.is_dir():
        return "pasta"
    ext = p.suffix.lower()
    for conjunto, nome in ((EXT_VIDEO, "video"), (EXT_IMAGEM, "imagem"), (EXT_AUDIO, "audio"),
                           (EXT_TEXTO, "texto"), (EXT_DOC, "documento"), (EXT_PACOTE, "pacote")):
        if ext in conjunto:
            return nome
    return "arquivo"


def info_item(p):
    st = p.stat()
    pasta = p.is_dir()
    return {
        "nome": p.name,
        "caminho": relativo(p),
        "tipo": tipo_de(p),
        "tamanho": None if pasta else st.st_size,
        "modificado": st.st_mtime,
    }


def mover(origem, destino_pasta, nome=None):
    destino_pasta.mkdir(parents=True, exist_ok=True)
    destino = nome_livre(destino_pasta, nome or origem.name)
    shutil.move(str(origem), str(destino))
    return destino


# ── Autenticação ──────────────────────────────────────────────────────

def senha_definida():
    return SEM_SENHA or bool(ler_config().get("senha_hash"))


def protegido(f):
    @wraps(f)
    def interno(*a, **kw):
        if SEM_SENHA or session.get("ok"):
            return f(*a, **kw)
        if request.path.startswith("/api/"):
            return jsonify(erro="Faça login novamente"), 401
        return redirect(url_for("entrar" if senha_definida() else "configurar"))
    return interno


@app.route("/entrar", methods=["GET", "POST"])
def entrar():
    if not senha_definida():
        return redirect(url_for("configurar"))
    erro = None
    if request.method == "POST":
        if check_password_hash(ler_config()["senha_hash"], request.form.get("senha", "")):
            session.permanent = True
            session["ok"] = True
            return redirect(url_for("inicio"))
        time.sleep(1.5)
        erro = "Senha incorreta"
    return render_template("entrar.html", primeira=False, erro=erro)


@app.route("/configurar", methods=["GET", "POST"])
def configurar():
    if senha_definida():
        return redirect(url_for("entrar"))
    erro = None
    if request.method == "POST":
        s1, s2 = request.form.get("senha", ""), request.form.get("confirma", "")
        if len(s1) < 4:
            erro = "Use pelo menos 4 caracteres"
        elif s1 != s2:
            erro = "As senhas não conferem"
        else:
            salvar_config(senha_hash=generate_password_hash(s1))
            session.permanent = True
            session["ok"] = True
            return redirect(url_for("inicio"))
    return render_template("entrar.html", primeira=True, erro=erro)


@app.route("/sair")
def sair():
    session.clear()
    return redirect(url_for("entrar"))


@app.errorhandler(400)
@app.errorhandler(404)
@app.errorhandler(409)
def erro_http(e):
    if request.path.startswith("/api/"):
        return jsonify(erro=e.description), e.code
    return e


# ── Páginas e arquivos ────────────────────────────────────────────────

@app.route("/")
@protegido
def inicio():
    return render_template("index.html", com_senha=not SEM_SENHA)


@app.route("/raw/<path:rel>")
@protegido
def raw(rel):
    p = resolver(rel)
    if p.is_dir():
        abort(400)
    tipo = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
    return send_file(p, mimetype=tipo, conditional=True, download_name=p.name)


@app.route("/baixar/<path:rel>")
@protegido
def baixar(rel):
    p = resolver(rel)
    if p.is_dir():
        abort(400)
    return send_file(p, as_attachment=True, conditional=True, download_name=p.name)


_trava_miniatura = threading.Semaphore(2)


@app.route("/mini/<path:rel>")
@protegido
def miniatura(rel):
    p = resolver(rel)
    tipo = tipo_de(p)
    if tipo not in {"imagem", "video"}:
        abort(404)
    st = p.stat()
    chave = hashlib.sha1(f"{p}|{st.st_mtime}|{st.st_size}".encode()).hexdigest()
    cache = DADOS / "miniaturas" / f"{chave}.jpg"
    if not cache.exists():
        cache.parent.mkdir(parents=True, exist_ok=True)
        with _trava_miniatura:
            if not cache.exists() and not gerar_miniatura(p, tipo, cache):
                if tipo == "imagem":
                    return send_file(p, conditional=True)
                abort(404)
    resp = send_file(cache, mimetype="image/jpeg", conditional=True)
    resp.headers["Cache-Control"] = "private, max-age=604800"
    return resp


def gerar_miniatura(p, tipo, cache):
    temp = cache.with_suffix(".tmp.jpg")
    try:
        if tipo == "imagem" and Image:
            with Image.open(p) as img:
                img = ImageOps.exif_transpose(img)
                img.thumbnail((400, 400))
                img.convert("RGB").save(temp, "JPEG", quality=78)
        elif tipo == "video" and FFMPEG:
            for inicio in ("3", "0"):
                subprocess.run(
                    [FFMPEG, "-y", "-loglevel", "error", "-ss", inicio, "-i", str(p),
                     "-frames:v", "1", "-vf", "scale=400:-2", str(temp)],
                    timeout=40, capture_output=True,
                )
                if temp.exists() and temp.stat().st_size:
                    break
        else:
            return False
        if temp.exists() and temp.stat().st_size:
            temp.replace(cache)
            return True
    except Exception as e:
        log.info(f"Miniatura falhou para {p.name}: {e}")
    temp.unlink(missing_ok=True)
    return False


# ── API de arquivos ───────────────────────────────────────────────────

def corpo():
    return request.get_json(silent=True) or {}


@app.get("/api/listar")
@protegido
def api_listar():
    p = resolver(request.args.get("caminho", ""))
    if not p.is_dir():
        abort(400, "Não é uma pasta")
    itens = []
    for filho in p.iterdir():
        if filho.name == LIXEIRA_NOME and p == raiz_real():
            continue
        try:
            itens.append(info_item(filho))
        except OSError:
            continue
    itens.sort(key=lambda i: (i["tipo"] != "pasta", i["nome"].lower()))
    return jsonify(caminho=relativo(p), itens=itens)


@app.get("/api/pastas")
@protegido
def api_pastas():
    p = resolver(request.args.get("caminho", ""))
    pastas = sorted(
        (f.name for f in p.iterdir() if f.is_dir() and not (f.name == LIXEIRA_NOME and p == raiz_real())),
        key=str.lower,
    )
    return jsonify(caminho=relativo(p), pastas=pastas)


@app.get("/api/disco")
@protegido
def api_disco():
    total, usado, livre = shutil.disk_usage(raiz_real())
    return jsonify(total=total, usado=usado, livre=livre)


@app.post("/api/criar-pasta")
@protegido
def api_criar_pasta():
    d = corpo()
    pai = resolver(d.get("caminho", ""))
    nova = pai / nome_valido(d.get("nome"))
    if nova.exists():
        abort(409, "Já existe algo com esse nome")
    nova.mkdir()
    return jsonify(ok=True, item=info_item(nova))


@app.post("/api/renomear")
@protegido
def api_renomear():
    d = corpo()
    p = resolver(d.get("caminho"))
    if p == raiz_real():
        abort(400, "Não dá para renomear a raiz")
    novo = p.parent / nome_valido(d.get("nome"))
    if novo.exists() and novo != p:
        abort(409, "Já existe algo com esse nome")
    p.rename(novo)
    return jsonify(ok=True, item=info_item(novo))


@app.post("/api/mover")
@protegido
def api_mover():
    d = corpo()
    destino = resolver(d.get("destino", ""))
    copiar = bool(d.get("copiar"))
    if not destino.is_dir():
        abort(400, "Destino inválido")
    feitos = 0
    for rel in d.get("caminhos", []):
        p = resolver(rel)
        if p == raiz_real() or p == destino or p in destino.parents:
            continue
        if not copiar and p.parent == destino:
            continue
        if copiar:
            alvo = nome_livre(destino, p.name)
            (shutil.copytree if p.is_dir() else shutil.copy2)(p, alvo)
        else:
            mover(p, destino)
        feitos += 1
    return jsonify(ok=True, feitos=feitos)


@app.post("/api/apagar")
@protegido
def api_apagar():
    d = corpo()
    feitos = 0
    for rel in d.get("caminhos", []):
        p = resolver(rel)
        if p == raiz_real() or p == lixeira():
            continue
        if na_lixeira(p):
            shutil.rmtree(p) if p.is_dir() else p.unlink()
        else:
            ident = time.strftime("%Y%m%d%H%M%S") + "-" + uuid.uuid4().hex[:6]
            caixa = lixeira() / ident
            caixa.mkdir(parents=True)
            original = relativo(p)
            shutil.move(str(p), str(caixa / p.name))
            (caixa / ".info.json").write_text(
                json.dumps({"original": original, "nome": p.name, "apagado": time.time()}),
                encoding="utf-8",
            )
        feitos += 1
    return jsonify(ok=True, feitos=feitos)


def itens_lixeira():
    lx = lixeira()
    if not lx.exists():
        return []
    itens = []
    for caixa in lx.iterdir():
        try:
            info = json.loads((caixa / ".info.json").read_text(encoding="utf-8"))
            alvo = caixa / info["nome"]
            st = alvo.stat()
        except (OSError, ValueError, KeyError):
            continue
        itens.append({
            "id": caixa.name, "nome": info["nome"], "original": info["original"],
            "apagado": info["apagado"], "tipo": tipo_de(alvo),
            "tamanho": None if alvo.is_dir() else st.st_size,
        })
    itens.sort(key=lambda i: -i["apagado"])
    return itens


def caixa_lixeira(ident):
    if not re.fullmatch(r"[\w-]+", ident or ""):
        abort(400)
    caixa = lixeira() / ident
    if not caixa.is_dir():
        abort(404, "Item não está mais na lixeira")
    return caixa


@app.get("/api/lixeira")
@protegido
def api_lixeira():
    return jsonify(itens=itens_lixeira())


@app.post("/api/lixeira/restaurar")
@protegido
def api_restaurar():
    for ident in corpo().get("ids", []):
        caixa = caixa_lixeira(ident)
        info = json.loads((caixa / ".info.json").read_text(encoding="utf-8"))
        destino = resolver(str(Path(info["original"]).parent), deve_existir=False)
        mover(caixa / info["nome"], destino, info["nome"])
        shutil.rmtree(caixa)
    return jsonify(ok=True)


@app.post("/api/lixeira/excluir")
@protegido
def api_excluir_definitivo():
    d = corpo()
    if d.get("tudo"):
        if lixeira().exists():
            shutil.rmtree(lixeira())
    else:
        for ident in d.get("ids", []):
            shutil.rmtree(caixa_lixeira(ident))
    return jsonify(ok=True)


@app.post("/api/enviar")
@protegido
def api_enviar():
    pasta = resolver(request.form.get("caminho", ""))
    salvos = []
    for arq in request.files.getlist("arquivos"):
        partes = [nome_valido(x) for x in (arq.filename or "").replace("\\", "/").split("/") if x]
        if not partes:
            continue
        destino_pasta = pasta.joinpath(*partes[:-1])
        destino_pasta.mkdir(parents=True, exist_ok=True)
        destino = nome_livre(destino_pasta, partes[-1])
        arq.save(destino)
        salvos.append(destino.name)
    log.info(f"⬆️  {len(salvos)} arquivo(s) enviado(s) para /{relativo(pasta)}")
    return jsonify(ok=True, salvos=salvos)


@app.get("/api/buscar")
@protegido
def api_buscar():
    termo = (request.args.get("q") or "").strip().lower()
    if len(termo) < 2:
        return jsonify(itens=[])
    raiz = raiz_real()
    achados = []
    for pasta, subpastas, arquivos in os.walk(raiz):
        if Path(pasta) == raiz and LIXEIRA_NOME in subpastas:
            subpastas.remove(LIXEIRA_NOME)
        for nome in subpastas + arquivos:
            if termo in nome.lower():
                try:
                    achados.append(info_item(Path(pasta) / nome))
                except OSError:
                    pass
                if len(achados) >= 300:
                    return jsonify(itens=achados, limitado=True)
    return jsonify(itens=achados)


# ── Download por link (yt-dlp) ────────────────────────────────────────

tarefas = {}
_trava_tarefas = threading.Lock()
RE_PROGRESSO = re.compile(r"\[download\]\s+([\d.]+)%")


def ytdlp_cmd():
    exe = shutil.which("yt-dlp")
    if exe:
        return [exe]
    try:
        import yt_dlp  # noqa: F401
        return [sys.executable, "-m", "yt_dlp"]
    except ImportError:
        return None


def rodar_download(ident, url, destino):
    t = tarefas[ident]
    formato = "bv*+ba/b" if FFMPEG else "b"
    cmd = ytdlp_cmd() + [
        "--no-playlist", "--newline", "--no-mtime", "-f", formato,
        "--merge-output-format", "mp4",
        "-o", str(destino / "%(title).90B [%(id)s].%(ext)s"),
        "--print", "after_move:filepath", url,
    ]
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True, encoding="utf-8", errors="replace")
        ultimas = []
        for linha in proc.stdout:
            linha = linha.strip()
            m = RE_PROGRESSO.search(linha)
            if m:
                t["progresso"] = float(m.group(1))
            elif linha.startswith("/") and Path(linha).exists():
                t["arquivo"] = relativo(Path(linha))
            ultimas = (ultimas + [linha])[-6:]
        proc.wait()
        if proc.returncode == 0:
            t.update(estado="concluido", progresso=100)
            log.info(f"🎬 Download concluído: {t.get('arquivo', url)}")
            notificar("MeuSSD: download concluído", Path(t.get("arquivo", url)).name)
        else:
            erro = next((l for l in reversed(ultimas) if "ERROR" in l), ultimas[-1] if ultimas else "")
            t.update(estado="erro", mensagem=erro.replace("ERROR:", "").strip()[:300])
    except Exception as e:
        t.update(estado="erro", mensagem=str(e))


@app.post("/api/baixar-link")
@protegido
def api_baixar_link():
    d = corpo()
    url = (d.get("url") or "").strip()
    if not re.match(r"https?://", url):
        abort(400, "Cole um link começando com http:// ou https://")
    if not ytdlp_cmd():
        abort(400, "yt-dlp não está instalado. No Termux rode: pip install -U yt-dlp")
    destino = resolver(d.get("destino") or "Videos", deve_existir=False)
    destino.mkdir(parents=True, exist_ok=True)
    ident = uuid.uuid4().hex[:8]
    with _trava_tarefas:
        tarefas[ident] = {"id": ident, "url": url, "estado": "baixando", "progresso": 0,
                          "destino": relativo(destino), "inicio": time.time()}
    threading.Thread(target=rodar_download, args=(ident, url, destino), daemon=True).start()
    return jsonify(ok=True, id=ident)


@app.get("/api/tarefas")
@protegido
def api_tarefas():
    return jsonify(tarefas=sorted(tarefas.values(), key=lambda t: -t["inicio"])[:20])


@app.post("/api/tarefas/limpar")
@protegido
def api_tarefas_limpar():
    with _trava_tarefas:
        for k in [k for k, t in tarefas.items() if t["estado"] != "baixando"]:
            del tarefas[k]
    return jsonify(ok=True)


# ── Vigia de Downloads ────────────────────────────────────────────────

estado_vigia = {"ativo": True, "ultimos": []}


def notificar(titulo, texto):
    if shutil.which("termux-notification"):
        try:
            subprocess.run(["termux-notification", "-t", titulo, "-c", texto, "--group", "meussd"],
                           timeout=5, capture_output=True)
        except Exception:
            pass


def destino_do_vigia(arquivo):
    ext = arquivo.suffix.lower()
    for conjunto, pasta in DESTINO_VIGIA:
        if ext in conjunto:
            return pasta
    return None


def vigiar():
    vistos = {}
    while True:
        time.sleep(10)
        if not estado_vigia["ativo"] or not DOWNLOADS.is_dir():
            continue
        try:
            atuais = {}
            for arq in DOWNLOADS.iterdir():
                if arq.name.startswith(".") or not arq.is_file():
                    continue
                if arq.suffix.lower() in EXT_TEMPORARIA or not destino_do_vigia(arq):
                    continue
                st = arq.stat()
                assinatura = (st.st_size, st.st_mtime)
                atuais[arq.name] = assinatura
                pronto = vistos.get(arq.name) == assinatura and time.time() - st.st_mtime > 8
                if pronto and st.st_size > 0:
                    pasta = destino_do_vigia(arq)
                    final = mover(arq, raiz_real() / pasta)
                    registro = {"nome": final.name, "pasta": pasta, "quando": time.time()}
                    estado_vigia["ultimos"] = ([registro] + estado_vigia["ultimos"])[:15]
                    log.info(f"👀 {arq.name} → {pasta}/")
                    notificar(f"MeuSSD: salvo em {pasta}", final.name)
                    atuais.pop(arq.name, None)
            vistos = atuais
        except Exception as e:
            log.info(f"⚠️  Vigia: {e}")


@app.get("/api/status")
@protegido
def api_status():
    return jsonify(
        vigia=estado_vigia["ativo"],
        vigia_pasta=str(DOWNLOADS),
        vigia_ok=DOWNLOADS.is_dir(),
        ultimos=estado_vigia["ultimos"],
        ytdlp=bool(ytdlp_cmd()),
        ffmpeg=bool(FFMPEG),
        miniaturas_imagem=bool(Image),
    )


@app.post("/api/vigia")
@protegido
def api_vigia():
    estado_vigia["ativo"] = bool(corpo().get("ativo"))
    salvar_config(vigia=estado_vigia["ativo"])
    return jsonify(ok=True, ativo=estado_vigia["ativo"])


# ── Inicialização ─────────────────────────────────────────────────────

def ip_local():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
    except OSError:
        return None


def preparar_raiz():
    try:
        RAIZ.mkdir(parents=True, exist_ok=True)
        for nome in PASTAS_PADRAO:
            (RAIZ / nome).mkdir(exist_ok=True)
        teste = RAIZ / ".teste_escrita"
        teste.write_text("ok")
        teste.unlink()
    except OSError as e:
        print(f"\n❌ Não consegui usar a pasta {RAIZ}\n   Motivo: {e}")
        if NO_TERMUX:
            print("   No Termux, rode:  termux-setup-storage   e aceite a permissão.\n")
        sys.exit(1)


def migrar_antigo():
    if not PASTA_ANTIGA.is_dir() or PASTA_ANTIGA.resolve() == raiz_real():
        print("Nada para migrar.")
        return
    total = 0
    for item in list(PASTA_ANTIGA.iterdir()):
        if item.is_dir():
            for arq in list(item.rglob("*")):
                if arq.is_file():
                    rel = arq.relative_to(PASTA_ANTIGA)
                    mover(arq, raiz_real() / rel.parent)
                    total += 1
        else:
            mover(item, raiz_real())
            total += 1
    print(f"✅ {total} arquivo(s) movido(s) de {PASTA_ANTIGA} para {RAIZ}")


def main():
    preparar_raiz()
    if "--migrar" in sys.argv:
        migrar_antigo()
        return
    if NO_TERMUX and PASTA_ANTIGA.is_dir() and any(PASTA_ANTIGA.rglob("*.*")) and PASTA_ANTIGA.resolve() != raiz_real():
        print(f"⚠️  Há arquivos na pasta antiga {PASTA_ANTIGA} (invisível para a galeria).")
        print("   Para trazê-los ao MeuSSD:  python app.py --migrar\n")

    estado_vigia["ativo"] = ler_config().get("vigia", True)
    threading.Thread(target=vigiar, daemon=True).start()

    ip = ip_local()
    print("=" * 52)
    print("  📱 MeuSSD rodando")
    print(f"  Neste aparelho:   http://localhost:{PORTA}")
    if ip:
        print(f"  Outros aparelhos: http://{ip}:{PORTA}")
    print(f"  Pasta:            {RAIZ}")
    print(f"  Vigia:            {DOWNLOADS} {'(ativo)' if estado_vigia['ativo'] else '(pausado)'}")
    print("=" * 52, flush=True)

    try:
        from waitress import serve
        serve(app, host="0.0.0.0", port=PORTA, threads=12,
              max_request_body_size=1 << 40, channel_timeout=600, ident="MeuSSD")
    except ImportError:
        app.run(host="0.0.0.0", port=PORTA, threaded=True)


if __name__ == "__main__":
    main()
