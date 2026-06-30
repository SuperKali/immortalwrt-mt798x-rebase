#!/bin/sh
# LinkUp OS - shared rpcd helper library
# Sourced by /usr/libexec/rpcd/linkup.* plugins.
#
# Serial-port map on the FM350 (verified on ZX7981PD):
#   ttyUSB2 = status/info  -> handled by 3ginfo.sh (its own flock + cache)
#   ttyUSB3 = WAN data     -> held open by the atc netifd proto, DO NOT touch
#   ttyUSB1 = free AT ctrl  -> bands / sms / ussd / at-console / esim  (shared, locked here)
#
# Environment notes (verified live):
#   * flock is BusyBox  -> NO "-w" flag; use blocking "flock -x 9", bound AT ops with timeout.
#   * jq has NO oniguruma -> gsub/match/test/sub unavailable; use only split()/join() string ops.

. /usr/share/libubox/jshn.sh 2>/dev/null

LINKUP_LOCK="/var/lock/linkup.usb1.lock"
LINKUP_AT_TIMEOUT="${LINKUP_AT_TIMEOUT:-15}"

# Resolve the free AT control port (shared by bands/sms/ussd/at/esim).
linkup_at_port() {
	local p
	p=$(uci -q get linkup.main.at_port)
	[ -n "$p" ] || p=$(uci -q get modemband.@modemband[0].set_port)
	[ -n "$p" ] || p="/dev/ttyUSB1"
	echo "$p"
}

# Run a command serialized on the AT control-port lock (BusyBox flock, blocking).
linkup_run_locked() {
	( flock -x 9; "$@" ) 9>"$LINKUP_LOCK"
}

# Send a raw AT command on the locked control port; echoes raw modem output.
linkup_at() {
	local port; port=$(linkup_at_port)
	( flock -x 9; timeout "$LINKUP_AT_TIMEOUT" sms_tool -d "$port" at "$1" 2>/dev/null ) 9>"$LINKUP_LOCK"
}

# Run lpac (eSIM) against the raw binary with the AT backend on the locked control port.
# Calls /usr/lib/lpac directly (bypasses the /usr/bin/lpac wrapper, which would force the
# uci-configured device = ttyUSB3 = the atc WAN port). echoes lpac's JSON envelope(s).
linkup_lpac() {
	local port; port=$(linkup_at_port)
	( flock -x 9; LPAC_APDU=at LPAC_HTTP=curl AT_DEVICE="$port" \
		timeout "${LINKUP_ESIM_TIMEOUT:-45}" /usr/lib/lpac "$@" 2>/dev/null ) 9>"$LINKUP_LOCK"
}

# Emit a JSON error object on stdout.
linkup_err() { jq -n --arg e "$1" '{ok:false,error:$e}'; }

# ---- modem status: normalize 3ginfo.sh json into a typed, sentinel-free object ----
# NOTE: regex-free jq (no oniguruma). num takes the first space-token then tonumber.
linkup_modem_status_json() {
	local raw out
	raw=$(/usr/share/3ginfo-lite/3ginfo.sh json 2>/dev/null)
	[ -n "$raw" ] || { linkup_err "modem not responding"; return; }
	out=$(printf '%s' "$raw" | jq -c '
		def num: if . == null then null
			elif type=="number" then .
			else (tostring|split(" ")[0]) as $t
				| if ($t=="" or $t=="-" or $t=="+") then null else ($t|tonumber? // null) end end;
		def clean: if . == null then null else (tostring)
			| if (.=="" or .=="-") then null else . end end;
		def trim: if . == null then null else (split(" ")|map(select(.!=""))|join(" ")) end;
		{
			ok:true,
			device:(.cport|clean),
			modem:(.modem|clean|trim),
			firmware:(.firmware|clean),
			protocol:(.protocol|clean),
			temperature_c:(.mtemp|num),
			registration:(.registration|clean),
			mode:(.mode|clean),
			tech:(.mode|clean| if .==null then null else (split("|")[0]|trim) end),
			operator:{ name:(.operator_name|clean), mcc:(.operator_mcc|clean), mnc:(.operator_mnc|clean),
				plmn:((.operator_mcc|clean) as $a|(.operator_mnc|clean) as $b| if $a and $b then $a+$b else null end),
				location:(.location|clean) },
			sim:{ imei:(.imei|clean), imsi:(.imsi|clean), iccid:(.iccid|clean), slot:(.simslot|clean) },
			signal:{ csq:(.csq|num), percent:(.signal|num),
				rsrp:(.rsrp|num), rsrq:(.rsrq|num), rssi:(.rssi|num), sinr:(.sinr|num),
				nr_rsrp:(.nr_rsrp|num), nr_rsrq:(.nr_rsrq|num), nr_sinr:(.nr_sinr|num) },
			serving:{ band:(.pband|clean), earfcn:(.earfcn|num), pci:(.pci|num),
				tac:{ dec:((.tac_dec|num)//(.tac_d|num)), hex:((.tac_hex|clean)//(.tac_h|clean)) },
				cid:{ dec:(.cid_dec|num), hex:(.cid_hex|clean) },
				lac:{ dec:(.lac_dec|num), hex:(.lac_hex|clean) } },
			carriers:([ {role:"PCC", band:(.pband|clean), pci:(.pci|num), earfcn:(.earfcn|num)},
				{role:"SCC1", band:(.s1band|clean), pci:(.s1pci|num), earfcn:(.s1earfcn|num)},
				{role:"SCC2", band:(.s2band|clean), pci:(.s2pci|num), earfcn:(.s2earfcn|num)},
				{role:"SCC3", band:(.s3band|clean), pci:(.s3pci|num), earfcn:(.s3earfcn|num)},
				{role:"SCC4", band:(.s4band|clean), pci:(.s4pci|num), earfcn:(.s4earfcn|num)} ]
				| map(select(.band != null))),
			traffic:{ rx:(.rx|clean), tx:(.tx|clean), conn_time:(.conn_time|clean),
				conn_time_sec:(.conn_time_sec|num), since:(.conn_time_since|clean) }
		}' 2>/dev/null)
	[ -n "$out" ] && echo "$out" || linkup_err "parse error"
}

# ---- bands: reshape modemband.sh json into {lte,nsa5g,sa5g:{supported,enabled}} ----
linkup_bands_get_json() {
	local raw
	raw=$(linkup_run_locked /usr/bin/modemband.sh json 2>/dev/null)
	[ -n "$raw" ] || { linkup_err "modemband failed"; return; }
	printf '%s' "$raw" | jq -c '
		{ ok:(has("error")|not), error:(.error//null), modem:(.modem//null),
		  lte:{supported:(.supported//[]),enabled:(.enabled//[])},
		  nsa5g:{supported:(.supported5gnsa//[]),enabled:(.enabled5gnsa//[])},
		  sa5g:{supported:(.supported5gsa//[]),enabled:(.enabled5gsa//[])} }' 2>/dev/null \
		|| linkup_err "parse error"
}
