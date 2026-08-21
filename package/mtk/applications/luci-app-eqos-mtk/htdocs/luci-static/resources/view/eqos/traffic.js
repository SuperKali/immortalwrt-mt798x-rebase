'use strict';
'require eqos.common as common';
'require form';
'require network';
'require poll';
'require uci';
'require ui';
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

	renderPresets: function() {
		return common.presetGrid(_('Add a rule from a preset:'),
			common.TRAFFIC_PRESETS,
			function(preset) { return common.trafficMatch(preset.opts); },
			function(preset) {
				return ui.createHandlerFn(this, function() {
					var name = preset.id;
					var n = 1;

					while (uci.get('eqos', name))
						name = '%s%d'.format(preset.id, ++n);

					uci.add('eqos', 'traffic', name);
					uci.set('eqos', name, 'enabled', '1');
					uci.set('eqos', name, 'name', preset.name);
					for (var k in preset.opts)
						uci.set('eqos', name, k, preset.opts[k]);

					return uci.save().then(function() {
						window.location.reload();
					});
				});
			});
	},

	render: function(data) {
		var self = this;
		var hosts = data[1] ? data[1].hosts || {} : {};
		var hostChoices = common.collectHostChoices(hosts);
		var m, s, o;

		m = new form.Map('eqos', _('EQoS'),
			_('Sorts traffic by what it carries instead of by who sends it, so a call keeps its place in the queue whichever device places it. By default they only pick up traffic that no device rule matched, so the per-device limits stay intact. A rule can be told to take precedence, and then that traffic leaves the limit of its device.'));

		s = m.section(form.GridSection, 'traffic', _('Service rules'));
		s.addremove = true;
		s.anonymous = false;
		s.nodescriptions = true;
		s.addbtntitle = _('Add rule');
		s.tab('general', _('General Settings'));
		s.tab('advanced', _('Advanced'));

		o = s.taboption('general', form.Flag, 'enabled', _('Enable'));
		o.default = o.enabled;
		o.rmempty = false;
		o.editable = true;

		o = s.taboption('general', form.Value, 'name', _('Display name'));
		o.rmempty = true;
		o.placeholder = _('unspecified');

		o = s.taboption('general', form.ListValue, 'proto', _('Protocol'));
		/* retain, or the value is lost: LuCI removes any option it
		   did not render, and a modalonly option is not rendered when
		   the grid itself is saved. */
		o.modalonly = true;
		o.retain = true;
		o.default = 'udp';
		o.value('udp', _('UDP'));
		o.value('tcp', _('TCP'));
		o.value('tcpudp', _('TCP and UDP'));
		o.value('', _('none'));

		o = s.taboption('general', form.Value, 'ports', _('Ports'),
			_('The ports the service listens on, separated by commas. A range is written with a hyphen, as in 10000-20000. Leave it empty to take the whole protocol.'));
		o.modalonly = true;
		o.retain = true;
		o.placeholder = '5060,10000-20000';
		o.validate = function(section_id, value) {
			if (!value || /^[0-9,-]+$/.test(value))
				return true;

			return _('Only numbers, hyphens and commas.');
		};

		o = s.taboption('general', form.Value, 'dscp', _('Marking'),
			_('The class the device writes into its own packets, which is the only handle left when a service moves to a port nobody published. Phones and softphones usually mark voice as EF.'));
		o.modalonly = true;
		o.retain = true;
		o.placeholder = _('none');
		o.value('', _('none'));
		o.value('ef', _('EF, voice'));
		o.value('cs6', _('CS6, network control'));
		o.value('af41', _('AF41, interactive video'));
		o.value('cs1', _('CS1, background'));

		/* What the rule catches, said once in the row instead of spread over
		   three columns nobody reads separately. */
		o = s.option(form.DummyValue, '_match', _('Matches'));
		o.textvalue = function(section_id) {
			var text = common.trafficMatch({
				proto: uci.get('eqos', section_id, 'proto'),
				ports: uci.get('eqos', section_id, 'ports'),
				dscp: uci.get('eqos', section_id, 'dscp')
			});

			if (!text)
				return E('em', { 'class': 'eqos-muted' }, _('nothing yet'));

			return E('div', { 'class': 'eqos-members' }, text);
		};

		o = s.option(form.DummyValue, '_traffic', _('Traffic'));
		o.textvalue = function(section_id) {
			return E('div', { 'id': 'eqos-live-' + section_id },
				common.liveCell(null));
		};

		o = s.taboption('general', form.DynamicList, 'device', _('Only these devices'),
			_('Leave it empty and the rule watches the whole network. Fill it in and it only applies to the devices listed, which is how one phone gets its calls sorted without doing the same for everybody.'));
		o.modalonly = true;
		o.retain = true;
		o.datatype = 'or(macaddr,ip4addr("nomask"),ip6addr("nomask"))';
		o.placeholder = _('MAC or IP address');
		common.addChoices(o, hostChoices.mac.concat(hostChoices.ip));

		o = s.taboption('general', form.Flag, 'override', _('Override device limits'),
			_('Off, the rule only picks up traffic that no device rule matched. On, it also takes traffic from devices that have a limit, and that traffic leaves their limit behind: give the rule a ceiling of its own or it ends up with none.'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.taboption('general', form.ListValue, 'profile', _('Profile'),
			_('Use the rates and the priority of a profile instead of setting them here. The rule still gets a queue of its own, since it is not a device.'));
		o.value('', _('none'));
		uci.sections('eqos', 'profile').forEach(function(p) {
			o.value(p['.name'], p.name || p['.name']);
		});
		o.rmempty = true;
		o.modalonly = true;
		o.retain = true;

		o = s.taboption('general', form.ListValue, 'priority', _('Priority'));
		common.addPriorityChoices(o);
		o.rmempty = false;
		o.depends('profile', '');
		o.textvalue = function(section_id) {
			var profile = uci.get('eqos', section_id, 'profile');
			var from = profile
				? uci.get('eqos', profile, 'priority')
				: uci.get('eqos', section_id, 'priority');

			return common.priorityBadge(from || 'normal');
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

		o = common.rateOption(s.taboption('advanced', form.Value, 'download',
			_('Download'),
			_('Top speed in Mbit/s. Use 0 to leave it unlimited.')));
		o.modalonly = true;
		o.retain = true;

		o = common.rateOption(s.taboption('advanced', form.Value, 'upload',
			_('Upload'),
			_('Top speed in Mbit/s. Use 0 to leave it unlimited.')));
		o.modalonly = true;
		o.retain = true;

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

		common.queueOption(s, form, 'advanced',
			_('Keeps this rule on a fixed queue instead of letting the service choose. A service rule always needs a hardware queue, so the value has to be %d or below.').format(common.HW_SLOT_MAX),
			true);

		poll.add(live.poll(function(rules, rates) {
			var slotOf = {};

			/* Queue slots are handed out when the service starts, so the
			   configuration does not know them. The status call does. */
			rules.forEach(function(r) {
				if (r.kind === 'traffic')
					slotOf[r.section] = r.slot;
			});

			uci.sections('eqos', 'traffic').forEach(function(t) {
				var node = document.getElementById('eqos-live-' + t['.name']);

				if (!node)
					return;

				var slot = slotOf[t['.name']];

				/* A rule the service did not place carries nothing, and
				   saying so beats a placeholder that never resolves. */
				if (slot == null) {
					L.dom.content(node,
						E('em', { 'class': 'eqos-muted' }, _('not placed')));
					return;
				}

				var up = rates.slots[slot + ':up'] || {};
				var dl = rates.slots[slot + ':down'] || {};

				L.dom.content(node, common.liveCell({
					down: dl.bps || 0, up: up.bps || 0
				}));
			});
		}));

		/* The presets belong to the table they add rows to, so they go inside
		   the section and under its heading. */
		return m.render().then(function(formNode) {
			var section = formNode.querySelector('.cbi-section');
			var heading = section ? section.querySelector('h3, legend') : null;

			if (heading)
				heading.parentNode.insertBefore(self.renderPresets(),
					heading.nextSibling);
			else if (section)
				section.insertBefore(self.renderPresets(), section.firstChild);

			return E([], [ common.style(), formNode ]);
		});
	}
});
