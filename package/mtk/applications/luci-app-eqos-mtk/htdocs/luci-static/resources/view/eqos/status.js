'use strict';
'require eqos.common as common';
'require network';
'require poll';
'require rpc';
'require uci';
'require view';

var trackRates = common.rateTracker();

var callStatus = rpc.declare({
	object: 'luci.eqos', method: 'getStatus', expect: { '': {} }
});

var callQueues = rpc.declare({
	object: 'luci.eqos', method: 'getQueues', expect: { '': {} }
});

var callRuleStats = rpc.declare({
	object: 'luci.eqos', method: 'getRuleStats', expect: { '': {} }
});

/* One line per rule rather than per queue: a rule owns an upload queue and a
   download queue, and showing them as two rows makes every device appear
   twice for no gain. Live figures are totalled per queue by the backend, which
   has to add up two sources because an offloaded flow stops being visible to
   netfilter; the per-queue byte counters in the hardware MIB disagree with the
   netdev counters and are not used. */
function stack(main, sub) {
	if (sub == null || sub === '')
		return main;

	return E('div', {}, [
		E('div', {}, main),
		E('div', { 'class': 'eqos-card-sub' }, sub)
	]);
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('eqos'),
			network.getHostHints(),
			L.resolveDefault(callStatus(), {}),
			L.resolveDefault(callQueues(), {}),
			L.resolveDefault(callRuleStats(), {})
		]);
	},

	renderCards: function(status, stats, cfg, link) {
		var hookOk = (status.hook === 'enabled');
		var enabled = (cfg.enabled === '1');
		var rules = status.rules || [];
		var used = {};
		var soft = 0;

		for (var i = 0; i < rules.length; i++) {
			used[rules[i].slot] = true;
			if (rules[i].slot > common.HW_SLOT_MAX)
				soft++;
		}

		var hwUsed = 0;
		for (var slot in used)
			if (Number(slot) <= common.HW_SLOT_MAX)
				hwUsed++;

		var scheduler = (cfg.scheduler === 'sp')
			? _('Strict priority') : _('Weighted round robin');
		var direction = (cfg.direction === 'uplink') ? _('Upload only')
			: (cfg.direction === 'downlink') ? _('Download only')
			: _('Both directions');

		/* The uplink counters, not the sum of the queues: traffic no rule
		   claims never reaches a software class, so the sum is an estimate and
		   can drift past the total it is shown against. */
		var dlNow = (link || {}).down_bps || 0;
		var upNow = (link || {}).up_bps || 0;

		var dlCap = Number(cfg.download || 0) * 1000000;
		var upCap = Number(cfg.upload || 0) * 1000000;

		/* Traffic no rule claims rides the catch-all queues, which is what the
		   totals cap. It belongs next to the total rather than in the list of
		   devices, where it is not one. */
		function liveCard(title, now, cap, other, dir) {
			return E('div', { 'class': 'eqos-card' }, [
				E('div', { 'class': 'eqos-card-title' }, [
					E('span', { 'class': 'eqos-ico eqos-ico-' + dir }),
					title
				]),
				E('div', { 'class': 'eqos-card-value' }, common.fmtBps(now)),
				common.bar(cap ? now / cap : 0, common.DIR_COLOR[dir]),
				E('div', { 'class': 'eqos-card-sub' }, [
					/* A configured ceiling is an exact figure, not a
					   measurement: it does not want decimals. */
					E('div', {}, _('of %s').format(common.fmtKbit(cap / 1000))),
					other ? E('div', {}, _('%s matches no rule')
						.format(common.fmtBps(other))) : ''
				])
			]);
		}

		var otherDl = (stats[common.GLOBAL_UP_QID + ':down'] || {}).bps || 0;
		var otherUp = (stats[common.GLOBAL_UP_QID + ':up'] || {}).bps || 0;

		/* Three states, three colours. Green only when the limits are on and
		   the accelerator is behind them; amber when the service runs without
		   it, because the hardware queues are doing nothing and only the
		   software shaping is left; grey when nothing is enforced at all. */
		var dotClass = !enabled ? ' eqos-pulse-off'
			: (hookOk ? '' : ' eqos-pulse-warn');
		var stateLabel = !enabled ? _('Disabled')
			: (hookOk ? _('Active') : _('No acceleration'));
		var dotTitle = !enabled
			? _('The service is off and no limit is being enforced.')
			: (hookOk
				? _('Limits are being enforced and the accelerator is running.')
				: _('Limits are being enforced in software only, the accelerator is not running.'));

		return E('div', { 'class': 'eqos-cards' }, [
			E('div', { 'class': 'eqos-card' }, [
				E('div', { 'class': 'eqos-card-title' }, [
					E('span', { 'class': 'eqos-ico eqos-ico-service' }),
					_('Service')
				]),
				E('div', { 'class': 'eqos-card-value' }, [
					E('span', {
						'class': 'eqos-pulse' + dotClass,
						'title': dotTitle
					}),
					stateLabel
				]),
				/* One line each: together they run wider than the card and get
				   cut off on a phone. */
				E('div', { 'class': 'eqos-card-sub' }, [
					E('div', {}, direction),
					E('div', {}, scheduler)
				])
			]),

			liveCard(_('Download now'), dlNow, dlCap, otherDl, 'down'),
			liveCard(_('Upload now'), upNow, upCap, otherUp, 'up'),

			E('div', { 'class': 'eqos-card' }, [
				E('div', { 'class': 'eqos-card-title' }, [
					E('span', { 'class': 'eqos-ico eqos-ico-queue' }),
					_('Queues in use')
				]),
				E('div', { 'class': 'eqos-card-value' },
					'%d / %d'.format(hwUsed, common.HW_SLOT_MAX)),
				common.bar(hwUsed / common.HW_SLOT_MAX, '#40a58a'),
				E('div', { 'class': 'eqos-card-sub' }, [
					E('div', {}, _('hardware queues')),
					soft ? E('div', {}, _('%d in software').format(soft)) : ''
				])
			])
		]);
	},

	/* Groups the rules by the queue they were given: the members of a shared
	   profile land on one queue and belong on one line. */
	groupRules: function(status) {
		var rules = status.rules || [];
		var bySlot = {};
		var order = [];

		for (var i = 0; i < rules.length; i++) {
			var r = rules[i];

			if (!bySlot[r.slot]) {
				bySlot[r.slot] = { slot: r.slot, members: [], rule: r };
				order.push(r.slot);
			}

			bySlot[r.slot].members.push(r);
		}

		order.sort(function(a, b) { return b - a; });

		return order.map(function(slot) { return bySlot[slot]; });
	},

	/* One table per kind. A device rule and a service rule answer different
	   questions - who is using the line, and what the line is carrying - and a
	   single list forced the reader to work out which row was which. */
	renderTable: function(status, queues, stats, cfg, hostNames, byAddress, kind) {
		var all = (status.rules || []).slice();
		var rules = all.filter(function(r) {
			return (kind === 'traffic') ? (r.kind === 'traffic')
				: (r.kind !== 'traffic');
		});
		var shared = {};

		if (!rules.length)
			return E('div', { 'class': 'eqos-empty' }, (kind === 'traffic')
				? _('No service rule is active.')
				: _('No device rule is active.'));

		/* Devices on the same queue share the rates rather than each getting
		   them, which changes what the ceiling means and has to be said. */
		rules.forEach(function(r) {
			shared[r.slot] = (shared[r.slot] || 0) + 1;
		});

		rules.sort(function(a, b) { return b.slot - a.slot; });

		/* Plain table, no bars and no panels: the figure and its ceiling are
		   the whole story, and every graphic added around them so far has only
		   competed with the numbers. Colour does the work a bar was doing -
		   which direction this is - at no cost in space. */
		var rows = [ E('tr', { 'class': 'tr table-titles' }, [
			E('th', { 'class': 'th' },
				(kind === 'traffic') ? _('Service') : _('Device')),
			E('th', { 'class': 'th' }, _('Priority')),
			E('th', { 'class': 'th eqos-col-rate' }, _('Download')),
			E('th', { 'class': 'th eqos-col-rate' }, _('Upload'))
		]) ];

		/* Le perdite erano gia' calcolate e non le leggeva nessuno. Sono il
		   segnale che dice se una coda sta davvero strozzando, quindi
		   compaiono solo quando ci sono: a zero non aggiungono niente. */
		function rateCell(dir, bps, capKbit, minKbit, drops) {
			return E('td', { 'class': 'td eqos-col-rate' }, [
				E('div', { 'class': 'eqos-rate-num eqos-live-' + dir },
					common.fmtBps(bps)),
				E('div', { 'class': 'eqos-rate-cap' },
					common.fmtRange(minKbit, capKbit)),
				drops ? E('div', { 'class': 'eqos-drop',
					'title': _('Packets the queue had to throw away because it was full.')
				}, _('%d dropped').format(drops)) : ''
			]);
		}

		rules.forEach(function(r) {
			var profile = common.profileLabel(r.profile);
			var rates = byAddress[r.address] || {};
			var slotUp = stats[r.slot + ':up'] || {};
			var slotDl = stats[r.slot + ':down'] || {};

			/* The per-address counters see every packet of a device excluded
			   from offload, which is every device that has a rule; the queue
			   totals are the fallback for one still being accelerated. */
			var upBps = (rates.up != null) ? rates.up : (slotUp.bps || 0);
			var dlBps = (rates.down != null) ? rates.down : (slotDl.bps || 0);
			var sub = [];

			if (profile)
				sub.push(profile);
			if (shared[r.slot] > 1)
				sub.push(_('shared with %d others').format(shared[r.slot] - 1));

			/* A traffic rule is not a host: it is named after the service it
			   catches, and what it matches on goes underneath. */
			var name = (r.kind === 'traffic')
				? (uci.get('eqos', r.section, 'name') || r.section)
				: common.describeRule(hostNames, r.section, r.address);

			/* The map file carries the match as the service wrote it, protocol
			   names and all. Rebuilt from the configuration it reads the same
			   way here as it does on the rules page. */
			if (r.kind === 'traffic')
				sub.unshift(common.trafficMatch({
					proto: uci.get('eqos', r.section, 'proto'),
					ports: uci.get('eqos', r.section, 'ports'),
					dscp: uci.get('eqos', r.section, 'dscp')
				}) || r.address);

			rows.push(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td' }, [
					E('div', { 'class': 'eqos-name' }, name),
					sub.length
						? E('div', { 'class': 'eqos-sub' }, sub.join(' · ')) : ''
				]),
				E('td', { 'class': 'td' }, common.priorityBadge(r.priority)),
				rateCell('down', dlBps, r.download, r.min_download,
					slotDl.drops || 0),
				rateCell('up', upBps, r.upload, r.min_upload,
					slotUp.drops || 0)
			]));
		});

		return E('table', { 'class': 'table' }, rows);
	},

	render: function(data) {
		var self = this;
		var hosts = data[1] ? data[1].hosts || {} : {};
		var hostNames = common.hostNameMap(hosts);
		var status = data[2] || {};
		var queues = (data[3] || {}).queues || {};
		var sampled = trackRates(data[4] || {});
		var stats = sampled.slots;
		var linkRates = sampled.link;
		var cfg = uci.get_first('eqos', 'eqos') || {};

		var notice = (cfg.enabled === '1') ? '' :
			E('div', { 'class': 'alert-message warning' },
				_('EQoS is disabled, nothing below is being enforced.'));

		/* A configuration the service accepted but cannot deliver: guarantees
		   that do not fit the line, rules that found no hardware queue. The
		   log is where these used to go and nobody ever saw them. */
		function warnings(st) {
			var list = (st || {}).warnings || [];

			if (!list.length)
				return '';

			return E('div', { 'class': 'alert-message warning' },
				list.map(function(w) { return E('div', {}, w); }));
		}

		poll.add(function() {
			return Promise.all([
				L.resolveDefault(callStatus(), {}),
				L.resolveDefault(callQueues(), {}),
				L.resolveDefault(callRuleStats(), {})
			]).then(function(res) {
				var st = res[0] || {};
				var qs = (res[1] || {}).queues || {};
				var sm = trackRates(res[2] || {});
				var mk = sm.slots;
				var lk = sm.link;
				var c = uci.get_first('eqos', 'eqos') || {};
				var node;

				node = document.getElementById('eqos-cards');
				if (node)
					L.dom.content(node, self.renderCards(st, mk, c, lk));

				node = document.getElementById('eqos-warn');
				if (node)
					L.dom.content(node, warnings(st));

				node = document.getElementById('eqos-devices');
				if (node)
					L.dom.content(node, self.renderTable(st, qs, mk, c,
						hostNames, sm.addresses, 'device'));

				node = document.getElementById('eqos-traffic');
				if (node)
					L.dom.content(node, self.renderTable(st, qs, mk, c,
						hostNames, sm.addresses, 'traffic'));

			});
		});

		return E([], [
			common.style(),
			E('div', { 'class': 'cbi-section' }, [
				E('h2', {}, _('EQoS')),
				E('div', { 'class': 'eqos-lead' },
					_('Limits the line as a whole, and each device on its own. The per-device limits run in software, so they work for Wi-Fi clients as well. Traffic that no rule matches goes to the hardware queues.')),
				notice,
				E('div', { 'id': 'eqos-warn' }, warnings(status)),
				E('div', { 'id': 'eqos-cards' },
					self.renderCards(status, stats, cfg, linkRates))
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Traffic by device')),
				E('div', { 'id': 'eqos-devices' },
					self.renderTable(status, queues, stats, cfg, hostNames,
						sampled.addresses, 'device'))
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', { 'style': 'margin-top:.4em' }, _('Traffic by service')),
				E('div', { 'id': 'eqos-traffic' },
					self.renderTable(status, queues, stats, cfg, hostNames,
						sampled.addresses, 'traffic'))
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
