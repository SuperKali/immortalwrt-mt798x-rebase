'use strict';
'require baseclass';
'require rpc';
'require uci';

/* Shared by four views, so the method names live in one place. */
var callStatus = rpc.declare({
	object: 'luci.eqos', method: 'getStatus', expect: { '': {} }
});

var callRuleStats = rpc.declare({
	object: 'luci.eqos', method: 'getRuleStats', expect: { '': {} }
});

/* Mbit/s. Same number as TOTAL_RATE_MAX in the service scripts. */
var RATE_MAX = 10000;

/* Queue slots are handed out by the init script, not stored in the config, so
   the mapping between a rule and its queue comes back from luci.eqos. */
var HW_SLOT_MAX = 30;
var SOFT_SLOT_BASE = 64;
var GLOBAL_UP_QID = 31;
var GLOBAL_DL_QID = 62;
var DL_QID_OFFSET = 31;
var WEIGHT_MAX = 15;

/* Neutral greys keep the panels readable on light and dark themes alike; the
   only saturated colours are the small priority dots. */
var STYLE = '' +
'.eqos-cards{display:flex;flex-wrap:wrap;gap:.75em;margin-bottom:1em}' +
'.eqos-card{flex:1 1 13em;min-width:11em;padding:.7em .9em;border-radius:6px;' +
'border:1px solid rgba(128,128,128,.35);background:rgba(128,128,128,.06)}' +
'.eqos-card-title{font-size:.8em;text-transform:uppercase;letter-spacing:.04em;' +
'opacity:.7;overflow-wrap:anywhere}' +
'.eqos-card-value{font-size:1.35em;font-weight:600;line-height:1.4;word-break:break-word}' +
'.eqos-card-sub{font-size:.85em;opacity:.75;overflow-wrap:anywhere}' +
'.eqos-dot{display:inline-block;width:.62em;height:.62em;border-radius:50%;' +
'margin-right:.45em;vertical-align:baseline}' +
'.eqos-muted{opacity:.6}' +
/* Senza righe la tabella sparisce e le due sezioni si toccano: la riga
   vuota si tiene il posto che avrebbe avuto la tabella. */
'.eqos-empty{opacity:.6;padding:.85em 0 1.4em}' +
'.eqos-bar{height:.4em;border-radius:.2em;background:rgba(128,128,128,.18);' +
'overflow:hidden;margin-top:.25em}' +
'.eqos-bar>i{display:block;height:100%;border-radius:.2em;' +
'transition:width .45s ease-out}' +

/* The rate cells fill from the left in proportion to the ceiling, so the bar
   is the cell itself rather than another element competing with the number.
   A separate track would run the width of the page and sit empty most of the
   time, which is a lot of furniture for one number. */
'.eqos-col-rate{text-align:right;width:10em}' +
'.eqos-rate-num{font-family:monospace;font-size:1.02em;font-weight:600;'+
'white-space:nowrap}' +
'.eqos-rate-cap{font-size:.78em;opacity:.55;overflow-wrap:anywhere}' +
'.eqos-name{font-weight:600;overflow-wrap:anywhere}' +
'.eqos-sub{font-size:.83em;opacity:.62;overflow-wrap:anywhere}' +
'.eqos-drop{font-size:.78em;opacity:.6;white-space:nowrap}' +

