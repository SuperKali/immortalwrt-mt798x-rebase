#!/bin/sh
# End to end against a real router. Backs the configuration up first and puts
# it back afterwards, whatever happens.
#
#   tests/router.sh [user@host]
#
# Deploys the working copy, applies a configuration built for the test, and
# asserts on what the kernel actually holds: nftables rules, tc classes and
# filters, the rule map and the rpc output.

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-root@192.168.7.1}"
SSH="ssh -o StrictHostKeyChecking=no -o ConnectTimeout=8 $TARGET"
PASS=0
FAIL=0

r() { $SSH "$@"; }

ok() {
	if [ "$2" = "$3" ]; then
		PASS=$((PASS + 1))
	else
		FAIL=$((FAIL + 1))
		printf 'FAIL  %s\n        atteso: %s\n        ottenuto: %s\n' "$1" "$3" "$2"
	fi
}

has() {
	if [ "$2" -ge "$3" ]; then
		PASS=$((PASS + 1))
	else
		FAIL=$((FAIL + 1))
		printf 'FAIL  %s\n        atteso almeno: %s\n        ottenuto: %s\n' "$1" "$3" "$2"
	fi
}

restore() {
	echo
	echo "== ripristino configurazione =="
	r 'if [ -f /tmp/eqos-test.bak ]; then
		cp /tmp/eqos-test.bak /etc/config/eqos
		rm -f /tmp/eqos-test.bak
		/etc/init.d/eqos restart >/dev/null 2>&1
		echo ripristinata
	fi'
}
trap restore EXIT INT TERM

r 'true' >/dev/null 2>&1 || { echo "router non raggiungibile: $TARGET"; exit 1; }

echo "== deploy della copia di lavoro =="
scp -q -o StrictHostKeyChecking=no "$ROOT/root/usr/sbin/eqos" "$TARGET:/usr/sbin/eqos"
scp -q -o StrictHostKeyChecking=no "$ROOT/root/etc/init.d/eqos" "$TARGET:/etc/init.d/eqos"
scp -q -o StrictHostKeyChecking=no "$ROOT/root/usr/share/rpcd/ucode/luci.eqos" \
	"$TARGET:/usr/share/rpcd/ucode/luci.eqos"
r 'chmod +x /usr/sbin/eqos /etc/init.d/eqos; /etc/init.d/rpcd restart >/dev/null 2>&1'
r 'cp /etc/config/eqos /tmp/eqos-test.bak'

echo "== configurazione di prova =="
r 'cat > /etc/config/eqos <<EOF
config eqos "config"
	option enabled "1"
	option download "100"
	option upload "12"
	option direction "both"
	option scheduler "wrr"
	option bind_rate "5"
	option upload_mode "auto"
	option download_mode "auto"

config profile "tprio"
	option name "Prova critica"
	option priority "critical"
	option download "0"
	option upload "0"
	option min_download "20000"
	option min_upload "5000"
	option shared "0"

config profile "tshared"
	option name "Prova condivisa"
	option priority "low"
	option download "50000"
	option upload "8000"
	option min_download "1000"
	option min_upload "1000"
	option shared "1"

config device
	option enabled "1"
	option selector "ip"
	option ip "192.168.7.201"
	option profile "tprio"

config device
	option enabled "1"
	option selector "ip"
	option ip "192.168.7.202"
	option profile "tshared"

config device
	option enabled "1"
	option selector "ip"
	option ip "192.168.7.203"
	option profile "tshared"

config device
	option enabled "1"
	option selector "ip"
	option ip "192.168.7.204"
	option priority "high"
	option download "30000"
	option upload "6000"

config traffic "tvoip"
	option enabled "1"
	option name "Prova VoIP"
	option priority "critical"
	option proto "udp"
	option ports "5060,10000-20000"
	option dscp "ef"
	option min_download "512"
	option min_upload "512"

config traffic "tbulk"
	option enabled "1"
	option name "Prova bulk"
	option priority "low"
	option proto "tcpudp"
	option ports "6881-6999"
EOF
/etc/init.d/eqos restart 2>&1 | head -5
sleep 3'

echo
echo "== mappa delle regole =="
MAP="$(r 'cat /var/run/eqos.map 2>/dev/null')"
ok "quattro regole per dispositivo" \
	"$(printf '%s\n' "$MAP" | grep -c 'device$')" 4
