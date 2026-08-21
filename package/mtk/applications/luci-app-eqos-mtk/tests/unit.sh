#!/bin/sh
# Pure functions from the two shell scripts, exercised without a router.
#
# Both scripts end in a dispatcher, so they are sourced up to it: everything
# above is definitions and constants and has no side effect.

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0

sed '/^case "\$1" in/,$d' "$ROOT/root/usr/sbin/eqos" > "$TMP/sbin.sh"
# Up to slot_free, the first function that depends on global state.
sed -n '/^is_uinteger()/,/^slot_free()/p' "$ROOT/root/etc/init.d/eqos" |
	sed '$d' > "$TMP/init.sh"

. "$TMP/sbin.sh"
. "$TMP/init.sh"

ok() {
	local what="$1"
	local got="$2"
	local want="$3"

	if [ "$got" = "$want" ]; then
		PASS=$((PASS + 1))
	else
		FAIL=$((FAIL + 1))
		printf 'FAIL  %s\n        atteso: %s\n        ottenuto: %s\n' \
			"$what" "$want" "$got"
	fi
}

rc() {
	local what="$1"
	local want="$2"
	shift 2

	if "$@" >/dev/null 2>&1; then
		ok "$what" 0 "$want"
	else
		ok "$what" 1 "$want"
	fi
}

echo "== is_uinteger =="
rc "is_uinteger 0"        0 is_uinteger 0
rc "is_uinteger 42"       0 is_uinteger 42
rc "is_uinteger vuoto"    1 is_uinteger ""
rc "is_uinteger -1"       1 is_uinteger -1
rc "is_uinteger 1.5"      1 is_uinteger 1.5
rc "is_uinteger 007"      1 is_uinteger 007
rc "is_uinteger '1 2'"    1 is_uinteger "1 2"

echo "== valid_ipv4 =="
rc "192.168.1.1"          0 valid_ipv4 192.168.1.1
rc "0.0.0.0"              0 valid_ipv4 0.0.0.0
rc "255.255.255.255"      0 valid_ipv4 255.255.255.255
rc "vuoto"                1 valid_ipv4 ""
rc "con lettere"          1 valid_ipv4 19a.1.1.1
rc "ottetto oltre 255"    1 valid_ipv4 192.168.1.256
rc "solo tre ottetti"     1 valid_ipv4 192.168.1
rc "cinque ottetti"       1 valid_ipv4 1.2.3.4.5
rc "punto finale"         1 valid_ipv4 1.2.3.4.
rc "punto iniziale"       1 valid_ipv4 .1.2.3
rc "punto doppio"         1 valid_ipv4 1..2.3
# This used to pass and put the whole LAN inside one device limit.
rc "prefisso 0.0.0.0/0"   1 valid_ipv4 0.0.0.0/0
rc "prefisso /24"         1 valid_ipv4 192.168.1.0/24

echo "== valid_ipv6 =="
rc "fd00::1"              0 valid_ipv6 fd00::1
rc "::1"                  0 valid_ipv6 ::1
rc "otto gruppi"          0 valid_ipv6 2001:db8:0:0:0:0:0:1
rc "maiuscole"            0 valid_ipv6 FD00::AB
rc "vuoto"                1 valid_ipv6 ""
rc "con g"                1 valid_ipv6 fg00::1
rc "senza due punti"      1 valid_ipv6 fd001
rc "gruppo di 5 cifre"    1 valid_ipv6 fd000::1
rc "tre due punti"        1 valid_ipv6 "fd00:::1"
rc "nove gruppi"          1 valid_ipv6 1:2:3:4:5:6:7:8:9
rc "sette senza ::"       1 valid_ipv6 1:2:3:4:5:6:7
rc "prefisso"             1 valid_ipv6 fe80::/10
rc "un IPv4"              1 valid_ipv6 192.168.1.1

echo "== queue_from_slot =="
ok "slot 1 up"    "$(queue_from_slot 1 up)"   1
ok "slot 30 up"   "$(queue_from_slot 30 up)"  30
ok "slot 1 dl"    "$(queue_from_slot 1 dl)"   32
ok "slot 30 dl"   "$(queue_from_slot 30 dl)"  61
ok "up mai su 31" "$([ "$(queue_from_slot 30 up)" -lt "$GLOBAL_UP_QID" ] && echo si)" si
ok "dl mai su 62" "$([ "$(queue_from_slot 30 dl)" -lt "$GLOBAL_DL_QID" ] && echo si)" si

