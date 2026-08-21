'use strict';
'require eqos.common as common';
'require form';
'require network';
'require poll';
'require uci';
'require view';

var live = common.sampler();

return view.extend({
	load: function() {
		/* The first sample only sets the reference the next one is measured
		   against, so it is taken here: by the time the poll fires there is a
		   rate to show instead of another blank round. */
		return Promise.all([
			uci.load('eqos'),
			network.getHostHints(),
			live.prime()
		]);
	},

	render: function(data) {
		var hosts = data[1] ? data[1].hosts || {} : {};
		var hostChoices = common.collectHostChoices(hosts);
		var hostNames = common.hostNameMap(hosts);
		var profileSections = uci.sections('eqos', 'profile');
		var m, s, o;

		m = new form.Map('eqos', _('EQoS'),
			_('The service assigns the queues itself, starting from the highest priority. When no hardware queue is left, the rule falls back to software shaping.'));

		/* Deliberately not sortable: the order of the sections carries no
		   meaning. Queues are handed out by priority, and a control that moves
		   rows without changing anything is worse than no control at all. */
		s = m.section(form.GridSection, 'device', _('Device rules'));
		s.addremove = true;
		s.anonymous = true;
		s.nodescriptions = true;
		s.handleAdd = function(ev) {
			var section_id = uci.add('eqos', 'device');

			uci.set('eqos', section_id, 'enabled', '1');
			uci.set('eqos', section_id, 'selector', 'mac');
			uci.set('eqos', section_id, 'priority', 'normal');
			uci.set('eqos', section_id, 'download', '0');
			uci.set('eqos', section_id, 'upload', '0');
			m.addedSection = section_id;

			return this.renderMoreOptionsModal(section_id);
		};

		s.tab('general', _('General Settings'));
		s.tab('advanced', _('Advanced'));

		o = s.taboption('general', form.Flag, 'enabled', _('Enable'));
		o.default = o.enabled;
		o.rmempty = false;
		o.editable = true;

		o = s.taboption('general', form.ListValue, 'selector', _('Match'),
			_('Whichever address you pick, the rule also covers the other addresses of the same host, so a device limited through its IPv4 lease is limited over IPv6 as well.'));
		/* retain, or the value is lost: LuCI removes any option it
		   did not render, and a modalonly option is not rendered when
		   the grid itself is saved. */
		o.modalonly = true;
		o.retain = true;
		o.default = 'mac';
		o.rmempty = false;
		o.value('mac', _('MAC address'));
		o.value('ip', _('IPv4 address'));
		o.value('ip6', _('IPv6 address'));
		o.cfgvalue = function(section_id) {
			return common.selectorValue(section_id);
		};
		o.write = function(section_id, value) {
			uci.set('eqos', section_id, 'selector', value);

			if (value !== 'ip')
				uci.unset('eqos', section_id, 'ip');

			if (value !== 'ip6')
				uci.unset('eqos', section_id, 'ip6');

			if (value !== 'mac')
				uci.unset('eqos', section_id, 'mac');
		};

		o = s.taboption('general', form.Value, 'mac', _('MAC address'),
			_('The rule follows the device when its address changes, because a new DHCP lease reloads it.'));
		o.modalonly = true;
		o.retain = true;
		o.datatype = 'macaddr';
		o.rmempty = false;
		o.depends('selector', 'mac');
		common.addChoices(o, hostChoices.mac);

		o = s.taboption('general', form.Value, 'ip', _('IPv4 address'));
		o.modalonly = true;
		o.retain = true;
		o.datatype = 'ip4addr("nomask")';
		o.rmempty = false;
		o.depends('selector', 'ip');
		common.addChoices(o, hostChoices.ip);

		o = s.taboption('general', form.Value, 'ip6', _('IPv6 address'));
		o.modalonly = true;
		o.retain = true;
		o.datatype = 'ip6addr("nomask")';
		o.rmempty = false;
		o.depends('selector', 'ip6');
		common.addChoices(o, hostChoices.ip6);

		o = s.option(form.DummyValue, '_match', _('Device'));
		o.textvalue = function(section_id) {
			var selector = common.selectorValue(section_id);
			var value = uci.get('eqos', section_id, selector);

			if (!value)
				return E('em', {}, _('unspecified'));

			var name = hostNames[value] || hostNames[value.toLowerCase()];

			return E('div', {}, [
				E('div', {}, name || value),
				E('div', { 'class': 'eqos-card-sub' },
					'%s: %s'.format(common.matchLabel(selector), value))
			]);
		};

		o = s.option(form.DummyValue, '_traffic', _('Traffic'));
		o.textvalue = function(section_id) {
			return E('div', { 'id': 'eqos-live-' + section_id },
				common.liveCell(null));
		};

		o = s.taboption('general', form.ListValue, 'profile', _('Profile'),
			_('Use the rates and the priority of a profile instead of setting them here.'));
		o.value('', _('none'));
		profileSections.forEach(function(p) {
			o.value(p['.name'], p.name || p['.name']);
		});
		o.rmempty = true;
		o.textvalue = function(section_id) {
			var p = uci.get('eqos', section_id, 'profile');

			if (!p)
				return E('em', { 'class': 'eqos-muted' }, _('none'));

			return uci.get('eqos', p, 'name') || p;
		};

		o = s.taboption('general', form.ListValue, 'priority', _('Priority'));
		o.depends('profile', '');
		common.addPriorityChoices(o);
		o.textvalue = function(section_id) {
			var p = uci.get('eqos', section_id, 'profile');
			var key = p ? uci.get('eqos', p, 'priority')
				: uci.get('eqos', section_id, 'priority');

			return common.priorityBadge(key || 'normal');
		};

		o = common.rateOption(s.taboption('general', form.Value, 'download',
			_('Download'),
			_('Top speed in Mbit/s. Use 0 to leave it unlimited.')));
		o.depends('profile', '');
		o.rmempty = false;
		o.textvalue = function(section_id) {
			var p = uci.get('eqos', section_id, 'profile');
			var raw = p ? uci.get('eqos', p, 'download')
				: uci.get('eqos', section_id, 'download');

			return common.fmtKbit(Number(raw || 0));
		};

		o = common.rateOption(s.taboption('general', form.Value, 'upload',
			_('Upload'),
			_('Top speed in Mbit/s. Use 0 to leave it unlimited.')));
		o.depends('profile', '');
		o.rmempty = false;
		o.textvalue = function(section_id) {
			var p = uci.get('eqos', section_id, 'profile');
			var raw = p ? uci.get('eqos', p, 'upload')
				: uci.get('eqos', section_id, 'upload');

			return common.fmtKbit(Number(raw || 0));
		};

		o = common.rateOption(s.taboption('general', form.Value, 'min_download',
			_('Guaranteed download'),
			_('Speed in Mbit/s the scheduler keeps for this queue. Leave it at 0 to set only a ceiling.')));
		o.modalonly = true;
		o.retain = true;
		o.depends('profile', '');

		o = common.rateOption(s.taboption('general', form.Value, 'min_upload',
			_('Guaranteed upload'),
			_('Speed in Mbit/s the scheduler keeps for this queue. Leave it at 0 to set only a ceiling.')));
		o.modalonly = true;
		o.retain = true;
		o.depends('profile', '');

		s.tab('schedule', _('Schedule'));

		o = s.taboption('schedule', form.Value, 'start', _('Active from'),
			_('Leave both times empty and the rule is always on. A window that ends before it starts runs through the night, so 22:00 to 07:00 is one stretch and not two.'));
		o.modalonly = true;
		o.retain = true;
		o.datatype = 'timehhmmss';
		o.placeholder = '22:00';
		o.validate = common.validateClock;

		o = s.taboption('schedule', form.Value, 'stop', _('Active until'));
		o.modalonly = true;
		o.retain = true;
		o.datatype = 'timehhmmss';
		o.placeholder = '07:00';
		o.validate = common.validateClock;

		o = s.taboption('schedule', form.MultiValue, 'weekdays', _('Days'),
			_('Leave it empty for every day.'));
		o.modalonly = true;
		o.retain = true;
		common.addWeekdayChoices(o);

		common.weightOption(s, form, 'advanced');

		o = common.queueOption(s, form, 'advanced',
			_('Keeps this rule on a fixed queue instead of letting the service choose. Use 1 to %d for a hardware queue, or %d and above for software shaping. The numbers in between belong to the queues that carry everything else.')
				.format(common.HW_SLOT_MAX, common.SOFT_SLOT_BASE));
		o.cfgvalue = function(section_id) {
			return uci.get('eqos', section_id, 'queue') ||
				uci.get('eqos', section_id, 'comment');
		};
		o.write = function(section_id, value) {
			uci.set('eqos', section_id, 'queue', String(Number(value)));
			uci.unset('eqos', section_id, 'comment');
		};

		/* Only the cells are replaced, never the form around them: a poll that
		   re-rendered the section would throw away whatever is being edited. */
		poll.add(live.poll(function(rules, rates) {
			rules.forEach(function(r) {
				var node = document.getElementById('eqos-live-' + r.section);

				/* Past the first poll, a device with no counters is not
				   pending: it is simply idle. */
				if (node)
					L.dom.content(node, common.liveCell(
						rates.addresses[r.address] || { down: 0, up: 0 }));
			});
		}));

		return m.render().then(function(formNode) {
			return E([], [ common.style(), formNode ]);
		});
	}
});