'.eqos-live{display:flex;flex-direction:column;font-family:monospace;' +
'font-size:.9em;line-height:1.35}' +
'.eqos-live>span{white-space:nowrap}' +
'.eqos-live-down{color:#3d84cc}' +
'.eqos-ico{display:inline-block;width:1.15em;height:1.15em;vertical-align:-.2em;' +
'margin-right:.45em;background:no-repeat center/contain}' +
'.eqos-ico-down{background-image:url("data:image/svg+xml,' +
"%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' " +
"stroke='%233d84cc' stroke-width='2.6' stroke-linecap='round' " +
"stroke-linejoin='round'%3E%3Cpath d='M12 4v14M5 11l7 7 7-7'/%3E%3C/svg%3E" +
'")}' +
'.eqos-ico-up{background-image:url("data:image/svg+xml,' +
"%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' " +
"stroke='%238e6bc4' stroke-width='2.6' stroke-linecap='round' " +
"stroke-linejoin='round'%3E%3Cpath d='M12 20V6M5 13l7-7 7 7'/%3E%3C/svg%3E" +
'")}' +
'.eqos-ico-service{background-image:url("data:image/svg+xml,' +
	"%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' " +
	"stroke='%2343a047' stroke-width='2.4' stroke-linecap='round' " +
	"stroke-linejoin='round'%3E%3Cpath d='M3.6 17.5a9 9 0 1 1 16.8 0'/%3E" +
	"%3Cpath d='M12 17l4.2-5.2'/%3E%3C/svg%3E" +
	'")}' +
'.eqos-ico-queue{background-image:url("data:image/svg+xml,' +
"%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' " +
"stroke='%2340a58a' stroke-width='2.6' stroke-linecap='round'%3E" +
"%3Cpath d='M4 7h16M4 12h11M4 17h6'/%3E%3C/svg%3E" +
'")}' +

/* A service that is running is the one thing on the page that changes by
   itself, so it is the one thing that earns motion. */
'.eqos-pulse{display:inline-block;width:.6em;height:.6em;border-radius:50%;' +
'margin-right:.5em;vertical-align:.05em;background:#43a047;' +
'box-shadow:0 0 0 0 rgba(67,160,71,.55);animation:eqos-beat 2s infinite}' +
'.eqos-pulse-off{background:#9aa4ad;animation:none;box-shadow:none}' +
/* Running without offload is its own state, and a green dot would hide it. */
'.eqos-pulse-warn{background:#fb8c00;animation:eqos-beat-warn 2s infinite;' +
'box-shadow:0 0 0 0 rgba(251,140,0,.55)}' +
'@keyframes eqos-beat-warn{0%{box-shadow:0 0 0 0 rgba(251,140,0,.5)}' +
'70%{box-shadow:0 0 0 .55em rgba(251,140,0,0)}' +
'100%{box-shadow:0 0 0 0 rgba(251,140,0,0)}}' +
'@keyframes eqos-beat{0%{box-shadow:0 0 0 0 rgba(67,160,71,.5)}' +
'70%{box-shadow:0 0 0 .55em rgba(67,160,71,0)}' +
'100%{box-shadow:0 0 0 0 rgba(67,160,71,0)}}' +
'.eqos-lead{opacity:.72;margin:-.3em 0 1em;max-width:62em}' +
'.eqos-skel{display:block;width:4.6em;height:.72em;margin:.16em 0;' +
'border-radius:.2em;background:rgba(128,128,128,.2);' +
'animation:eqos-pulse 1.3s ease-in-out infinite}' +
'@keyframes eqos-pulse{0%,100%{opacity:1}50%{opacity:.4}}' +
'.eqos-live-up{color:#8e6bc4}' +
/* A card states its rates up front instead of hiding them behind a hover. */
'.eqos-presets{display:grid;gap:.5em;margin:.4em 0 1.3em;' +
'grid-template-columns:repeat(auto-fill,minmax(14em,1fr))}' +
'.eqos-preset{padding:.6em .75em;border-radius:6px;cursor:pointer;' +
'border:1px solid rgba(128,128,128,.35);background:rgba(128,128,128,.06);' +
'transition:border-color .15s ease,transform .15s ease}' +
'.eqos-preset:hover{border-color:rgba(128,128,128,.75);transform:translateY(-1px)}' +
'.eqos-preset:focus{outline:2px solid rgba(128,128,128,.5);outline-offset:1px}' +
'.eqos-preset-name{font-weight:600;margin-left:.1em}' +
'.eqos-preset-hint{font-size:.8em;opacity:.68;margin-top:.25em;' +
'line-height:1.35;overflow-wrap:anywhere}' +
'.eqos-preset-label{font-size:.8em;text-transform:uppercase;' +
'letter-spacing:.04em;opacity:.7;display:block;margin-bottom:.1em}' +
'.eqos-members{font-size:.85em;overflow-wrap:anywhere}' +
'.eqos-members>div{opacity:.75}';