echo "== tc_classid_from_slot =="
ok "slot 1"   "$(tc_classid_from_slot 1)"   1
ok "slot 26"  "$(tc_classid_from_slot 26)"  1a
ok "slot 30"  "$(tc_classid_from_slot 30)"  1e

echo "== htb_prio =="
ok "peso 15 critical" "$(htb_prio 15)" 0
ok "peso 8 high"      "$(htb_prio 8)"  1
ok "peso 4 normal"    "$(htb_prio 4)"  2
ok "peso 1 low"       "$(htb_prio 1)"  3
ok "peso assente"     "$(htb_prio '')" 2
ok "prio ordinato"    "$([ "$(htb_prio 15)" -lt "$(htb_prio 1)" ] && echo si)" si

echo "== htb_quantum =="
ok "peso 1"        "$(htb_quantum 1)"    1500
ok "peso 15"       "$(htb_quantum 15)"   22500
ok "peso 99 clamp" "$(htb_quantum 99)"   22500
ok "peso 0 clamp"  "$(htb_quantum 0)"    1500

echo "== htb_burst =="
# One millisecond of traffic, with a floor below which it makes no sense.
ok "100 Mbit"      "$(htb_burst 100000)"  12500
ok "1 Gbit"        "$(htb_burst 1000000)" 125000
ok "12 Mbit"       "$(htb_burst 12000)"   1600
ok "pavimento"     "$(htb_burst 1)"       1600
ok "rate assente"  "$(htb_burst '')"      1600
ok "cresce col rate" \
	"$([ "$(htb_burst 1000000)" -gt "$(htb_burst 100000)" ] && echo si)" si

echo "== tc_pref =="
ok "sotto il massimo" "$(tc_pref 1024)"  1024
ok "sopra il massimo" "$(tc_pref 70000)" 65535
ok "bande separate"   "$([ "$TC_TRAFFIC_PREF_BASE" -lt "$TC_DEVICE_PREF_BASE" ] && echo si)" si

echo "== dscp_value =="
ok "ef"      "$(dscp_value ef)"    46
ok "cs6"     "$(dscp_value cs6)"   48
ok "af41"    "$(dscp_value af41)"  34
ok "numero"  "$(dscp_value 46)"    46
ok "fuori range" "$(dscp_value 64)" ""
ok "spazzatura"  "$(dscp_value 'ef; rm -rf /')" ""

echo "== port_blocks =="
ok "porta singola" "$(port_blocks 443 443)" "443 0xffff"
ok "range piccolo" "$(port_blocks 100 103 | tr '\n' '|')" "100 0xfffc|"
ok "numero blocchi 10000-20000" "$(port_blocks 10000 20000 | wc -l | tr -d ' ')" 11
ok "range invertito" "$(port_blocks 200 100)" ""
ok "porta 0"         "$(port_blocks 0 10)" ""
ok "oltre 65535"     "$(port_blocks 60000 70000)" ""
ok "non numerico"    "$(port_blocks abc 100)" ""

# Coverage must be exact: every port in the range and none outside it.
cover_check() {
	local lo="$1" hi="$2"
	port_blocks "$lo" "$hi" | awk -v lo="$lo" -v hi="$hi" '
		{ v = $1; m = strtonum($2); for (p = 0; p <= 65535; p++)
			if (and(p, m) == v) seen[p] = 1 }
		END {
			for (p = lo; p <= hi; p++) if (!(p in seen)) { print "manca " p; exit }
			for (p in seen) if (p + 0 < lo || p + 0 > hi) { print "extra " p; exit }
			print "esatta"
		}'
}
if command -v gawk >/dev/null 2>&1; then
	ok "copertura 10000-20000" "$(cover_check 10000 20000 | gawk '{print}' | tail -1)" esatta
	ok "copertura 3478-3481"   "$(cover_check 3478 3481   | tail -1)" esatta
	ok "copertura 6881-6999"   "$(cover_check 6881 6999   | tail -1)" esatta
else
	echo "SKIP  copertura port_blocks (serve gawk per and()/strtonum())"
fi

echo "== clamp_hw_rate =="
ok "sotto il massimo v2" "$(clamp_hw_rate 100)"   100
ok "sopra il massimo v2" "$(clamp_hw_rate 5000)"  "$HW_RATE_MAX_V2"