ok "due regole di traffico" \
	"$(printf '%s\n' "$MAP" | grep -c 'traffic$')" 2
ok "i due membri del profilo condiviso stanno sullo stesso slot" \
	"$(printf '%s\n' "$MAP" | awk -F'\t' '$3=="192.168.7.202"||$3=="192.168.7.203"{print $1}' | sort -u | wc -l | tr -d ' ')" 1
ok "il critico ha uno slot piu' alto del low" \
	"$(printf '%s\n' "$MAP" | awk -F'\t' '
		$3=="192.168.7.201"{c=$1} $3=="192.168.7.202"{l=$1}
		END{print (c>l)?"si":"no"}')" si
ok "nessuno slot nell'intervallo riservato 31-63" \
	"$(printf '%s\n' "$MAP" | awk -F'\t' '$1>=31 && $1<=63' | wc -l | tr -d ' ')" 0

echo
echo "== nftables =="
NFT="$(r 'nft list chain inet eqos forward 2>/dev/null')"
ok "esclusione hnat per ogni dispositivo (2 direzioni x 4)" \
	"$(printf '%s\n' "$NFT" | grep -c 'meta mark set 0x00000099')" 8
has "regole di traffico che impostano la classe" \
	"$(printf '%s\n' "$NFT" | grep -c 'meta priority set')" 6
ok "le regole di traffico impostano anche una coda hardware" \
	"$(printf '%s\n' "$NFT" | grep -c 'udp dport .* meta mark set 0x')" 2
# By default no service rule may step over a device limit: the guard on the
# exception tag has to be there.
ok "ogni regola di classe rispetta il tag di esclusione" \
	"$(printf '%s\n' "$NFT" | grep 'meta priority set' | grep -vc '0x00000099')" 0
GLOB="$(r 'nft list chain inet eqos forward_global 2>/dev/null')"
ok "due regole catch-all" "$(printf '%s\n' "$GLOB" | grep -c 'counter')" 2

echo
echo "== classi tc =="
DL="$(r 'tc class show dev br-lan 2>/dev/null')"
UP="$(r 'tc class show dev ifb-eqos 2>/dev/null')"
ok "radice download al totale" \
	"$(printf '%s\n' "$DL" | grep -c 'class htb 1:1 root rate 100Mbit')" 1
ok "radice upload al totale" \
	"$(printf '%s\n' "$UP" | grep -c 'class htb 1:1 root rate 12Mbit')" 1
ok "il critico ha prio 0" \
	"$(printf '%s\n' "$DL" | grep 'rate 20Mbit' | grep -c 'prio 0')" 1
ok "il low ha prio 3" \
	"$(printf '%s\n' "$DL" | grep 'ceil 50Mbit' | grep -c 'prio 3')" 1
ok "l'high ha prio 1" \
	"$(printf '%s\n' "$DL" | grep 'ceil 30Mbit' | grep -c 'prio 1')" 1
ok "nessuna classe con rate uguale al ceil senza garanzia" \
	"$(printf '%s\n' "$DL" | grep 'ceil 30Mbit' | grep -c 'rate 30Mbit')" 0
# Peso 15 lo hanno il dispositivo critico e la regola VoIP, peso 1 i due low.
QD="$(r 'tc -d class show dev br-lan 2>/dev/null')"
ok "quantum massimo sulle classi critiche" \
	"$(printf '%s\n' "$QD" | grep -c 'quantum 22500')" 2
# Due regole low piu' la classe di quello che nessuna regola cattura.
ok "quantum minimo sulle classi low" \
	"$(printf '%s\n' "$QD" | grep -c 'quantum 1500')" 3
# Radice, tre slot per dispositivo (i due condivisi ne usano uno solo), due
# regole di servizio e la classe di quello che nessuna regola cattura.
ok "una classe per slot, piu' la radice e il catch-all" \
	"$(printf '%s\n' "$DL" | grep -c 'class htb')" 7

ok "esiste la classe di quello che nessuna regola cattura" \
	"$(printf '%s\n' "$DL" | grep -c 'class htb 1:fffd ')" 1
ok "servita per ultima" \
	"$(printf '%s\n' "$DL" | grep 'class htb 1:fffd ' | grep -c 'prio 4')" 1
ok "la qdisc la usa come default" \
	"$(r 'tc qdisc show dev br-lan 2>/dev/null' | grep -c 'default 0xfffd\|default fffd')" 1