/* The number on its own, so a range can carry a single shared unit. */
function bare(value) {
	return (value === Math.floor(value))
		? '%d'.format(value) : '%.1f'.format(value);
}

function fmtKbit(kbit) {
	if (!kbit)
		return _('unlimited');

	if (kbit >= 1000) {
		var mbit = kbit / 1000;

		return (mbit === Math.floor(mbit))
			? '%d Mbit/s'.format(mbit)
			: '%.1f Mbit/s'.format(mbit);
	}

	return '%d kbit/s'.format(kbit);
}

/* Only the directions that carry a rate, so a preset that leaves one alone
   does not claim to do something with it. */
function ratePair(dl, up) {
	var parts = [];

	if (Number(dl || 0))
		parts.push(_('%s down').format(fmtKbit(dl)));
	if (Number(up || 0))
		parts.push(_('%s up').format(fmtKbit(up)));

	return parts.join(', ');
}

/* A preset that only guarantees a rate lets the device use the whole link, and
   that reads as a broken limit unless it is spelled out. Derived from the
   options so the wording and the values can never drift apart. */
function presetHint(preset) {
	var o = preset.opts;
	var parts = [];

	if (Number(o.download || 0) || Number(o.upload || 0))
		parts.push(_('limits to %s').format(ratePair(o.download, o.upload)));
	else
		parts.push(_('no ceiling, so it can use the whole line'));

	if (Number(o.min_download || 0) || Number(o.min_upload || 0))
		parts.push(_('keeps %s').format(ratePair(o.min_download, o.min_upload)));

	if (o.priority === 'low' && !Number(o.download || 0) && !Number(o.upload || 0))
		parts[0] = _('served last, so it yields to everything else');

	if (o.priority === 'critical' && !Number(o.download || 0) &&
	    !Number(o.upload || 0) && !Number(o.min_download || 0) &&
	    !Number(o.min_upload || 0))
		parts[0] = _('no limit of its own, and served before everything else');

	if (o.shared === '1')
		parts.push(_('members split one queue'));

	return parts.join(' · ');
}

/* Weights are not here: the map from a level to a weight is configurable, so a
   copy in the interface would go stale the moment somebody changes it. */
var PRIORITY = {
	critical: { color: '#e53935' },
	high:     { color: '#fb8c00' },
	normal:   { color: '#43a047' },
	low:      { color: '#78909c' }
};

/* Rates live in the configuration as kbit/s. */
/* Rates live in the configuration as kbit/s. The guarantees are sized on what
   the application really consumes, not on what feels generous: a guarantee is
   bandwidth taken away from everyone else, so a game reserving 20 Mbit/s to
   carry 200 kbit/s of traffic starves the line for nothing. The four latency
   bound presets set no ceiling, because what they need is to be served first,
   not to be held back. */
