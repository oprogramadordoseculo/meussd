#!/usr/bin/env bash
cd "$(dirname "$0")" || exit 1

PID_ARQ=~/.meussd/meussd.pid
TERMUX=0; [[ "$PREFIX" == *com.termux* ]] && TERMUX=1
PY=$(command -v python3 || command -v python)
mkdir -p ~/.meussd

parar() {
  if [ -f "$PID_ARQ" ] && kill "$(cat "$PID_ARQ")" 2>/dev/null; then
    echo "📴 MeuSSD parado."
  else
    echo "MeuSSD não estava rodando."
  fi
  rm -f "$PID_ARQ"
}

case "$1" in
  parar)
    parar
    [ $TERMUX = 1 ] && termux-wake-unlock 2>/dev/null
    exit 0 ;;
  log)
    tail -n 40 -f ~/.meussd/meussd.log
    exit 0 ;;
  ip|endereco)
    "$PY" -c "from app import ip_local, PORTA; ip = ip_local(); print(f'Endereço atual: http://{ip}:{PORTA}' if ip else 'Sem Wi-Fi conectado.')" 2>/dev/null
    exit 0 ;;
esac

if [ $TERMUX = 1 ]; then
  if [ ! -d ~/storage/shared ]; then
    echo "📂 Liberando acesso ao armazenamento… aceite a permissão no Android."
    termux-setup-storage
    sleep 4
  fi
  pkill -f "ssd_gerenciador.py" 2>/dev/null
  pkill -f "vigia_downloads.py" 2>/dev/null
  termux-wake-lock 2>/dev/null
fi

[ -f "$PID_ARQ" ] && parar > /dev/null
sleep 1

nohup "$PY" app.py > ~/.meussd/saida.log 2>&1 &
echo $! > "$PID_ARQ"
sleep 3

if kill -0 "$(cat "$PID_ARQ")" 2>/dev/null; then
  head -n 12 ~/.meussd/saida.log
  echo ""
  echo "Parar: ./iniciar.sh parar  |  Log: ./iniciar.sh log  |  Endereço atual: ./iniciar.sh ip"
else
  echo "❌ O MeuSSD não iniciou. Erro:"
  tail -n 20 ~/.meussd/saida.log
  rm -f "$PID_ARQ"
fi