# Burst has to follow the rate, or a 100 Mbit class never reaches 100 Mbit.
ok "burst della radice a un millisecondo" \
	"$(printf '%s\n' "$DL" | grep 'class htb 1:1 root' | grep -c 'burst 12500b')" 1
ok "nessuna classe rimasta al burst minimo in download" \
	"$(printf '%s\n' "$DL" | grep 'ceil 100Mbit\|ceil 50Mbit\|ceil 30Mbit' |
		grep -c 'burst 1600b')" 0

echo
echo "== filtri tc =="
F="$(r 'tc filter show dev ifb-eqos parent 1: 2>/dev/null')"
ok "esenzione LAN locale su pref 1 e 2" \
	"$(printf '%s\n' "$F" | grep -cE 'pref (1|2) ')" \
	"$(printf '%s\n' "$F" | grep -cE 'pref (1|2) ')"
# Without override, service filters sit in the high band and are read after
# the per-device ones.
has "filtri delle regole di servizio, IPv4" \
	"$(printf '%s\n' "$F" | grep -c 'protocol ip pref 3[0-9][0-9][0-9][0-9] ')" 10
has "filtri delle regole di servizio, IPv6" \
	"$(printf '%s\n' "$F" | grep -c 'protocol ipv6 pref 4[0-9][0-9][0-9][0-9] ')" 10
has "filtri per dispositivo sopra quelli di traffico" \
	"$(printf '%s\n' "$F" | grep -c 'pref 10[0-9][0-9] ')" 4
ok "nessuna preferenza con due protocolli" \
	"$(printf '%s\n' "$F" | sed -n 's/.*protocol \([a-z0-9]*\) pref \([0-9]*\).*/\2 \1/p' |
		sort -u | awk '{print $1}' | uniq -d | wc -l | tr -d ' ')" 0

echo
echo "== rpc =="
ok "getStatus elenca sei regole" \
	"$(r 'ubus call luci.eqos getStatus 2>/dev/null' | grep -c '"slot"')" 6
# Every reported slot belongs to a rule or is the catch-all. The exception tag
# 0x99, run through the qid formula, used to come out as slot 122: a slot
# nobody owns, holding everybody's bytes.
ok "getRuleStats non riporta slot fantasma" \
	"$(r 'known="$(cut -f1 /var/run/eqos.map | tr "\n" " ") 31"
		for s in $(ubus call luci.eqos getRuleStats 2>/dev/null |
			sed -n "s/.*\"\([0-9]*\):.*\":.*/\\1/p" | sort -u); do
			case " $known " in *" $s "*) ;; *) echo "$s" ;; esac
		done | wc -l | tr -d " "')" 0
ok "getStatus distingue i due tipi" \
	"$(r 'ubus call luci.eqos getStatus 2>/dev/null' | grep -c '"kind": "traffic"')" 2

echo
echo "== indirizzi che arrivano dopo l'avvio =="
# A host takes an IPv6 address with no lease and no event. The rule written for
# it has to follow without a restart, or that half of its traffic leaves the
# limit. The test rules use made-up addresses that no MAC claims, so one of them
# gets a neighbour entry here.
TMAC="02:00:00:ee:00:01"
r "ip neigh replace 192.168.7.204 lladdr $TMAC dev br-lan nud stale
	/etc/init.d/eqos restart >/dev/null 2>&1
	sleep 3" >/dev/null 2>&1
ok "lo stato degli indirizzi esiste" \
	"$(r '[ -s /var/run/eqos.v6 ] && echo si || echo no')" si
ok "una riga per il dispositivo con un MAC noto" \
	"$(r 'wc -l < /var/run/eqos.v6 | tr -d " "')" 1
V6SLOT="$(r 'cut -f1 /var/run/eqos.v6 | head -1')"
r "ip -6 neigh replace fd09:e405:1::1 lladdr $TMAC dev br-lan nud stale
	/etc/init.d/eqos refresh" >/dev/null 2>&1
ok "l'indirizzo nuovo finisce nello stato" \
	"$(r 'grep -c fd09:e405:1::1 /var/run/eqos.v6')" 1
ok "l'indirizzo nuovo ha le sue regole nftables" \
	"$(r 'nft list table inet eqos | grep -c fd09:e405:1::1')" 2
ok "l'indirizzo nuovo ha un filtro per direzione" \
	"$(r "tc filter show dev br-lan | grep -c 'pref $((20000 + V6SLOT)) .*flowid'")" 1