var PRESETS = [
	{ id: 'voip', label: _('Voice calls'), name: 'Voice calls', opts: {
		priority: 'critical', download: '0', upload: '0',
		min_download: '512', min_upload: '512', shared: '0' } },
	{ id: 'videocalls', label: _('Video calls'), name: 'Video calls', opts: {
		priority: 'critical', download: '0', upload: '0',
		min_download: '4000', min_upload: '3000', shared: '0' } },
	{ id: 'gaming', label: _('Gaming'), name: 'Gaming', opts: {
		priority: 'critical', download: '0', upload: '0',
		min_download: '1500', min_upload: '750', shared: '0' } },
	{ id: 'work', label: _('Work'), name: 'Work', opts: {
		priority: 'high', download: '0', upload: '0',
		min_download: '5000', min_upload: '2000', shared: '0' } },
	{ id: 'streaming', label: _('Streaming'), name: 'Streaming', opts: {
		priority: 'high', download: '0', upload: '0',
		min_download: '8000', min_upload: '0', shared: '0' } },
	{ id: 'cameras', label: _('Cameras'), name: 'Cameras', opts: {
		priority: 'normal', download: '0', upload: '6000',
		min_download: '0', min_upload: '2000', shared: '1' } },
	{ id: 'guests', label: _('Guests'), name: 'Guests', opts: {
		priority: 'low', download: '20000', upload: '5000', shared: '1' } },
	{ id: 'iot', label: _('IoT'), name: 'IoT', opts: {
		priority: 'low', download: '2000', upload: '1000', shared: '1' } },
	/* As close to "leave me alone" as the line total allows: no limit of its
	   own, served first. */
	{ id: 'priority', label: _('No limits'), name: 'No limits', opts: {
		priority: 'critical', download: '0', upload: '0',
		min_download: '0', min_upload: '0', shared: '0' } },
	{ id: 'bulk', label: _('Downloads'), name: 'Downloads', opts: {
		priority: 'low', download: '0', upload: '0',
		min_download: '0', min_upload: '0', shared: '0' } }
];

/* Services worth sorting by, with the ports they actually use. Ports beat
   guesswork here: a phone marks its own packets EF and a console does not, so
   both handles are offered and a rule can carry either. */
var TRAFFIC_PRESETS = [
	{ id: 'voip', label: _('VoIP'), name: 'VoIP', opts: {
		priority: 'critical', proto: 'udp', ports: '5060,5061,10000-20000',
		dscp: 'ef', download: '0', upload: '0',
		min_download: '512', min_upload: '512' } },
	{ id: 'meetings', label: _('Video meetings'), name: 'Video meetings', opts: {
		priority: 'critical', proto: 'udp',
		ports: '3478-3481,8801-8810,19302-19309', dscp: '',
		download: '0', upload: '0',
		min_download: '4000', min_upload: '3000' } },
	{ id: 'consoles', label: _('Game consoles'), name: 'Game consoles', opts: {
		priority: 'critical', proto: 'udp',
		ports: '3074,3478-3480,27000-27050', dscp: '',
		download: '0', upload: '0',
		min_download: '1500', min_upload: '750' } },
	{ id: 'dns', label: _('DNS'), name: 'DNS', opts: {
		priority: 'critical', proto: 'tcpudp', ports: '53,853', dscp: '',
		download: '0', upload: '0',
		min_download: '256', min_upload: '256' } },
	{ id: 'remote', label: _('Remote desktop'), name: 'Remote desktop', opts: {
		priority: 'high', proto: 'tcpudp', ports: '22,3389,5900', dscp: '',
		download: '0', upload: '0',
		min_download: '2000', min_upload: '1000' } },
	{ id: 'torrent', label: _('File sharing'), name: 'File sharing', opts: {
		priority: 'low', proto: 'tcpudp', ports: '6881-6999,51413', dscp: '',
		download: '0', upload: '0',
		min_download: '0', min_upload: '0' } }
];

/* The match in one line, the way the status page shows it. */
function trafficMatch(opts) {
	var parts = [];

	if (opts.proto && opts.ports)
		parts.push('%s %s'.format(protoLabel(opts.proto), opts.ports));
	else if (opts.proto)
		parts.push(protoLabel(opts.proto));

	if (opts.dscp)
		parts.push(_('marked %s').format(String(opts.dscp).toUpperCase()));

	return parts.join(' · ');
}

function protoLabel(proto) {
	if (proto === 'tcp')
		return _('TCP');

	if (proto === 'udp')
		return _('UDP');

	if (proto === 'tcpudp' || proto === 'both')
		return _('TCP and UDP');

	return '';
}