echo "== priority (init.d) =="
ok "peso critical" "$(priority_weight critical)" 15
ok "peso high"     "$(priority_weight high)"     8
ok "peso normal"   "$(priority_weight normal)"   4
ok "peso low"      "$(priority_weight low)"      1
ok "peso ignoto"   "$(priority_weight boh)"      4
ok "rank ordinato" "$([ "$(priority_rank critical)" -gt "$(priority_rank low)" ] && echo si)" si
rc "valid_priority high"  0 valid_priority high
rc "valid_priority boh"   1 valid_priority boh
rc "valid_mac buono"      0 valid_mac aa:bb:cc:dd:ee:ff
rc "valid_mac corto"      1 valid_mac aa:bb:cc:dd:ee

echo "== finestre orarie (init.d) =="
rc "valid_clock 22:00"    0 valid_clock 22:00
rc "valid_clock 07:30"    0 valid_clock 07:30
rc "valid_clock 23:59"    0 valid_clock 23:59
rc "valid_clock 24:00"    1 valid_clock 24:00
rc "valid_clock 7:00"     1 valid_clock 7:00
rc "valid_clock 22:60"    1 valid_clock 22:60
rc "valid_clock vuoto"    1 valid_clock ""
ok "minuti di 00:00"      "$(clock_minutes 00:00)" 0
ok "minuti di 09:08"      "$(clock_minutes 09:08)" 548
ok "minuti di 23:59"      "$(clock_minutes 23:59)" 1439
# Una finestra che finisce prima di iniziare passa la mezzanotte.
rc "dentro 09:00-17:00"   0 in_window 540 1020 600
rc "fuori 09:00-17:00"    1 in_window 540 1020 1200
rc "bordo di apertura"    0 in_window 540 1020 540
rc "bordo di chiusura"    1 in_window 540 1020 1020
rc "dentro 22:00-07:00"   0 in_window 1320 420 1400
rc "dentro 22:00-07:00 di notte" 0 in_window 1320 420 60
rc "fuori 22:00-07:00"    1 in_window 1320 420 600
rc "estremi uguali"       0 in_window 600 600 0
rc "giorni vuoti"         0 in_weekdays "" mon
rc "giorno elencato"      0 in_weekdays "mon tue" tue
rc "giorno assente"       1 in_weekdays "mon tue" sat
rc "giorno maiuscolo"     0 in_weekdays "Mon Tue" mon

echo "== coerenza fra i due script =="
ok "QUEUE_SLOTS == HW_SLOT_MAX" \
	"$QUEUE_SLOTS" "$(sed -n 's/^HW_SLOT_MAX=//p' "$ROOT/root/etc/init.d/eqos")"
ok "WEIGHT_MAX uguale" \
	"$WEIGHT_MAX" "$(sed -n 's/^WEIGHT_MAX=//p' "$ROOT/root/etc/init.d/eqos")"
ok "TOTAL_RATE_MAX uguale" \
	"$TOTAL_RATE_MAX" "$(sed -n 's/^TOTAL_RATE_MAX=//p' "$ROOT/root/etc/init.d/eqos")"
ok "QDMA_RATE_MAX uguale" \
	"$QDMA_RATE_MAX" "$(sed -n 's/^QDMA_RATE_MAX=//p' "$ROOT/root/etc/init.d/eqos")"

SOFT_BASE="$(sed -n 's/^SOFT_SLOT_BASE=//p' "$ROOT/root/etc/init.d/eqos")"
ok "SOFT_SLOT_BASE non collide con GLOBAL_UP_QID" \
	"$([ "$SOFT_BASE" != "$GLOBAL_UP_QID" ] && echo si || echo no)" si
ok "SOFT_SLOT_BASE oltre i qid riservati" \
	"$([ "$SOFT_BASE" -gt "$PPD_QID" ] && echo si || echo no)" si

JS="$ROOT/htdocs/luci-static/resources/eqos/common.js"
ok "GLOBAL_UP_QID uguale in JS" \
	"$GLOBAL_UP_QID" "$(sed -n "s/^var GLOBAL_UP_QID = \([0-9]*\);/\1/p" "$JS")"
ok "GLOBAL_DL_QID uguale in JS" \
	"$GLOBAL_DL_QID" "$(sed -n "s/^var GLOBAL_DL_QID = \([0-9]*\);/\1/p" "$JS")"
ok "HW_SLOT_MAX uguale in JS" \
	"$QUEUE_SLOTS" "$(sed -n "s/^var HW_SLOT_MAX = \([0-9]*\);/\1/p" "$JS")"
ok "SOFT_SLOT_BASE uguale in JS" \
	"$SOFT_BASE" "$(sed -n "s/^var SOFT_SLOT_BASE = \([0-9]*\);/\1/p" "$JS")"

printf '\n%d superati, %d falliti\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