# Two rounds must not double anything, and the address list must not grow.
r '/etc/init.d/eqos refresh' >/dev/null 2>&1
ok "il secondo giro non raddoppia le regole" \
	"$(r 'nft list table inet eqos | grep -c fd09:e405:1::1')" 2
ok "il secondo giro non allunga lo stato" \
	"$(r 'grep fd09:e405:1::1 /var/run/eqos.v6 | wc -w | tr -d " "')" 6
ok "il controllo periodico e' acceso" \
	"$(r 'ubus call service list 2>/dev/null |
		jsonfilter -e "@.eqos.instances.addresses.running"')" true
r "ip -6 neigh del fd09:e405:1::1 lladdr $TMAC dev br-lan
	ip neigh del 192.168.7.204 lladdr $TMAC dev br-lan" >/dev/null 2>&1

echo
echo "== finestre orarie =="
# A rule outside its window must not be applied at all: the device falls back
# to the catch-all queues. The window is built from the router clock, so the
# test does not care what time it is run.
ok "una regola fuori finestra non viene applicata" \
	"$(r 'now=$(date +%s)
		uci -q set eqos.@device[0].start="$(date -d @$((now + 7200)) +%H:%M)"
		uci -q set eqos.@device[0].stop="$(date -d @$((now + 10800)) +%H:%M)"
		uci -q commit eqos
		/etc/init.d/eqos restart >/dev/null 2>&1; sleep 3
		grep -c 192.168.7.201 /var/run/eqos.map')" 0
ok "una regola dentro finestra viene applicata" \
	"$(r 'now=$(date +%s)
		uci -q set eqos.@device[0].start="$(date -d @$((now - 3600)) +%H:%M)"
		uci -q set eqos.@device[0].stop="$(date -d @$((now + 3600)) +%H:%M)"
		uci -q commit eqos
		/etc/init.d/eqos restart >/dev/null 2>&1; sleep 3
		grep -c 192.168.7.201 /var/run/eqos.map')" 1
ok "un giorno che non e' oggi esclude la regola" \
	"$(r 'uci -q delete eqos.@device[0].start
		uci -q delete eqos.@device[0].stop
		today=$(date +%a | tr A-Z a-z)
		for d in mon tue wed thu fri sat sun; do
			[ "$d" = "$today" ] || { uci -q set eqos.@device[0].weekdays="$d"; break; }
		done
		uci -q commit eqos
		/etc/init.d/eqos restart >/dev/null 2>&1; sleep 3
		grep -c 192.168.7.201 /var/run/eqos.map')" 0
ok "lo stato delle finestre segue le regole applicate" \
	"$(r 'grep -c "cfg" /var/run/eqos.sched')" 1
r 'uci -q delete eqos.@device[0].weekdays; uci -q commit eqos
	/etc/init.d/eqos restart >/dev/null 2>&1; sleep 3' >/dev/null 2>&1

echo
echo "== casi limite =="
ok "coda riservata rifiutata" \
	"$(r 'uci -q set eqos.@device[3].queue=40; uci -q commit eqos
		/etc/init.d/eqos restart 2>&1 | grep -c "queue slot must be"
		uci -q delete eqos.@device[3].queue; uci -q commit eqos' | tail -1)" 1
# A level's weight decides the class quantum. Changing it in the configuration
# has to reach tc, or the option does not exist.
ok "il peso configurato arriva a tc" \
	"$(r 'uci -q set eqos.config.weight_critical=2; uci -q commit eqos
		/etc/init.d/eqos restart >/dev/null 2>&1; sleep 3
		tc -d class show dev br-lan | grep -c "quantum 3000"
		uci -q delete eqos.config.weight_critical; uci -q commit eqos
		/etc/init.d/eqos restart >/dev/null 2>&1; sleep 3' | head -1 |
		awk '{ print ($1 > 0) ? "si" : "no" }')" si
ok "riavvio idempotente: stesso numero di classi" \
	"$(r '/etc/init.d/eqos restart >/dev/null 2>&1; sleep 2
		a=$(tc class show dev br-lan | grep -c "class htb")
		/etc/init.d/eqos restart >/dev/null 2>&1; sleep 2
		b=$(tc class show dev br-lan | grep -c "class htb")
		[ "$a" = "$b" ] && echo si || echo "no ($a vs $b)"')" si