return baseclass.extend({
	TRAFFIC_PRESETS: TRAFFIC_PRESETS,
	trafficMatch: trafficMatch,
	protoLabel: protoLabel,

	presetHint: presetHint,

	/* The click handler comes from the caller: a profile and a service rule
	   write different sections. */
	presetGrid: function(label, list, hintOf, handlerFor) {
		var self = this;

		return E('div', {}, [
			E('span', { 'class': 'eqos-preset-label' }, label),
			E('div', { 'class': 'eqos-presets' }, list.map(function(preset) {
				return E('div', {
					'class': 'eqos-preset',
					'tabindex': '0',
					'click': handlerFor(preset),
					'keydown': function(ev) {
						if (ev.key === 'Enter' || ev.key === ' ') {
							ev.preventDefault();
							ev.currentTarget.click();
						}
					}
				}, [
					E('div', {}, [
						self.priorityDot(preset.opts.priority),
						E('span', { 'class': 'eqos-preset-name' }, preset.label)
					]),
					E('div', { 'class': 'eqos-preset-hint' }, '%s · %s'.format(
						self.priorityLabel(preset.opts.priority),
						hintOf(preset)))
				]);
			}))
		]);
	},


	/* Both directions on one line: in a grid there is room for a figure, not
	   for a pair of meters. */
	liveCell: function(rates) {
		/* A rate needs two samples: until the second one lands there is nothing
		   to show, and a placeholder that looks like the value it will become
		   says "waiting" without pretending to be a reading of zero. */
		if (!rates)
			return E('span', { 'class': 'eqos-live' }, [
				E('span', { 'class': 'eqos-skel' }),
				E('span', { 'class': 'eqos-skel' })
			]);

		return E('span', { 'class': 'eqos-live' }, [
			E('span', { 'class': 'eqos-live-down' },
				'\u2193 %s'.format(this.fmtBps(rates.down || 0))),
			E('span', { 'class': 'eqos-live-up' },
				'\u2191 %s'.format(this.fmtBps(rates.up || 0)))
		]);
	},
	/* The backend hands out cumulative counters, never rates: its state would
	   be shared by every client polling it, and one client's interval paired
	   with another's byte delta produces a rate several times the real one.
	   Each view keeps a tracker of its own, so the interval always belongs to
	   the same pair of readings. */
	rateTracker: function() {
		var prevSample = null;

		return function(sample) {
		var out = { slots: {}, addresses: {}, link: {} };
		var prev = prevSample;
		var slots = sample.slots || {};
		var dt = 0;

		prevSample = sample;

		if (prev && prev.time && sample.time)
			dt = (sample.time - prev.time) / 1000;

		/* Below a fifth of a second counter granularity is the whole signal. */
		if (dt < 0.2)
			dt = 0;

		for (var key in slots) {
			var c = slots[key];
			var p = prev ? (prev.slots || {})[key] : null;
			var e = { bps: 0, pps: 0, drops: c.drops || 0 };

			/* A counter that went backwards was reset, it is not a rate. */
			if (dt && p && c.bytes >= p.bytes) {
				e.bps = (c.bytes - p.bytes) * 8 / dt;
				e.pps = (c.packets - p.packets) / dt;
			}

			out.slots[key] = e;
		}

		var addrs = sample.addresses || {};
		var prevAddrs = prev ? (prev.addresses || {}) : {};

		for (var addr in addrs) {
			var e = {};

			for (var dir in addrs[addr]) {
				var c = addrs[addr][dir];
				var p = (prevAddrs[addr] || {})[dir];

				e[dir] = (dt && p && c.bytes >= p.bytes)
					? (c.bytes - p.bytes) * 8 / dt : 0;
			}

			out.addresses[addr] = e;
		}

		if (dt && prev && prev.link && sample.link) {
			if (sample.link.down >= prev.link.down)
				out.link.down_bps = (sample.link.down - prev.link.down) * 8 / dt;
			if (sample.link.up >= prev.link.up)
				out.link.up_bps = (sample.link.up - prev.link.up) * 8 / dt;
		}

		return out;
		};
	},


	/* The section name is an identifier; what the user named the profile is on
	   the profile itself. */
	/* Which selector a value is: a MAC has six pairs, an IPv6 has colons and
	   is not a MAC, anything else is treated as IPv4 and the datatype on the
	   field has already refused whatever is not one of the three. */
	selectorFor: function(value) {
		if (/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(value))
			return 'mac';

		return (value.indexOf(':') >= 0) ? 'ip6' : 'ip';
	},

	memberAddress: function(section) {
		var selector = section.selector;

		if (selector !== 'ip' && selector !== 'ip6' && selector !== 'mac')
			selector = section.mac ? 'mac' : (section.ip6 ? 'ip6' : 'ip');

		return section[selector] || '';
	},

	profileMembers: function(profile) {
		return uci.sections('eqos', 'device').filter(function(d) {
			return d.profile === profile;
		});
	},

	/* The membership of a group is the set of device rules pointing at it, so
	   editing the list edits those rules. Only the rules this profile owns are
	   touched, and a member that is already there keeps whatever else was set
	   on it. */
	syncProfileMembers: function(profile, values) {
		var self = this;
		var existing = this.profileMembers(profile);
		var wanted = {};
		var keep = {};

		values.forEach(function(v) { wanted[String(v).toLowerCase()] = v; });

		existing.forEach(function(d) {
			var addr = self.memberAddress(d).toLowerCase();

			if (wanted[addr])
				keep[addr] = true;
			else
				uci.remove('eqos', d['.name']);
		});

		values.forEach(function(v) {
			var addr = String(v).toLowerCase();

			if (keep[addr])
				return;

			keep[addr] = true;

			var selector = self.selectorFor(v);
			var id = uci.add('eqos', 'device');

			uci.set('eqos', id, 'enabled', '1');
			uci.set('eqos', id, 'selector', selector);
			uci.set('eqos', id, selector, v);
			uci.set('eqos', id, 'profile', profile);
			uci.set('eqos', id, 'download', '0');
			uci.set('eqos', id, 'upload', '0');
		});
	},

	profileLabel: function(section) {
		if (!section)
			return null;

		return uci.get('eqos', section, 'name') || section;
	},

	HW_SLOT_MAX: HW_SLOT_MAX,
	WEIGHT_MAX: WEIGHT_MAX,
	RATE_MAX: RATE_MAX,
	SOFT_SLOT_BASE: SOFT_SLOT_BASE,
	GLOBAL_UP_QID: GLOBAL_UP_QID,
	GLOBAL_DL_QID: GLOBAL_DL_QID,
	DL_QID_OFFSET: DL_QID_OFFSET,
	PRIORITY: PRIORITY,
	PRESETS: PRESETS,

	style: function() {
		return E('style', { 'type': 'text/css' }, STYLE);
	},

	priorityLabel: function(key) {
		switch (key) {
		case 'critical': return _('Critical');
		case 'high':     return _('High');
		case 'low':      return _('Low');
		default:         return _('Normal');
		}
	},

	/* Download and upload keep colours of their own, distinct from the four
	   the priority dots use, so neither reading is mistaken for the other. */
	DIR_COLOR: { up: '#8e6bc4', down: '#3d84cc' },

	priorityDot: function(key) {
		var meta = PRIORITY[key] || PRIORITY.normal;

		return E('span', {
			'class': 'eqos-dot', 'style': 'background:' + meta.color
		});
	},

	priorityBadge: function(key) {
		var meta = PRIORITY[key] || PRIORITY.normal;

		return E('span', {}, [
			E('span', { 'class': 'eqos-dot', 'style': 'background:' + meta.color }),
			this.priorityLabel(key)
		]);
	},

	addPriorityChoices: function(option) {
		option.value('critical', _('Critical'));
		option.value('high', _('High'));
		option.value('normal', _('Normal'));
		option.value('low', _('Low'));
		option.default = 'normal';
	},

	collectHostChoices: function(hosts) {
		var choices = { ip: [], ip6: [], mac: [] };

		for (var mac in hosts) {
			var ipaddrs = L.toArray(hosts[mac].ipaddrs || hosts[mac].ipv4);
			var ip6addrs = L.toArray(hosts[mac].ip6addrs || hosts[mac].ipv6);
			var name = hosts[mac].name;

			for (var i = 0; i < ipaddrs.length; i++)
				choices.ip.push([ ipaddrs[i],
					name ? '%s (%s)'.format(name, ipaddrs[i]) : ipaddrs[i] ]);

			for (var j = 0; j < ip6addrs.length; j++)
				choices.ip6.push([ ip6addrs[j],
					name ? '%s (%s)'.format(name, ip6addrs[j]) : ip6addrs[j] ]);

			var label = name || ipaddrs[0] || mac;
			if (ipaddrs.length && name)
				label = '%s · %s'.format(label, ipaddrs[0]);
			choices.mac.push([ mac, '%s · %s'.format(label, mac) ]);
		}

		return choices;
	},

	addChoices: function(option, choices) {
		for (var i = 0; i < choices.length; i++)
			option.value(choices[i][0], choices[i][1]);
	},

	hostNameMap: function(hosts) {
		var map = {};

		for (var mac in hosts) {
			var name = hosts[mac].name;
			if (!name)
				continue;

			map[mac.toLowerCase()] = name;

			var ipaddrs = L.toArray(hosts[mac].ipaddrs || hosts[mac].ipv4);
			for (var i = 0; i < ipaddrs.length; i++)
				map[ipaddrs[i]] = name;

			var ip6addrs = L.toArray(hosts[mac].ip6addrs || hosts[mac].ipv6);
			for (var j = 0; j < ip6addrs.length; j++)
				map[ip6addrs[j]] = name;
		}

		return map;
	},

	/* What the host is called. The rule keeps a name of its own, because the
	   neighbour table forgets a device as soon as it goes away and a rule
	   would be left showing a bare MAC. */
	hostName: function(hostNames, address) {
		if (!address)
			return null;

		return hostNames[address] || hostNames[address.toLowerCase()] || null;
	},

	deviceLabel: function(hostNames, section_id, address) {
		return uci.get('eqos', section_id, 'name') ||
			this.hostName(hostNames, address) || null;
	},

	describeRule: function(hostNames, section_id, address) {
		if (!address)
			return _('unspecified');

		var name = this.deviceLabel(hostNames, section_id, address);

		return name ? '%s (%s)'.format(name, address) : address;
	},

	selectorValue: function(section_id) {
		var selector = uci.get('eqos', section_id, 'selector');

		if (selector === 'ip' || selector === 'ip6' || selector === 'mac')
			return selector;

		if (uci.get('eqos', section_id, 'mac'))
			return 'mac';

		if (uci.get('eqos', section_id, 'ip6'))
			return 'ip6';

		return 'ip';
	},

	matchLabel: function(selector) {
		if (selector === 'ip6')
			return _('IPv6 address');

		if (selector === 'mac')
			return _('MAC address');

		return _('IPv4 address');
	},

	/* Mbit/s in, kbit/s stored, same bounds everywhere. */
	rateOption: function(option) {
		option.datatype = 'and(ufloat,min(0),max(%d))'.format(RATE_MAX);
		option.cfgvalue = this.rateCfgvalue;
		option.write = this.rateWrite;

		return option;
	},

	/* HH:MM and nothing else. The datatype accepts seconds too, which the
	   service does not read. */
	validateClock: function(section_id, value) {
		if (!value || /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value))
			return true;

		return _('Write the time as HH:MM.');
	},

	addWeekdayChoices: function(option) {
		option.value('mon', _('Monday'));
		option.value('tue', _('Tuesday'));
		option.value('wed', _('Wednesday'));
		option.value('thu', _('Thursday'));
		option.value('fri', _('Friday'));
		option.value('sat', _('Saturday'));
		option.value('sun', _('Sunday'));
	},

	/* Identical in all three tables. */
	weightOption: function(section, form, tab) {
		var o = section.taboption(tab, form.Value, 'weight', _('Weight'),
			_('Replaces the weight that comes with the priority level, from 1 to %d. Strict priority ignores it.').format(WEIGHT_MAX));

		o.modalonly = true;
		o.retain = true;
		o.datatype = 'and(uinteger,min(1),max(%d))'.format(WEIGHT_MAX);
		o.rmempty = true;
		o.placeholder = _('from priority');
		o.write = this.integerWrite;

		return o;
	},

	/* A service rule needs a hardware queue; everything else may land in
	   software. The caller brings its own wording so translators see it. */
	queueOption: function(section, form, tab, description, hardwareOnly) {
		var o = section.taboption(tab, form.Value, 'queue', _('Queue ID'),
			description);

		o.modalonly = true;
		o.retain = true;
		o.datatype = hardwareOnly
			? 'and(uinteger,min(1),max(%d))'.format(HW_SLOT_MAX)
			: 'and(uinteger,min(1),max(65535))';
		o.rmempty = true;
		o.placeholder = _('automatic');

		return o;
	},

	/* A rate takes two samples: prime() takes the first while the page loads,
	   so the first poll already has something to show. One tracker per view,
	   or two views would pair one's interval with the other's bytes. */
	sampler: function() {
		var track = this.rateTracker();

		return {
			prime: function() {
				return L.resolveDefault(callRuleStats(), {}).then(track);
			},

			status: function() {
				return L.resolveDefault(callStatus(), {});
			},

			poll: function(cb) {
				return function() {
					return Promise.all([
						L.resolveDefault(callStatus(), {}),
						L.resolveDefault(callRuleStats(), {})
					]).then(function(res) {
						var status = res[0] || {};

						return cb(status.rules || [], track(res[1] || {}),
							status);
					});
				};
			}
		};
	},

	rateCfgvalue: function(section_id) {
		return String(Number(uci.get('eqos', section_id, this.option) || 0) / 1000);
	},

	rateWrite: function(section_id, value) {
		uci.set('eqos', section_id, this.option, String(Math.round(Number(value) * 1000)));
	},

	integerWrite: function(section_id, value) {
		uci.set('eqos', section_id, this.option, String(Number(value)));
	},

	fmtKbit: fmtKbit,

	/* A guarantee and a ceiling are the two ends of one range, so they read as
	   one: "1 - 100 Mbit/s" says what three words and two units said before,
	   and the unit only has to appear once. */
	fmtRange: function(minKbit, maxKbit) {
		var lo = Number(minKbit || 0);
		var hi = Number(maxKbit || 0);

		if (!lo && !hi)
			return _('no limit');
		if (!lo)
			return _('max %s').format(fmtKbit(hi));
		if (!hi)
			return _('min %s').format(fmtKbit(lo));

		/* Sharing one unit only works when both ends use it. */
		if ((lo >= 1000) == (hi >= 1000)) {
			var unit = (hi >= 1000) ? 'Mbit/s' : 'kbit/s';
			var div = (hi >= 1000) ? 1000 : 1;

			return '%s-%s %s'.format(bare(lo / div), bare(hi / div), unit);
		}

		return '%s-%s'.format(fmtKbit(lo), fmtKbit(hi));
	},

	fmtBps: function(bps) {
		if (bps >= 1000000)
			return '%.2f Mbit/s'.format(bps / 1000000);

		if (bps >= 1000)
			return '%.1f kbit/s'.format(bps / 1000);

		return '%d bit/s'.format(bps || 0);
	},

	/* Not the theme's progress bar: that one prints its label inside the bar,
	   which repeats the figure already written above it. Here the number is
	   text and the bar is only the shape of it. */
	bar: function(fraction, color, title) {
		var pct = Math.max(0, Math.min(100, Math.round(fraction * 100)));

		return E('div', { 'class': 'eqos-bar', 'title': title || '-' },
			E('i', {
				'style': 'width:%d%%;background:%s'.format(pct, color || '#7a8794')
			}));
	}

});
