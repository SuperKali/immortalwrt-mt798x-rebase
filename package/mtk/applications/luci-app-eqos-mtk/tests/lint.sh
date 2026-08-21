#!/bin/sh
# Checks that need no router: syntax, catalogues, house style.

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0
FAIL=0

ok() {
	if [ "$2" = "$3" ]; then
		PASS=$((PASS + 1))
	else
		FAIL=$((FAIL + 1))
		printf 'FAIL  %s\n        atteso: %s\n        ottenuto: %s\n' "$1" "$3" "$2"
	fi
}

echo "== sintassi shell =="
for f in "$ROOT/root/usr/sbin/eqos" "$ROOT/root/etc/init.d/eqos" \
	"$ROOT"/root/etc/hotplug.d/*/*; do
	[ -f "$f" ] || continue
	ok "sh -n $(basename "$(dirname "$f")")/$(basename "$f")" \
		"$(sh -n "$f" 2>&1 | head -1)" ""
done

echo "== sintassi JavaScript =="
if command -v node >/dev/null 2>&1; then
	for f in "$ROOT"/htdocs/luci-static/resources/eqos/*.js \
		"$ROOT"/htdocs/luci-static/resources/view/eqos/*.js; do
		ok "node --check $(basename "$f")" \
			"$(node --check "$f" 2>&1 | head -1)" ""
	done
else
	echo "SKIP  node non disponibile"
fi

echo "== JSON =="
for f in "$ROOT"/root/usr/share/luci/menu.d/*.json "$ROOT"/root/usr/share/rpcd/acl.d/*.json; do
	ok "json $(basename "$f")" \
		"$(python3 -c "import json,sys;json.load(open(sys.argv[1]))" "$f" 2>&1 | tail -1)" ""
done

echo "== metodi rpc: acl, implementazione, uso =="
IMPL="$(sed -n 's/^\t\([a-zA-Z]*\): {$/\1/p' "$ROOT/root/usr/share/rpcd/ucode/luci.eqos" | sort)"
ACL="$(python3 - "$ROOT" <<'EOF' | sort
import json, glob, sys
for f in glob.glob(sys.argv[1] + '/root/usr/share/rpcd/acl.d/*.json'):
    d = json.load(open(f))
    for v in d.values():
        for m in v.get('read', {}).get('ubus', {}).get('luci.eqos', []):
            print(m)
EOF
)"
USED="$(grep -ho "method: '[a-zA-Z]*'" "$ROOT"/htdocs/luci-static/resources/view/eqos/*.js |
	sed "s/method: '//;s/'//" | sort -u)"
ok "ogni metodo usato e' implementato" \
	"$(comm -23 <(echo "$USED") <(echo "$IMPL") | tr '\n' ' ' | sed 's/ $//')" ""
ok "ogni metodo usato e' nell'acl" \
	"$(comm -23 <(echo "$USED") <(echo "$ACL") | tr '\n' ' ' | sed 's/ $//')" ""
UNUSED="$(comm -13 <(echo "$USED") <(echo "$IMPL") | tr '\n' ' ' | sed 's/ $//')"
[ -z "$UNUSED" ] || echo "NOTA  metodi implementati e mai usati: $UNUSED"

echo "== stile: niente em dash o en dash nel testo mostrato =="
HITS="$(grep -n $'—\|–' \
	"$ROOT"/htdocs/luci-static/resources/eqos/*.js \
	"$ROOT"/htdocs/luci-static/resources/view/eqos/*.js \
	"$ROOT"/po/templates/*.pot 2>/dev/null | head -5)"
ok "nessun trattino lungo" "$HITS" ""

echo "== catalogo di traduzione =="
if command -v msgfmt >/dev/null 2>&1; then
	ok "pot valido" "$(msgfmt --check-format -o /dev/null "$ROOT/po/templates/eqos.pot" 2>&1 | grep -v warning | head -1)" ""
	for po in "$ROOT"/po/*/*.po; do
		ok "po valido $(basename "$(dirname "$po")")" \
			"$(msgfmt --check -o /dev/null "$po" 2>&1 | grep -v warning | head -1)" ""
		# Every msgid in the template must exist in the translated catalogue.
		# The header is an empty msgid and always shows up, so it does not count.
		MISSING="$(msgcomm --unique --no-wrap "$ROOT/po/templates/eqos.pot" "$po" 2>/dev/null |
			grep '^msgid "' | grep -vc '^msgid ""$' || true)"
		ok "nessun msgid mancante in $(basename "$(dirname "$po")")" "$MISSING" 0
	done
else
	echo "SKIP  gettext non disponibile"
fi

echo "== ogni vista referenziata dal menu esiste =="
for path in $(python3 - "$ROOT" <<'EOF'
import json, glob, sys
for f in glob.glob(sys.argv[1] + '/root/usr/share/luci/menu.d/*.json'):
    for v in json.load(open(f)).values():
        a = v.get('action', {})
        if a.get('type') == 'view':
            print(a['path'])
EOF
); do
	ok "vista $path" \
		"$([ -f "$ROOT/htdocs/luci-static/resources/view/$path.js" ] && echo si || echo no)" si
done

echo "== il Makefile dichiara le dipendenze usate =="
# Without the cake module the service falls back to fq_codel and says nothing,
# so the dependency has to be declared. The dummy device carries the probe that
# decides which of the two is there.
for dep in tc nftables kmod-sched-core kmod-sched-cake kmod-ifb kmod-dummy; do
	ok "dipendenza $dep" \
		"$(grep -q -- "+$dep" "$ROOT/Makefile" && echo si || echo no)" si
done

echo "== configurazione di serie =="
DEF="$ROOT/root/etc/config/eqos"
ok "il servizio nasce spento" \
	"$(sed -n 's/^\toption enabled *\([0-9]*\)$/\1/p' "$DEF" | head -1)" 0
# Every option named in the file, commented examples included, has to be read
# by the service or by the interface. A documented option nobody reads is a
# promise the code does not keep.
for opt in $(sed -n 's/^#\?\toption *\([a-z_]*\).*/\1/p' "$DEF" | sort -u); do
	inservice=$(grep -c "config_get.*$opt\|config_get_bool.*$opt" \
		"$ROOT/root/etc/init.d/eqos")
	inui=$(cat "$ROOT"/htdocs/luci-static/resources/view/eqos/*.js \
		"$ROOT/htdocs/luci-static/resources/eqos/common.js" |
		grep -c "'$opt'")
	ok "opzione $opt letta da qualcuno" \
		"$([ "$inservice" -gt 0 ] || [ "$inui" -gt 0 ] && echo si || echo no)" si
done
# The limits quoted in the comments must be the ones in the code.
ok "il commento cita la base software giusta" \
	"$(grep -c "64 and above\|64 upwards" "$DEF")" 2
ok "SOFT_SLOT_BASE e' davvero 64" \
	"$(sed -n 's/^SOFT_SLOT_BASE=//p' "$ROOT/root/etc/init.d/eqos")" 64
# Every section type the service enumerates must appear in the file.
for t in device profile traffic; do
	ok "il tipo di sezione $t e' documentato" \
		"$(grep -qE "^#?config $t" "$DEF" && echo si || echo no)" si
done

printf '\n%d superati, %d falliti\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
