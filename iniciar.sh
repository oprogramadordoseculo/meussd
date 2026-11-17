#!/data/data/com.termux/files/usr/bin/bash
cd "$(dirname "$0")"

case "$1" in
  parar)
    pkill -f "python.*app.py" && echo "📴 MeuSSD parado." || echo "MeuSSD não estava rodando."
    termux-wake-unlock 2>/dev/null
    exit 0 ;;
  log)
    tail -n 40 -f ~/.meussd/meussd.log
    exit 0 ;;
esac

if [ ! -d ~/storage/shared ]; then
  echo "📂 Liberando acesso ao armazenamento… aceite a permissão no Android."
  termux-setup-storage
  sleep 4
fi

pkill -f "python.*app.py" 2>/dev/null
pkill -f "ssd_gerenciador.py" 2>/dev/null
pkill -f "vigia_downloads.py" 2>/dev/null
sleep 1

termux-wake-lock 2>/dev/null
mkdir -p ~/.meussd

nohup python app.py > ~/.meussd/saida.log 2>&1 &
sleep 3

if pgrep -f "python.*app.py" > /dev/null; then
  head -n 12 ~/.meussd/saida.log
  echo ""
  echo "Para parar:  ./iniciar.sh parar   |   Ver log:  ./iniciar.sh log"
else
  echo "❌ O MeuSSD não iniciou. Erro:"
  tail -n 20 ~/.meussd/saida.log
fi