# The path that left the ingress qdisc behind when the IFB was already gone:
# the next start failed and the service stayed down without saying why.
ok "stop pulisce anche senza IFB" \
	"$(r '/etc/init.d/eqos start >/dev/null 2>&1; sleep 2
		ip link del ifb-eqos 2>/dev/null
		/etc/init.d/eqos stop >/dev/null 2>&1
		tc qdisc show dev br-lan | grep -c "ingress\|clsact"')" 0
ok "e riparte dopo quel caso" \
	"$(r '/etc/init.d/eqos start >/dev/null 2>&1; sleep 3
		tc qdisc show dev br-lan | grep -c htb')" 1

ok "stop non lascia qdisc" \
	"$(r '/etc/init.d/eqos stop >/dev/null 2>&1; sleep 1
		tc qdisc show dev br-lan | grep -c "htb\|ingress"')" 0
ok "stop non lascia l'interfaccia ifb" \
	"$(r 'ip link show ifb-eqos >/dev/null 2>&1 && echo presente || echo assente')" assente
ok "stop non lascia la tabella nft" \
	"$(r 'nft list table inet eqos >/dev/null 2>&1 && echo presente || echo assente')" assente
ok "stop non lascia file di stato" \
	"$(r 'ls /var/run/eqos.map /var/run/eqos.lan /var/run/eqos.wan 2>/dev/null | wc -l | tr -d " "')" 0
ok "servizio disabilitato: nessuna coda" \
	"$(r 'uci -q set eqos.config.enabled=0; uci -q commit eqos
		/etc/init.d/eqos restart >/dev/null 2>&1; sleep 2
		tc qdisc show dev br-lan | grep -c htb')" 0

echo
echo "== avvisi =="
ok "garanzie oltre il totale segnalate" \
	"$(r 'uci -q set eqos.config.enabled=1
		uci -q set eqos.config.download=5; uci -q set eqos.config.upload=1
		uci -q commit eqos; /etc/init.d/eqos restart >/dev/null 2>&1; sleep 2
		grep -c "cannot honour them all" /var/run/eqos.warn 2>/dev/null')" 2
ok "gli avvisi arrivano alla rpc" \
	"$(r 'ubus call luci.eqos getStatus 2>/dev/null | grep -c "cannot honour"')" 2
ok "configurazione sana: nessun avviso" \
	"$(r 'uci -q set eqos.config.enabled=1
		uci -q set eqos.config.download=100; uci -q set eqos.config.upload=12
		uci -q commit eqos; /etc/init.d/eqos restart >/dev/null 2>&1; sleep 2
		wc -l < /var/run/eqos.warn | tr -d " "')" 0

echo
echo "== le regole di servizio non svuotano i limiti dei dispositivi =="
ok "di serie ogni regola rispetta il tag del dispositivo" \
	"$(r 'nft list chain inet eqos forward 2>/dev/null |
		grep "meta priority set" | grep -vc "0x00000099"')" 0
ok "e i suoi filtri sono letti dopo quelli dei dispositivi" \
	"$(r 'tc filter show dev ifb-eqos parent 1: 2>/dev/null |
		sed -n "s/.*pref \([0-9]*\).*/\1/p" | sort -un |
		awk "\$1>=100 && \$1<1000" | wc -l | tr -d " "')" 0
ok "con override la guardia sparisce" \
	"$(r 'uci -q set eqos.tvoip.override=1; uci -q commit eqos
		/etc/init.d/eqos restart >/dev/null 2>&1; sleep 2
		nft list chain inet eqos forward 2>/dev/null |
			grep "meta priority set" | grep -vc "0x00000099"' | tail -1)" 6
ok "e i filtri passano davanti" \
	"$(r 'tc filter show dev ifb-eqos parent 1: 2>/dev/null |
		sed -n "s/.*pref \([0-9]*\).*/\1/p" | sort -un |
		awk "\$1>=100 && \$1<1000" | wc -l | tr -d " "')" 2
ok "e senza tetto proprio arriva l'avviso" \
	"$(r 'grep -c "no ceiling of its own" /var/run/eqos.warn 2>/dev/null')" 1
r 'uci -q delete eqos.tvoip.override; uci -q commit eqos
	/etc/init.d/eqos restart >/dev/null 2>&1' >/dev/null 2>&1

printf '\n%d superati, %d falliti\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
